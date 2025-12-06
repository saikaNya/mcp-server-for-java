import * as vscode from "vscode";
import { z } from "zod";
import { waitForJavaLspReady } from "../utils/java-lsp";

export const getSourceCodeByFQNSchema = z.object({
    fullyQualifiedName: z.string().describe("The fully qualified name (FQN) of the Java type to retrieve its source code."),
    uriPath: z.string().optional().describe("The vscode uri path. Only required when the fully qualified name cannot uniquely identify a single uri."),
    workspace: z.string().describe("Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise.")
})

interface GetSourceCodeByFQNResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
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
        const sourceCode = document.getText();
        
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