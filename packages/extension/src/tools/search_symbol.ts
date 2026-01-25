import * as vscode from "vscode";
import { z } from "zod";
import { categoryToSymbolKinds, SymbolCategory, SymbolCategoryEnum, symbolKindToString, buildJavaFqn, detectLanguage } from "./common";

/**
 * 匹配模式
 * - strict: 严格匹配（只有名称完全相同或全限定名相同）
 * - fuzzy: 模糊匹配（部分匹配即可）
 */
export const MatchModeEnum = z.enum(['strict', 'fuzzy']);
export type MatchMode = z.infer<typeof MatchModeEnum>;

export const searchSymbolSchema = z.object({
  symbolName: z.string().describe("The symbol name to search for."),
  symbolCategories: z.array(SymbolCategoryEnum).optional().describe(
    "Filter symbols by category. If not provided, no filtering is applied. Available categories: " +
    "'type' (Class, Interface, Enum, Struct), " +
    "'callable' (Method, Function, Constructor, Operator), " +
    "'data' (Property, Field, Variable, Constant, EnumMember), " +
    "'container' (File, Module, Namespace, Package), " +
    "'other' (Others...). "
  ),
  matchMode: MatchModeEnum.optional().default('strict').describe(
    "Match mode for symbol search. 'strict' (default) matches only when the simple name or fully qualified name is exactly the same. 'fuzzy' matches when partial match is found."
  ),
  workspacePaths: z.array(z.string()).describe("the absolute paths of the workspaces in which to search."),
})

interface SymbolResultItem {
  symbolName?: string;  // 只有非strict模式返回
  fqn?: string;         // 只有java返回
  symbolKind: string;
  uriPath?: string;     // java时当工作区中只有一个全限定名匹配时，不返回；非java一定返回
  lineRange: [number, number];
}

interface SearchSymbolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * 从符号名称中提取简单名称（最后一个 . 或 :: 后的部分）
 */
function extractSimpleName(symbolName: string): string {
  // 先尝试 :: (C++风格)
  const doubleColonIndex = symbolName.lastIndexOf('::');
  if (doubleColonIndex !== -1) {
    return symbolName.substring(doubleColonIndex + 2);
  }
  // 再尝试 . (Java/其他语言风格)
  const dotIndex = symbolName.lastIndexOf('.');
  if (dotIndex !== -1) {
    return symbolName.substring(dotIndex + 1);
  }
  return symbolName;
}

/**
 * 检查是否严格匹配
 */
function isStrictMatch(symbol: vscode.SymbolInformation, searchName: string, language: string): boolean {
  const simpleName = extractSimpleName(symbol.name);

  // 简单名称完全匹配
  if (simpleName === searchName) {
    return true;
  }

  // 对于 Java，还检查全限定名是否匹配
  if (language === 'java') {
    const fqn = buildJavaFqn(symbol);
    if (fqn === searchName) {
      return true;
    }
  }

  // 全名匹配
  if (symbol.name === searchName) {
    return true;
  }

  return false;
}

export async function searchSymbolTool(params: z.infer<typeof searchSymbolSchema>): Promise<SearchSymbolResult> {
  const name = params.symbolName;
  const categories = params.symbolCategories;
  const matchMode = params.matchMode ?? 'strict';

  // 构建允许的 SymbolKind 集合（如果指定了 categories）
  let allowedKinds: Set<vscode.SymbolKind> | null = null;
  if (categories && categories.length > 0) {
    allowedKinds = new Set<vscode.SymbolKind>();
    for (const category of categories) {
      for (const kind of categoryToSymbolKinds[category as SymbolCategory]) {
        allowedKinds.add(kind);
      }
    }
  }

  try {

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      name
    );

    if (!symbols || symbols.length === 0) {
      return {
        content: [{ type: 'text', text: '{}' }]
      };
    }

    // 按语言分组的结果
    const resultByLanguage: Record<string, SymbolResultItem[]> = {};

    // 用于追踪 Java FQN 出现次数
    const javaFqnCount = new Map<string, number>();

    // 第一遍：收集所有符号并检测语言，同时统计 Java FQN
    const symbolsWithLanguage: Array<{
      symbol: vscode.SymbolInformation;
      language: string;
      fqn?: string;
    }> = [];

    for (const symbol of symbols) {

      // 检测语言
      const language = await detectLanguage(symbol.location.uri);

      // 如果指定了 categories，进行过滤
      if (allowedKinds && !allowedKinds.has(symbol.kind)) {
        continue;
      }

      // 严格模式下进行匹配检查
      if (matchMode === 'strict' && !isStrictMatch(symbol, name, language)) {
        continue;
      }

      let fqn: string | undefined;
      if (language === 'java') {
        fqn = buildJavaFqn(symbol);
        javaFqnCount.set(fqn, (javaFqnCount.get(fqn) || 0) + 1);
      }

      symbolsWithLanguage.push({ symbol, language, fqn });
    }

    // 第二遍：构建返回结果
    for (const { symbol, language, fqn } of symbolsWithLanguage) {
      if (!resultByLanguage[language]) {
        resultByLanguage[language] = [];
      }

      const range = symbol.location.range;
      const lineRange: [number, number] = [range.start.line + 1, range.end.line + 1]; // 转为1-based

      const resultItem: SymbolResultItem = {
        symbolKind: symbolKindToString(symbol.kind),
        lineRange,
      };

      // 非 strict 模式返回 symbolName
      if (matchMode !== 'strict') {
        resultItem.symbolName = symbol.name;
      }

      if (language === 'java') {
        // Java: 返回 fqn
        resultItem.fqn = fqn;

        // Java: 当工作区中只有一个全限定名匹配时，不返回 uriPath
        if (fqn && (javaFqnCount.get(fqn) || 0) > 1) {
          resultItem.uriPath = symbol.location.uri.path;
        }
      } else {
        // 非 Java: 一定返回 uriPath
        resultItem.uriPath = symbol.location.uri.path;
      }

      resultByLanguage[language].push(resultItem);
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(resultByLanguage)
      }]
    };

  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching symbols: ${error}` }],
      isError: true
    };
  }
}
