import * as vscode from "vscode";
import { z } from "zod";
import { waitForJavaLspReady } from "../utils/java-lsp";
import { debug } from "../utils/logger";

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

    debug(`[getMethodRangesFromLsp] Document: ${document.uri.path}`);
    debug(`[getMethodRangesFromLsp] Symbols returned: ${symbols ? symbols.length : 'null/undefined'}`);

    if (!symbols || symbols.length === 0) {
        debug(`[getMethodRangesFromLsp] No symbols found, returning empty array`);
        return [];
    }

    const methods: MethodRange[] = [];

    // 递归收集所有方法符号
    function collectMethods(symbolList: vscode.DocumentSymbol[]) {
        for (const symbol of symbolList) {
            debug(`[getMethodRangesFromLsp] Symbol: ${symbol.name}, kind: ${symbol.kind}`);
            if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Constructor) {
                // 移除参数部分和泛型部分，只保留方法名
                // 例如: "jsonStrToObj(String, Class<T>) <T>" -> "jsonStrToObj"
                const methodName = symbol.name.replace(/\(.*$/, '').trim(); // 移除参数部分，只保留方法名
                debug(`[getMethodRangesFromLsp] Found method: ${methodName}`);
                methods.push({
                    name: methodName,
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
    debug(`[getMethodRangesFromLsp] Total methods found: ${methods.length}`);
    return methods;
}

/**
 * 根据方法名列表过滤源代码，只保留指定的方法（使用 LSP 提供的范围信息）
 */
async function filterMethodsWithLsp(document: vscode.TextDocument, sourceCode: string, methodNames: string[]): Promise<string> {
    debug(`[filterMethodsWithLsp] Filtering methods: ${methodNames.join(', ')}`);
    const methods = await getMethodRangesFromLsp(document);

    if (methods.length === 0) {
        debug(`[filterMethodsWithLsp] No methods found by LSP, returning original source code`);
        return sourceCode;
    }

    debug(`[filterMethodsWithLsp] Found ${methods.length} methods, filtering...`);

    // 找到所有方法的最大结束位置
    const maxEndOffset = Math.max(...methods.map(m => m.endOffset));

    // 保存类的尾部内容（最后一个方法之后的所有内容，包括类的结束大括号）
    const classTail = sourceCode.substring(maxEndOffset);
    debug(`[filterMethodsWithLsp] Preserved class tail (${classTail.length} chars): ${classTail.substring(0, 50).replace(/\n/g, '\\n')}...`);

    // 按位置从后向前排序，这样删除时不会影响前面的索引
    const sortedMethods = [...methods].sort((a, b) => b.startOffset - a.startOffset);

    // 只处理到最后一个方法结束位置之前的内容
    let result = sourceCode.substring(0, maxEndOffset);

    for (const method of sortedMethods) {
        if (!methodNames.includes(method.name)) {
            debug(`[filterMethodsWithLsp] Removing method: ${method.name}`);
            // 删除不匹配的方法
            const beforeMethod = result.substring(0, method.startOffset);
            const afterMethod = result.substring(method.endOffset);

            // 清理多余的空行
            const trimmedBefore = beforeMethod.replace(/\n\s*$/, '\n');
            const trimmedAfter = afterMethod.replace(/^\s*\n/, '\n');

            result = trimmedBefore + trimmedAfter;
        } else {
            debug(`[filterMethodsWithLsp] Keeping method: ${method.name}`);
        }
    }

    // 重新添加类的尾部内容
    result = result + classTail;

    // 清理连续的多个空行为最多两个
    result = result.replace(/\n{3,}/g, '\n\n');

    debug(`[filterMethodsWithLsp] Filtering complete`);
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
                debug(`Failed to filter methods for ${fqn} (methods: ${params.methodNames.join(', ')}): ${filterError}`);
                // 过滤失败时返回原始源代码
            }
        }

        // 检查源代码长度是否超出限制
        if (sourceCode.length > maxOutputLength) {
            return {
                content: [{
                    type: 'text',
                    text: `Error: Source code length (${sourceCode.length} characters) exceeds the maximum output length limit (${maxOutputLength} characters). ${params.methodNames && params.methodNames.length > 0 ? '' : 'You can specify methodNames parameter to retrieve only specific methods and reduce the output size.'}`
                }],
                isError: true
            };
        }

        return {
            content: [{
                type: 'text',
                text: `\`\`\`java:${exactMatch.location.uri.path}
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