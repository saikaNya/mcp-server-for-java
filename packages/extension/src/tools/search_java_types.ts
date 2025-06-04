import * as vscode from "vscode";
import { z } from "zod";
import { WorkspaceSwitcher } from "./workspace_switcher";

export const searchJavaTypesSchema = z.object({
  name: z.string().describe("The name or partial name of the Java types (classes, enums, and interfaces) to search for."),
  workspacePath: z.string().describe("The absolute path of the user's workspace.")
})

interface SearchJavaTypesResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

export async function searchJavaTypesTool(params: z.infer<typeof searchJavaTypesSchema>): Promise<SearchJavaTypesResult> {
  const name = params.name;
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

  // Search for classes in dependencies
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

    // Filter possible non-Java types and extract fully qualified names
    const javaTypes = symbols
      .filter(symbol =>
        symbol.location.uri.fsPath.endsWith('.java') ||
        symbol.location.uri.fsPath.endsWith('.class') ||
        [vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum].includes(symbol.kind)
      )
      .filter(symbol => !symbol.name.trim().startsWith('@'))
      .map(symbol => {
        // Try to build fully qualified name from symbol container name and symbol name
        let fullyQualifiedName = symbol.name;

        if(symbol.name.includes('.')){
          return symbol.name
        }
        if (symbol.containerName && symbol.containerName.length > 0) {
          fullyQualifiedName = `${symbol.containerName}.${symbol.name}`;
        }
        return fullyQualifiedName;
      });

    return {
      content: [{
        type: 'text',
        text: javaTypes.length > 0
          ? '[' + javaTypes.join(',') + ']'
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


