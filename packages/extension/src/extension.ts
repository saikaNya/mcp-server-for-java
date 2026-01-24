import * as vscode from 'vscode';
import { registerVSCodeCommands } from './commands';
import { SocketServer } from './sock-transport';
import { initLogger } from './utils/logger';
import { registerWorkspaces, unregisterByPid } from './utils/router-table';

const extensionDisplayName = 'MCP Server for Java';

let socketServer: SocketServer;
let currentWorkspaces: string[] = [];

export const activate = async (context: vscode.ExtensionContext) => {
  // Create the output channel for logging
  const outputChannel = vscode.window.createOutputChannel(extensionDisplayName);
  initLogger(outputChannel);
  outputChannel.appendLine(`Activating ${extensionDisplayName}...`);

  // Get all workspace paths (supports multi-root workspaces)
  currentWorkspaces = vscode.workspace.workspaceFolders?.map(folder => folder.uri.fsPath) || [];
  outputChannel.appendLine(`Workspace paths: ${currentWorkspaces.join(', ')}`);

  // Start socket server
  async function startServer() {
    outputChannel.appendLine(`Starting Socket Server (PID: ${process.pid})...`);
    socketServer = new SocketServer(outputChannel, currentWorkspaces);

    await socketServer.start();

    // Register workspaces in router table with PID
    if (currentWorkspaces.length > 0) {
      await registerWorkspaces(currentWorkspaces, process.pid);
      outputChannel.appendLine(`Registered workspaces with PID ${process.pid}: ${currentWorkspaces.join(', ')}`);
    }
  }

  // Start server
  try {
    await startServer();
    outputChannel.appendLine(`Socket Server started on: ${socketServer.getSocketPath()}`);
  } catch (err) {
    outputChannel.appendLine(`Failed to start Socket Server: ${err}`);
  }

  // Register VSCode commands
  registerVSCodeCommands(context, socketServer, outputChannel);

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
  
  // Close socket server
  if (socketServer) {
    await socketServer.close();
  }
}
