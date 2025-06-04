import * as vscode from "vscode";
import { z } from "zod";
import { WorkspaceSwitcher } from "./workspace_switcher";

export const getSourceCodeByFQNSchema = z.object({
    fullyQualifiedName: z.string().describe("The fully qualified name (FQN) of the Java type to retrieve its source code."),
    workspacePath: z.string().describe("The absolute path of the user's workspace.")
})

interface GetSourceCodeByFQNResult {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
}

export async function getSourceCodeByFQNTool(params: z.infer<typeof getSourceCodeByFQNSchema>): Promise<GetSourceCodeByFQNResult> {
    const fqn = params.fullyQualifiedName;
    const requestedWorkspacePath = params.workspacePath;

    // Check workspace path requirements using basic workspace switcher
    if (requestedWorkspacePath) {
        const workspaceSwitcher = WorkspaceSwitcher.getInstance();
        const workspaceResult = await workspaceSwitcher.handleWorkspaceRequirement(requestedWorkspacePath);
        
        if (!workspaceResult.success) {
            return {
                content: [{ 
                    type: 'text', 
                    text: workspaceSwitcher.formatWorkspaceError(workspaceResult)
                }],
                isError: true
            };
        }
    }

    try {
        // Get maximum output character configuration
        const config = vscode.workspace.getConfiguration('mcpServer');
        const maxOutputLength = config.get<number>('maxOutputLength') || 70000;

        // Use vscode.workspace.executeWorkspaceSymbolProvider to find symbols directly
        const symbolDetails = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            fqn
        );

        if (!symbolDetails || symbolDetails.length === 0) {
            return {
                content: [{ type: 'text', text: `No Java type found with the fully qualified name: ${fqn}` }]
            };
        }

        // Find exact match symbol
        const exactMatch = symbolDetails.find(symbol => {
            let symbolFQN = symbol.name;
            if (symbol.name.includes('.')) {
                symbolFQN = symbol.name;
            } else if (symbol.containerName && symbol.containerName.length > 0) {
                symbolFQN = `${symbol.containerName}.${symbol.name}`;
            }
            return symbolFQN === fqn;
        });

        if (!exactMatch) {
            return {
                content: [{ type: 'text', text: `No exact match found for the fully qualified name: ${fqn}` }]
            };
        }

        // Get document content where the symbol is located
        const document = await vscode.workspace.openTextDocument(exactMatch.location.uri);
        const fullText = document.getText();

        // Check if exceeds maximum output length
        if (fullText.length > maxOutputLength) {
            return {
                content: [{ 
                    type: 'text', 
                    text: `Source code for ${fqn} is too large (${fullText.length} characters). Maximum allowed is ${maxOutputLength} characters. Please increase the mcpServer.maxOutputLength setting or request a specific method/field.` 
                }],
                isError: true
            };
        }

        return {
            content: [{ type: 'text', text: fullText }]
        };

    } catch (error) {
        return {
            content: [{ type: 'text', text: `Error retrieving source code for ${fqn}: ${error}` }],
            isError: true
        };
    }
} 