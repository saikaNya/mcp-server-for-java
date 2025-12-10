import * as vscode from "vscode";
import { z } from "zod";
import { waitForJavaLspReady } from "../utils/java-lsp";

// 懒加载获取 outputChannel（与主扩展使用相同的名称）
let _outputChannel: vscode.OutputChannel | undefined;
function getOutputChannel(): vscode.OutputChannel {
    if (!_outputChannel) {
        _outputChannel = vscode.window.createOutputChannel('MCP Server for Java');
    }
    return _outputChannel;
}

export const getSourceCodeByFQNSchema = z.object({
    fullyQualifiedName: z.string().describe("The fully qualified name (FQN) of the Java type to retrieve its source code."),
    workspace: z.string().describe("Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise."),
    methodNames: z.array(z.string()).optional().describe("Optional list of method names to filter. If provided, only the specified methods will be shown, other methods will be hidden while preserving the rest of the class content."),
    uriPath: z.string().optional().describe("The vscode uri path. Only required when the fully qualified name cannot uniquely identify a single uri.")
})

interface GetSourceCodeByFQNResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

interface MethodRange {
    name: string;
    startOffset: number;
    endOffset: number;
}

/**
 * 使用 LSP 获取文档中所有方法的范围信息
 */
async function getMethodRangesFromLsp(document: vscode.TextDocument): Promise<MethodRange[]> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    );
    
    if (!symbols || symbols.length === 0) {
        return [];
    }
    
    const methods: MethodRange[] = [];
    
    // 递归收集所有方法符号
    function collectMethods(symbolList: vscode.DocumentSymbol[]) {
        for (const symbol of symbolList) {
            if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Constructor) {
                methods.push({
                    name: symbol.name.replace(/\(.*\)$/, ''), // 移除参数部分，只保留方法名
                    startOffset: document.offsetAt(symbol.range.start),
                    endOffset: document.offsetAt(symbol.range.end)
                });
            }
            // 递归处理嵌套符号（如内部类的方法）
            if (symbol.children && symbol.children.length > 0) {
                collectMethods(symbol.children);
            }
        }
    }
    
    collectMethods(symbols);
    return methods;
}

/**
 * 根据方法名列表过滤源代码，只保留指定的方法（使用 LSP 提供的范围信息）
 */
async function filterMethodsWithLsp(document: vscode.TextDocument, sourceCode: string, methodNames: string[]): Promise<string> {
    const methods = await getMethodRangesFromLsp(document);
    
    if (methods.length === 0) {
        return sourceCode;
    }
    
    // 按位置从后向前排序，这样删除时不会影响前面的索引
    const sortedMethods = [...methods].sort((a, b) => b.startOffset - a.startOffset);
    
    let result = sourceCode;
    for (const method of sortedMethods) {
        if (!methodNames.includes(method.name)) {
            // 删除不匹配的方法
            const beforeMethod = result.substring(0, method.startOffset);
            const afterMethod = result.substring(method.endOffset);
            
            // 清理多余的空行
            const trimmedBefore = beforeMethod.replace(/\n\s*$/, '\n');
            const trimmedAfter = afterMethod.replace(/^\s*\n/, '\n');
            
            result = trimmedBefore + trimmedAfter;
        }
    }
    
    // 清理连续的多个空行为最多两个
    result = result.replace(/\n{3,}/g, '\n\n');
    
    return result;
}

export async function getSourceCodeByFQNTool(params: z.infer<typeof getSourceCodeByFQNSchema>): Promise<GetSourceCodeByFQNResult> {
    const fqn = params.fullyQualifiedName;

    try {
        // 检查 Java LSP 是否就绪
        const lspCheck = await waitForJavaLspReady();
        if (!lspCheck.ready) {
            return {
                content: [{ type: 'text', text: lspCheck.errorMessage || 'Java Language Server is not ready.' }],
                isError: true
            };
        }

        // 获取最大输出字符数配置
        const config = vscode.workspace.getConfiguration('mcpServer');
        const maxOutputLength = config.get<number>('maxOutputLength') || 70000;

        // 直接使用vscode.workspace.executeWorkspaceSymbolProvider查找符号
        const symbolDetails = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            fqn
        );

        if (!symbolDetails || symbolDetails.length === 0) {
            return {
                content: [{ type: 'text', text: `No Java type found with the fully qualified name: ${fqn}` }]
            };
        }

        // 找到精确匹配的符号
        const exactMatches = symbolDetails.filter(symbol => {
            let symbolFQN = symbol.name;
            if (symbol.name.includes('.')) {
                symbolFQN = symbol.name;
            } else if (symbol.containerName && symbol.containerName.length > 0) {
                symbolFQN = `${symbol.containerName}.${symbol.name}`;
            }
            return symbolFQN === fqn;
        });

        if (exactMatches.length === 0) {
            return {
                content: [{ type: 'text', text: `Could not find exact match for type: ${fqn}` }]
            };
        }

        // 如果提供了 uriPath，则用它来进一步筛选
        let exactMatch = exactMatches[0];
        if (params.uriPath && exactMatches.length > 1) {
            // 标准化 uriPath：如果不是以 / 开头，则添加 /
            let normalizedUriPath = params.uriPath;
            if (!normalizedUriPath.startsWith('/')) {
                normalizedUriPath = '/' + normalizedUriPath;
            }
            
            // 检测是否为 Windows 路径（包含盘符如 /c: 或 /C:）
            const isWindowsPath = /^\/[a-zA-Z]:/.test(normalizedUriPath);
            
            const matchByUri = exactMatches.find(symbol => {
                const symbolPath = symbol.location.uri.path;
                if (isWindowsPath) {
                    // Windows 路径忽略大小写
                    return symbolPath.toLowerCase() === normalizedUriPath.toLowerCase();
                }
                return symbolPath === normalizedUriPath;
            });
            if (matchByUri) {
                exactMatch = matchByUri;
            }
        }

        // 获取源代码
        const document = await vscode.workspace.openTextDocument(exactMatch.location.uri);
        let sourceCode = document.getText();
        
        // 如果指定了方法名列表，则使用 LSP 过滤只保留指定的方法
        if (params.methodNames && params.methodNames.length > 0) {
            try {
                sourceCode = await filterMethodsWithLsp(document, sourceCode, params.methodNames);
            } catch (filterError) {
                getOutputChannel().appendLine(`Failed to filter methods for ${fqn} (methods: ${params.methodNames.join(', ')}): ${filterError}`);
                // 过滤失败时返回原始源代码
            }
        }
        
        // 检查源代码长度是否超出限制
        if (sourceCode.length > maxOutputLength) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Error: Source code length (${sourceCode.length} characters) exceeds the maximum output length limit (${maxOutputLength} characters). ` 
                }],
                isError: true
            };
        }
        
        return {    
            content: [{
                type: 'text',
                text: `\`\`\`java uriPath=${exactMatch.location.uri.path}
${sourceCode}
\`\`\``
            }]
        };

    } catch (error) {
        return {
            content: [{ type: 'text', text: `Error retrieving source code: ${error}` }],
            isError: true
        };
    }
} 