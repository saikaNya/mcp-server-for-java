import * as vscode from "vscode";
import { z } from "zod";
import { getCurrentIDE } from "../utils/detect-ide";
import { waitForJavaLspReady } from "../utils/java-lsp";
import { debug } from "../utils/logger";
import { getClient } from "../utils/request-context";

export const getSourceCodeByFQNSchema = z.object({
    fullyQualifiedName: z.string().describe("The fully qualified name (FQN) of the Java type to retrieve its source code."),
    workspace: z.string().describe("Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise."),
    methodNames: z.array(z.string()).optional().describe("Optional list of method names to filter. If provided, only methods whose simple name is in this list will be returned; all other methods will not be included in the result, but the rest of the class content is kept unchanged."),
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

interface MethodLineInfo {
    name: string;
    startLine: number; // 1-based line number
    endLine: number;   // 1-based line number
    startOffset: number;
    endOffset: number;
}

/**
 * 获取方法的行号信息
 * 注意：startOffset 会被调整到行首，以保留方法第一行的缩进
 */
function getMethodLineInfo(document: vscode.TextDocument, methods: MethodRange[]): MethodLineInfo[] {
    return methods.map(method => {
        const startPos = document.positionAt(method.startOffset);
        const endPos = document.positionAt(method.endOffset);

        // 将 startOffset 调整到行首，以保留方法第一行的完整缩进
        const lineStartPos = new vscode.Position(startPos.line, 0);
        const adjustedStartOffset = document.offsetAt(lineStartPos);

        return {
            name: method.name,
            startLine: startPos.line + 1, // 转为 1-based
            endLine: endPos.line + 1,     // 转为 1-based
            startOffset: adjustedStartOffset, // 使用调整到行首的偏移量
            endOffset: method.endOffset
        };
    });
}

/**
 * 为代码行添加行号前缀
 */
function addLineNumbers(code: string, startLine: number, lineNumberWidth: number): string {
    const lines = code.split('\n');
    return lines.map((line, index) => {
        const lineNum = startLine + index;
        const paddedLineNum = String(lineNum).padStart(lineNumberWidth, ' ');
        return `${paddedLineNum}|${line}`;
    }).join('\n');
}

/**
 * 根据方法名列表过滤源代码，只保留指定的方法（使用 LSP 提供的范围信息）
 * 保留的方法每行会添加原始行号前缀
 */
async function filterMethodsWithLsp(document: vscode.TextDocument, sourceCode: string, methodNames: string[]): Promise<string> {
    debug(`[filterMethodsWithLsp] Filtering methods: ${methodNames.join(', ')}`);
    const methods = await getMethodRangesFromLsp(document);

    if (methods.length === 0) {
        debug(`[filterMethodsWithLsp] No methods found by LSP, returning original source code`);
        return sourceCode;
    }

    debug(`[filterMethodsWithLsp] Found ${methods.length} methods, filtering...`);

    // 获取方法的行号信息
    const methodLineInfos = getMethodLineInfo(document, methods);

    // 找出需要保留的方法
    const keptMethods = methodLineInfos.filter(m => methodNames.includes(m.name));

    if (keptMethods.length === 0) {
        debug(`[filterMethodsWithLsp] No matching methods found`);
        // 没有匹配的方法，返回不包含任何方法的类结构
    }

    // 计算行号最大宽度（用于对齐）
    const maxLineNumber = Math.max(...keptMethods.map(m => m.endLine), 1);
    const lineNumberWidth = String(maxLineNumber).length;
    debug(`[filterMethodsWithLsp] Max line number: ${maxLineNumber}, width: ${lineNumberWidth}`);

    // 找到所有方法的最大结束位置
    const maxEndOffset = Math.max(...methods.map(m => m.endOffset));

    // 保存类的尾部内容（最后一个方法之后的所有内容，包括类的结束大括号）
    const classTail = sourceCode.substring(maxEndOffset);
    debug(`[filterMethodsWithLsp] Preserved class tail (${classTail.length} chars): ${classTail.substring(0, 50).replace(/\n/g, '\\n')}...`);

    // 按位置从后向前排序，这样处理时不会影响前面的索引
    const sortedMethodInfos = [...methodLineInfos].sort((a, b) => b.startOffset - a.startOffset);

    // 只处理到最后一个方法结束位置之前的内容
    let result = sourceCode.substring(0, maxEndOffset);

    for (const method of sortedMethodInfos) {
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
            debug(`[filterMethodsWithLsp] Keeping method with line numbers: ${method.name} (lines ${method.startLine}-${method.endLine})`);
            // 保留的方法，添加行号前缀
            const beforeMethod = result.substring(0, method.startOffset);
            const methodCode = result.substring(method.startOffset, method.endOffset);
            const afterMethod = result.substring(method.endOffset);

            // 为方法代码添加行号
            const methodWithLineNumbers = addLineNumbers(methodCode, method.startLine, lineNumberWidth);

            result = beforeMethod + methodWithLineNumbers + afterMethod;
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
            let normalizedUriPath = params.uriPath.replace(/\\/g, '/')
                .replace(/\/+$/, '')
                .toLowerCase();

            const matchByUri = exactMatches.find(symbol => {
                const symbolPath = symbol.location.uri.path;
                // 路径忽略大小写
                return symbolPath.toLowerCase() === normalizedUriPath ||
                    symbolPath.toLowerCase().endsWith(normalizedUriPath);
            });
            if (matchByUri) {
                exactMatch = matchByUri;
            }
        }

        // 获取源代码
        const document = await vscode.workspace.openTextDocument(exactMatch.location.uri);
        let sourceCode = document.getText();
        const lineCount = document.lineCount;

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

        // 判断是否为项目源代码，如果是则使用相对路径
        let displayPath = exactMatch.location.uri.path;
        debug(`[getSourceCodeByFQN] location.uri.path: ${displayPath}`);

        let isProjectSource = false;
        // 使用 getWorkspaceFolder 获取文件所在的工作区，支持多工作区场景
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(exactMatch.location.uri);
        if (workspaceFolder) {
            const workspacePath = workspaceFolder.uri.path;
            debug(`[getSourceCodeByFQN] workspacePath: ${workspacePath}`);
            const uriPath = exactMatch.location.uri.path;

            // 忽略大小写比较
            const uriPathForCompare = uriPath.toLowerCase();
            const workspaceForCompare = workspacePath.toLowerCase();

            if (uriPathForCompare.startsWith(workspaceForCompare)) {
                // 项目源代码，使用相对路径
                displayPath = uriPath.substring(workspacePath.length);
                // 确保相对路径不以 / 开头
                if (displayPath.startsWith('/')) {
                    displayPath = displayPath.substring(1);
                }
                isProjectSource = true;
            }
        }

        debug(`[getSourceCodeByFQN] displayPath: ${displayPath}`);

        // 判断是否使用 Cursor 代码格式
        const client = getClient();
        const isCursorClient = client
            ? client.toLowerCase() === 'cursor'
            : getCurrentIDE() === 'cursor';

        let formattedCode: string;
        if (isCursorClient && isProjectSource) {
            // Cursor 格式: ```startLine:endLine:displayPath
            formattedCode = `\`\`\`1:${lineCount}:${displayPath}
${sourceCode}
\`\`\``;
        } else {
            // 默认格式: ```java:displayPath
            formattedCode = `\`\`\`java:${displayPath}
${sourceCode}
\`\`\``;
        }

        return {
            content: [{
                type: 'text',
                text: formattedCode
            }]
        };

    } catch (error) {
        return {
            content: [{ type: 'text', text: `Error retrieving source code: ${error}` }],
            isError: true
        };
    }
} 