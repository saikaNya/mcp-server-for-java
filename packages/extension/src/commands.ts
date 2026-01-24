import * as vscode from 'vscode';
import { SocketServer } from './sock-transport';

export function registerVSCodeCommands(
  context: vscode.ExtensionContext,
  socketServer: SocketServer,
  outputChannel: vscode.OutputChannel
) {
  // COMMAND PALETTE COMMAND: Stop the MCP Server
  context.subscriptions.push(
    vscode.commands.registerCommand('mcpServer.stopServer', async () => {
      try {
        await socketServer.close();
        outputChannel.appendLine('Socket Server stopped.');
      } catch (err) {
        vscode.window.showWarningMessage('Socket Server is not running.');
        outputChannel.appendLine('Attempted to stop the Socket Server, but it is not running.');
      }
    }),
  );
}
