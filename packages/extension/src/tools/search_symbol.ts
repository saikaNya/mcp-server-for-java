import * as vscode from "vscode";
import { z } from "zod";
import { buildJavaFqn } from "./common";

/**
 * 匹配模式
 * - strict: 严格匹配（只有名称完全相同或全限定名相同）
 * - fuzzy: 模糊匹配（部分匹配即可）
 */
export const MatchModeEnum = z.enum(['strict', 'fuzzy']);
export type MatchMode = z.infer<typeof MatchModeEnum>;

export const searchJavaTypesSchema = z.object({
  name: z.string().describe("The name or partial name of the Java types (classes, enums, and interfaces) to search for."),
  matchMode: MatchModeEnum.optional().default('strict').describe(
    "Match mode for search. 'strict' (default) matches only when the simple name or fully qualified name is exactly the same. 'fuzzy' matches when partial match is found."
  ),
  workspacePaths: z.array(z.string()).describe("the absolute paths of the workspaces in which to search."),
})

interface SearchSymbolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/**
 * 从符号名称中提取简单名称（最后一个 . 后的部分）
 */
function extractSimpleName(symbolName: string): string {
  const dotIndex = symbolName.lastIndexOf('.');
  if (dotIndex !== -1) {
    return symbolName.substring(dotIndex + 1);
  }
  return symbolName;
}

/**
 * 检查是否严格匹配
 */
function isStrictMatch(symbol: vscode.SymbolInformation, searchName: string): boolean {
  const simpleName = extractSimpleName(symbol.name);

  if (simpleName === searchName) {
    return true;
  }

  const fqn = buildJavaFqn(symbol);
  if (fqn === searchName) {
    return true;
  }

  if (symbol.name === searchName) {
    return true;
  }

  return false;
}

export async function searchJavaTypesTool(params: z.infer<typeof searchJavaTypesSchema>): Promise<SearchSymbolResult> {
  const name = params.name;
  const matchMode = params.matchMode ?? 'strict';

  try {
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      name
    );

    if (!symbols || symbols.length === 0) {
      return {
        content: [{ type: 'text', text: '[]' }]
      };
    }

    // 过滤 Java 类型并提取全限定名
    const javaTypesWithUri = symbols
      .filter(symbol =>
        symbol.location.uri.fsPath.endsWith('.java') ||
        symbol.location.uri.fsPath.endsWith('.class') ||
        [vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum].includes(symbol.kind)
      )
      .filter(symbol => !symbol.name.trim().startsWith('@'))
      .filter(symbol => matchMode !== 'strict' || isStrictMatch(symbol, name))
      .map(symbol => {
        const fqn = buildJavaFqn(symbol);
        return { fqn, uriPath: symbol.location.uri.path };
      });

    // 统计每个全限定名出现的次数
    const fqnCount = new Map<string, number>();
    for (const item of javaTypesWithUri) {
      fqnCount.set(item.fqn, (fqnCount.get(item.fqn) || 0) + 1);
    }

    // 根据是否重复决定返回格式
    const javaTypes = javaTypesWithUri.map(item => {
      if ((fqnCount.get(item.fqn) || 0) > 1) {
        return { fqn: item.fqn, uriPath: item.uriPath };
      }
      return item.fqn;
    });

    return {
      content: [{
        type: 'text',
        text: javaTypes.length > 0
          ? JSON.stringify(javaTypes)
          : '[]'
      }]
    };

  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching symbols: ${error}` }],
      isError: true
    };
  }
}
