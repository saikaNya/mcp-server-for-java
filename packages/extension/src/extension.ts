import * as vscode from 'vscode';
import { registerVSCodeCommands } from './commands';
import { createMcpServer, extensionDisplayName } from './mcp-server';
import { SocketTransport } from './sock-transport';
import { initLogger } from './utils/logger';
import { registerWorkspaces, unregisterByPid } from './utils/router-table';

let transport: SocketTransport;
let currentWorkspaces: string[] = [];

export const activate = async (context: vscode.ExtensionContext) => {
  console.log('LMLMLM', vscode.lm.tools);

  // Create the output channel for logging
  const outputChannel = vscode.window.createOutputChannel(extensionDisplayName);
  initLogger(outputChannel);
  outputChannel.appendLine(`Activating ${extensionDisplayName}...`);

  // Get all workspace paths (supports multi-root workspaces)
  currentWorkspaces = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) || [];
  outputChannel.appendLine(`Workspace paths: ${currentWorkspaces.join(', ')}`);

  // Initialize the MCP server instance
  const mcpServer = createMcpServer(outputChannel);

  // Server start function with socket transport
  async function startServer() {
    outputChannel.appendLine(`DEBUG: Starting MCP Server with Socket transport (PID: ${process.pid})...`);
    transport = new SocketTransport(outputChannel, currentWorkspaces);

    await mcpServer.connect(transport); // connect calls transport.start()

    // Register workspaces in router table with PID
    if (currentWorkspaces.length > 0) {
      await registerWorkspaces(currentWorkspaces, process.pid);
      outputChannel.appendLine(`Registered workspaces with PID ${process.pid}: ${currentWorkspaces.join(', ')}`);
    }
  }

  // Start server with socket transport
  try {
    await startServer();
    outputChannel.appendLine(`MCP Server started on socket: ${transport.getSocketPath()}`);
  } catch (err) {
    outputChannel.appendLine(`Failed to start MCP Server: ${err}`);
  }

  // Register VSCode commands
  registerVSCodeCommands(context, mcpServer, outputChannel);

  // Register cleanup on deactivation
  context.subscriptions.push({
    dispose: async () => {
      await unregisterByPid(process.pid);
      outputChannel.appendLine(`Unregistered PID ${process.pid}`);
    }
  });

  // Listen for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (_event) => {
      const newWorkspaces = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) || [];
      outputChannel.appendLine(`Workspace folders changed. New paths: ${newWorkspaces.join(', ')}`);
      
      // Update the registered workspaces
      currentWorkspaces = newWorkspaces;
      if (currentWorkspaces.length > 0) {
        await registerWorkspaces(currentWorkspaces, process.pid);
        outputChannel.appendLine(`Updated registered workspaces for PID ${process.pid}`);
      }
    })
  );

  outputChannel.appendLine(`${extensionDisplayName} activated.`);
};

export async function deactivate() {
  // Unregister from router table
  await unregisterByPid(process.pid);
  
  // Close transport
  if (transport) {
    await transport.close();
  }
}
