import * as vscode from 'vscode';
import { BidiHttpTransport } from './bidi-http-transport';
import { registerVSCodeCommands } from './commands';
import { createMcpServer, extensionDisplayName } from './mcp-server';
import { DIFF_VIEW_URI_SCHEME } from './utils/DiffViewProvider';
import { findAvailablePort, registerWorkspace, unregisterWorkspace, listWorkspaces, RouterEntry } from './utils/router-table';

// MCP Server のステータスを表示するステータスバーアイテム
let serverStatusBarItem: vscode.StatusBarItem;
let transport: BidiHttpTransport;
let currentWorkspace: string | undefined;
let currentPort: number | undefined;

// ステータスバーを更新する関数
function updateServerStatusBar(status: 'running' | 'stopped' | 'starting' | 'tool_list_updated', port?: number) {
  if (!serverStatusBarItem) {
    return;
  }

  const portInfo = port ? `:${port}` : '';

  switch (status) {
    case 'running':
      serverStatusBarItem.text = `$(server) MCP Server${portInfo}`;
      serverStatusBarItem.tooltip = `MCP Server is running on port ${port || 'unknown'}\nWorkspace: ${currentWorkspace || 'unknown'}`;
      serverStatusBarItem.command = 'mcpServer.showWorkspaces';
      break;
    case 'starting':
      serverStatusBarItem.text = '$(sync~spin) MCP Server';
      serverStatusBarItem.tooltip = 'Starting...';
      serverStatusBarItem.command = undefined;
      break;
    case 'tool_list_updated':
      serverStatusBarItem.text = `$(warning) MCP Server${portInfo}`;
      serverStatusBarItem.tooltip = 'Tool list updated - Restart MCP Client';
      serverStatusBarItem.command = 'mcpServer.showWorkspaces';
      break;
    case 'stopped':
    default:
      serverStatusBarItem.text = '$(circle-slash) MCP Server';
      serverStatusBarItem.tooltip = 'MCP Server is not running';
      serverStatusBarItem.command = 'mcpServer.toggleActiveStatus';
      break;
  }
  serverStatusBarItem.show();
}

export const activate = async (context: vscode.ExtensionContext) => {
  console.log('LMLMLM', vscode.lm.tools);

  // Create the output channel for logging
  const outputChannel = vscode.window.createOutputChannel(extensionDisplayName);
  outputChannel.appendLine(`Activating ${extensionDisplayName}...`);

  // Get current workspace path
  currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  // Initialize the MCP server instance
  const mcpServer = createMcpServer(outputChannel);

  // Create status bar item
  serverStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  context.subscriptions.push(serverStatusBarItem);

  // Server start function with dynamic port allocation
  async function startServer(port?: number) {
    // If no port specified, find an available one (prioritizing 60100)
    if (port === undefined) {
      port = await findAvailablePort();
    }
    
    currentPort = port;
    outputChannel.appendLine(`DEBUG: Starting MCP Server on port ${port}...`);
    transport = new BidiHttpTransport(port, outputChannel, currentWorkspace);
    
    // サーバー状態変更のイベントハンドラを設定
    transport.onServerStatusChanged = (status) => {
      updateServerStatusBar(status, currentPort);
    };

    await mcpServer.connect(transport); // connect calls transport.start().
    
    // Register workspace in router table
    if (currentWorkspace) {
      await registerWorkspace(currentWorkspace, port, process.pid);
      outputChannel.appendLine(`Registered workspace ${currentWorkspace} with port ${port}`);
    }
    
    updateServerStatusBar(transport.serverStatus, port);
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

  // Register command to show all workspaces
  context.subscriptions.push(
    vscode.commands.registerCommand('mcpServer.showWorkspaces', async () => {
      const workspaces = await listWorkspaces();
      if (workspaces.length === 0) {
        vscode.window.showInformationMessage('No MCP Server instances registered.');
        return;
      }

      const items = workspaces.map((entry: RouterEntry) => ({
        label: entry.workspace === currentWorkspace ? `$(check) ${entry.workspace}` : entry.workspace,
        description: `Port: ${entry.port}`,
        detail: `Last updated: ${new Date(entry.lastUpdated).toLocaleString()}`,
        entry,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'All registered MCP Server instances',
        title: 'MCP Server Workspaces',
      });

      if (selected) {
        vscode.window.showInformationMessage(`Workspace: ${selected.entry.workspace}\nPort: ${selected.entry.port}`);
      }
    })
  );

  // Start server with dynamic port allocation (prioritizing 60100)
  try {
    await startServer(); // No port specified, will auto-allocate
    outputChannel.appendLine(`MCP Server started on port ${currentPort}.`);
  } catch (err) {
    outputChannel.appendLine(`Failed to start MCP Server: ${err}`);
  }

  // Register VSCode commands
  registerVSCodeCommands(context, mcpServer, outputChannel, startServer, transport);

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
