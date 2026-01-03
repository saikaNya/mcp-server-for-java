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

// 行状态枚举
const LineState = {
    PENDING: 1,   // 待定（保持原样）
    KEEP: 2,      // 保留（添加行号）
    DELETE: 3     // 删除
} as const;

/**
 * 根据方法名列表过滤源代码，只保留指定的方法（使用基于行的状态管理）
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

    // 分离需要保留和需要删除的方法
    const keptMethods = methodLineInfos.filter(m => methodNames.includes(m.name));
    const removedMethods = methodLineInfos.filter(m => !methodNames.includes(m.name));

    debug(`[filterMethodsWithLsp] Methods to keep: ${keptMethods.map(m => `${m.name}(${m.startLine}-${m.endLine})`).join(', ')}`);
    debug(`[filterMethodsWithLsp] Methods to remove: ${removedMethods.map(m => `${m.name}(${m.startLine}-${m.endLine})`).join(', ')}`);

    if (keptMethods.length === 0) {
        debug(`[filterMethodsWithLsp] No matching methods found`);
        throw new Error(`No matching methods found for: ${methodNames.join(', ')}`);
    }

    // 将源代码按行分割
    const lines = sourceCode.split('\n');
    const totalLines = lines.length;

    // 创建行状态数组，索引0不使用（行号是1-based）
    const lineStates: number[] = new Array(totalLines + 1).fill(LineState.PENDING);

    // 第一步：标记所有需要保留的方法的行为 KEEP
    for (const method of keptMethods) {
        debug(`[filterMethodsWithLsp] Marking lines ${method.startLine}-${method.endLine} as KEEP for method: ${method.name}`);
        for (let line = method.startLine; line <= method.endLine; line++) {
            lineStates[line] = LineState.KEEP;
        }
    }

    // 第二步：处理需要删除的方法
    for (const method of removedMethods) {
        // 检查这个要删除的方法是否完全包含某个保留的方法
        const containsKeptMethod = keptMethods.some(kept =>
            method.startLine <= kept.startLine && method.endLine >= kept.endLine
        );

        if (containsKeptMethod) {
            debug(`[filterMethodsWithLsp] Method ${method.name}(${method.startLine}-${method.endLine}) contains a kept method, skipping deletion`);
            continue;
        }

        // 标记该方法范围内的行为 DELETE（但不覆盖已标记为 KEEP 的行）
        debug(`[filterMethodsWithLsp] Marking lines ${method.startLine}-${method.endLine} as DELETE for method: ${method.name}`);
        for (let line = method.startLine; line <= method.endLine; line++) {
            if (lineStates[line] !== LineState.KEEP) {
                lineStates[line] = LineState.DELETE;
            }
        }
    }

    // 统计各状态的行数
    let pendingCount = 0, keepCount = 0, deleteCount = 0;
    for (let i = 1; i <= totalLines; i++) {
        if (lineStates[i] === LineState.PENDING) pendingCount++;
        else if (lineStates[i] === LineState.KEEP) keepCount++;
        else if (lineStates[i] === LineState.DELETE) deleteCount++;
    }
    debug(`[filterMethodsWithLsp] Line states - PENDING: ${pendingCount}, KEEP: ${keepCount}, DELETE: ${deleteCount}`);

    // 计算行号最大宽度（用于对齐）
    const maxLineNumber = Math.max(...keptMethods.map(m => m.endLine), 1);
    const lineNumberWidth = String(maxLineNumber).length;
    debug(`[filterMethodsWithLsp] Line number width: ${lineNumberWidth}`);

    // 第三步：根据状态处理每一行
    const resultLines: string[] = [];
    let consecutiveEmptyLines = 0;

    for (let lineNum = 1; lineNum <= totalLines; lineNum++) {
        const state = lineStates[lineNum];
        const line = lines[lineNum - 1]; // lines 数组是0-based

        if (state === LineState.DELETE) {
            // 删除该行，不添加到结果
            continue;
        }

        // 处理连续空行（最多保留2个）
        if (line.trim() === '') {
            consecutiveEmptyLines++;
            if (consecutiveEmptyLines > 2) {
                continue;
            }
        } else {
            consecutiveEmptyLines = 0;
        }

        if (state === LineState.KEEP) {
            // 保留的行，添加行号前缀
            const paddedLineNum = String(lineNum).padStart(lineNumberWidth, ' ');
            resultLines.push(`${paddedLineNum}|${line}`);
        } else {
            // 待定的行，保持原样
            resultLines.push(line);
        }
    }

    const result = resultLines.join('\n');
    debug(`[filterMethodsWithLsp] Filtering complete, result lines: ${resultLines.length}, result length: ${result.length}`);
    debug(`[filterMethodsWithLsp] Final result (first 300 chars): ${result.substring(0, 300).replace(/\n/g, '\\n')}`);

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
                // 检查原始源代码是否包含任意一个方法名
                const hasAnyMethod = params.methodNames.some(methodName => sourceCode.includes(methodName));
                if (hasAnyMethod) {
                    // 源代码中包含方法名，返回原始源代码
                    debug(`[getSourceCodeByFQN] Found method name in source code, returning original source`);
                } else {
                    // 源代码中不包含任何方法名，返回错误
                    return {
                        content: [{ type: 'text', text: `Error filtering methods: ${filterError instanceof Error ? filterError.message : String(filterError)}` }],
                        isError: true
                    };
                }
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