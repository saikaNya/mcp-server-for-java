import * as vscode from 'vscode';
import { BidiHttpTransport } from './bidi-http-transport';
import { registerVSCodeCommands } from './commands';
import { createMcpServer, extensionDisplayName } from './mcp-server';
import { DIFF_VIEW_URI_SCHEME } from './utils/DiffViewProvider';
import { findAvailablePort, registerWorkspace, unregisterWorkspace } from './utils/router-table';

let transport: BidiHttpTransport;
let currentWorkspace: string | undefined;
let currentPort: number | undefined;

export const activate = async (context: vscode.ExtensionContext) => {
  console.log('LMLMLM', vscode.lm.tools);

  // Create the output channel for logging
  const outputChannel = vscode.window.createOutputChannel(extensionDisplayName);
  outputChannel.appendLine(`Activating ${extensionDisplayName}...`);

  // Check for extension version update and open extension page
  const extensionId = 'saika.mcp-server-for-java';
  const extension = vscode.extensions.getExtension(extensionId);
  const currentVersion = extension?.packageJSON.version as string | undefined;
  const previousVersion = context.globalState.get<string>('extensionVersion');

  if (currentVersion && currentVersion !== previousVersion) {
    // Save current version
    await context.globalState.update('extensionVersion', currentVersion);

    // If previous version exists (update, not fresh install), open extension page
    if (previousVersion) {
      outputChannel.appendLine(`Extension updated from v${previousVersion} to v${currentVersion}, opening extension page...`);
      vscode.commands.executeCommand('extension.open', extensionId);
    } else {
      outputChannel.appendLine(`Extension v${currentVersion} installed for the first time.`);
    }
  }

  // Get current workspace path
  currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Initialize the MCP server instance
  const mcpServer = createMcpServer(outputChannel);

  // Server start function with dynamic port allocation
  async function startServer(port?: number) {
    // If no port specified, find an available one (prioritizing 60100)
    if (port === undefined) {
      port = await findAvailablePort();
    }
    
    currentPort = port;
    outputChannel.appendLine(`DEBUG: Starting MCP Server on port ${port}...`);
    transport = new BidiHttpTransport(port, outputChannel, currentWorkspace);

    await mcpServer.connect(transport); // connect calls transport.start().
    
    // Register workspace in router table
    if (currentWorkspace) {
      await registerWorkspace(currentWorkspace, port, process.pid);
      outputChannel.appendLine(`Registered workspace ${currentWorkspace} with port ${port}`);
    }
  }

  // Register Diff View Provider for file comparison functionality
  const diffContentProvider = new (class implements vscode.TextDocumentContentProvider {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return Buffer.from(uri.query, "base64").toString("utf-8");
    }
  })();

  // DiffViewProvider の URI スキームを mcp-diff に変更
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DIFF_VIEW_URI_SCHEME, diffContentProvider),
  );

  // Start server with dynamic port allocation (prioritizing 60100)
  try {
    await startServer(); // No port specified, will auto-allocate
    outputChannel.appendLine(`MCP Server started on port ${currentPort}.`);
  } catch (err) {
    outputChannel.appendLine(`Failed to start MCP Server: ${err}`);
  }

  // Register VSCode commands
  registerVSCodeCommands(context, mcpServer, outputChannel);

  // Register cleanup on deactivation
  context.subscriptions.push({
    dispose: async () => {
      if (currentWorkspace) {
        await unregisterWorkspace(currentWorkspace);
        outputChannel.appendLine(`Unregistered workspace ${currentWorkspace}`);
      }
    }
  });

  outputChannel.appendLine(`${extensionDisplayName} activated.`);
};

export async function deactivate() {
  // Unregister workspace from router table
  if (currentWorkspace) {
    await unregisterWorkspace(currentWorkspace);
  }
  // Clean-up is managed by the disposables added in the activate method.
}
