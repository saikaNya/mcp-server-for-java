import * as vscode from "vscode";
import { z } from "zod";

export const searchJavaTypesSchema = z.object({
  name: z.string().describe("The name or partial name of the Java types (classes, enums, and interfaces) to search for."),
  workspace: z.string().describe("Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise.")
})

interface SearchJavaTypesResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export async function searchJavaTypesTool(params: z.infer<typeof searchJavaTypesSchema>, outputChannel: vscode.OutputChannel): Promise<SearchJavaTypesResult> {
  const name = params.name
  // 搜索依赖包中的类
  try {
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      name
    );

    if (!symbols || symbols.length === 0) {
      return {
        content: [{ type: 'text', text: `[]` }]
      };
    }

    // 过滤可能的非Java类型并提取全限定名
    const javaTypesWithUri = symbols
      .filter(symbol =>
        symbol.location.uri.fsPath.endsWith('.java') ||
        symbol.location.uri.fsPath.endsWith('.class') ||
        [vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum].includes(symbol.kind)
      )
      .filter(symbol => !symbol.name.trim().startsWith('@'))
      .map(symbol => {
        // 尝试从符号容器名称和符号名称构建全限定名
        let fullyQualifiedName = symbol.name;

        const uri = symbol.location.uri;
        
        if (symbol.name.includes('.')) {
          return { fullyQualifiedName: symbol.name, uriPath: uri.path };
        }
        if (symbol.containerName && symbol.containerName.length > 0) {
          fullyQualifiedName = `${symbol.containerName}.${symbol.name}`;
        }
        return { fullyQualifiedName, uriPath: uri.path };
      });

    // 统计每个全限定名出现的次数
    const fqnCount = new Map<string, number>();
    for (const item of javaTypesWithUri) {
      fqnCount.set(item.fullyQualifiedName, (fqnCount.get(item.fullyQualifiedName) || 0) + 1);
    }

    // 根据是否重复决定返回格式
    const javaTypes = javaTypesWithUri.map(item => {
      if ((fqnCount.get(item.fullyQualifiedName) || 0) > 1) {
        // 存在相同全限定名，返回带 uriPath 的对象
        return { fqn: item.fullyQualifiedName, uriPath: item.uriPath };
      }
      // 全限定名唯一，返回不带 uriPath 的对象
      return item.fullyQualifiedName
    });

    return {
      content: [{
        type: 'text',
        text: javaTypes.length > 0
          ? JSON.stringify(javaTypes)
          : `[]`
      }]
    };

  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error searching symbols: ${error}` }],
      isError: true
    };
  }
}


