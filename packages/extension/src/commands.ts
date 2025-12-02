import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as vscode from 'vscode';

export function registerVSCodeCommands(
  context: vscode.ExtensionContext,
  mcpServer: McpServer,
  outputChannel: vscode.OutputChannel
) {
  // COMMAND PALETTE COMMAND: Stop the MCP Server
  context.subscriptions.push(
    vscode.commands.registerCommand('mcpServer.stopServer', () => {
      try {
        mcpServer.close();
        outputChannel.appendLine('MCP Server stopped.');
      } catch (err) {
        vscode.window.showWarningMessage('MCP Server is not running.');
        outputChannel.appendLine('Attempted to stop the MCP Server, but it is not running.');
        return;
      }
      mcpServer.close();
    }),
  );

}
