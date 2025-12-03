import * as vscode from "vscode";
import { z } from "zod";

export const getSourceCodeByFQNSchema = z.object({
    fullyQualifiedName: z.string().describe("The fully qualified name (FQN) of the Java type to retrieve its source code."),
    workspace: z.string().describe("Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise."),
    uriPath: z.string().optional().describe("The vscode uri path. Only required when the fully qualified name cannot uniquely identify a single uri.")
})

interface GetSourceCodeByFQNResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

export async function getSourceCodeByFQNTool(params: z.infer<typeof getSourceCodeByFQNSchema>): Promise<GetSourceCodeByFQNResult> {
    const fqn = params.fullyQualifiedName;

    try {
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
            const matchByUri = exactMatches.find(symbol => symbol.location.uri.path === params.uriPath);
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