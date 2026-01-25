import * as net from 'net';
import * as vscode from 'vscode';
import { searchSymbolTool } from './tools/search_symbol';
import { getSourceCodeByFQNTool } from './tools/get_source_code_by_fqn';
import { RequestContext, requestContextStorage } from './utils/request-context';
import { getSocketPath, ensureSocketDir, unregisterByPid, cleanupStaleSocketFile } from './utils/router-table';

const MIN_RELAY_VERSION = '0.0.2';
const VERSION_WARNING_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown between warnings

/**
 * Compare two semver version strings.
 * Returns -1 if v1 < v2, 0 if v1 == v2, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

// Track last warning time to avoid spamming
let lastVersionWarningTime = 0;

// Tool name to handler mapping
const toolHandlers: Record<string, (params: any) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>> = {
  'searchSymbol': searchSymbolTool,
  'getSourceCodeByFQN': getSourceCodeByFQNTool,
};

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
  };
  headers?: Record<string, string>;
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

/**
 * IPC Socket Server for MCP tools.
 * Uses Named Pipe on Windows, Unix Domain Socket on other platforms.
 */
export class SocketServer {
  private server?: net.Server;
  private connections: Set<net.Socket> = new Set();
  private socketPath: string;
  private pid: number;

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    _workspaces?: string[]  // Workspaces are registered separately via router-table
  ) {
    this.pid = process.pid;
    this.socketPath = getSocketPath(this.pid);
  }

  /**
   * Gets the PID this server is associated with.
   */
  getPid(): number {
    return this.pid;
  }

  /**
   * Gets the socket path this server is listening on.
   */
  getSocketPath(): string {
    return this.socketPath;
  }

  async start(): Promise<void> {
    // Ensure socket directory exists (Unix only)
    await ensureSocketDir();
    
    // Clean up any stale socket file from previous runs
    await cleanupStaleSocketFile(this.pid);

    return new Promise((resolve, reject) => {
      this.server = net.createServer((conn) => {
        this.connections.add(conn);
        this.outputChannel.appendLine(`Client connected to socket`);

        let buffer = '';

        conn.on('data', async (data) => {
          buffer += data.toString('utf8');
          
          // Try to parse complete JSON messages (separated by newlines)
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
              const parsed = JSON.parse(line) as JSONRPCRequest;
              await this.handleMessage(parsed, conn);
            } catch (err) {
              this.outputChannel.appendLine(`Error parsing JSON: ${err}`);
            }
          }
        });

        conn.on('error', (err) => {
          this.outputChannel.appendLine(`Socket connection error: ${err}`);
          this.connections.delete(conn);
        });

        conn.on('close', () => {
          this.outputChannel.appendLine(`Client disconnected from socket`);
          this.connections.delete(conn);
        });
      });

      this.server.on('error', (err) => {
        this.outputChannel.appendLine(`Socket server error: ${err}`);
        reject(err);
      });

      this.server.listen(this.socketPath, () => {
        this.outputChannel.appendLine(`MCP Server listening on socket: ${this.socketPath}`);
        resolve();
      });
    });
  }

  private async handleMessage(message: JSONRPCRequest, conn: net.Socket): Promise<void> {
    // Extract headers if present (for relay version check and client info)
    const headers = message.headers || {};
    delete (message as any).headers; // Remove headers from the actual message

    this.outputChannel.appendLine('Received message: ' + JSON.stringify(message));
    this.outputChannel.appendLine(`Extension Process PID: ${process.pid}, Parent PID: ${process.ppid}`);

    // Extract context from headers
    const context: RequestContext = {
      client: headers['X-MCP-Client'],
    };

    // Use AsyncLocalStorage to wrap request handling
    await requestContextStorage.run(context, async () => {
      try {
        // Check relay version for tools/call requests
        const enableVersionCheck = vscode.workspace.getConfiguration('mcpServer').get<boolean>('enableRelayVersionCheck');
        if (message.method === 'tools/call' && enableVersionCheck !== false) {
          const relayVersion = headers['X-Relay-Version'];
          if (!relayVersion || compareVersions(relayVersion, MIN_RELAY_VERSION) < 0) {
            const now = Date.now();
            if (!relayVersion) {
              this.outputChannel.appendLine(`Warning: Relay version is missing, (minimum required: ${MIN_RELAY_VERSION})`);
            } else {
              this.outputChannel.appendLine(`Warning: Relay version ${relayVersion} is outdated (minimum required: ${MIN_RELAY_VERSION})`);
            }

            // Only show warning if cooldown period has passed
            if (now - lastVersionWarningTime > VERSION_WARNING_COOLDOWN_MS) {
              lastVersionWarningTime = now;
              const warningMessage = `mcp server configuration is not correct or outdated. Click "View Extension" to see the solution. | MCP 服务配置不正确或过旧 ，点击"View Extension"查看解决方案。`;

              vscode.window.showWarningMessage(
                warningMessage,
                'View Extension'
              ).then(selection => {
                if (selection === 'View Extension') {
                  vscode.commands.executeCommand('extension.open', 'saika.mcp-server-for-java');
                }
              });
            }
          }
        }

        // Handle tools/call requests directly
        if (message.method === 'tools/call') {
          const response = await this.handleToolCall(message);
          conn.write(JSON.stringify(response) + '\n');
        } else {
          // Unknown method
          const errorResponse: JSONRPCResponse = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            }
          };
          conn.write(JSON.stringify(errorResponse) + '\n');
        }
      } catch (err) {
        this.outputChannel.appendLine('Error handling message: ' + err);
        const errorResponse: JSONRPCResponse = {
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: -32603,
            message: 'Internal Server Error'
          }
        };
        conn.write(JSON.stringify(errorResponse) + '\n');
      }
    });
  }

  private async handleToolCall(message: JSONRPCRequest): Promise<JSONRPCResponse> {
    const toolName = message.params?.name;
    const toolArgs = message.params?.arguments || {};

    this.outputChannel.appendLine(`Calling tool: ${toolName} with args: ${JSON.stringify(toolArgs)}`);

    if (!toolName || !toolHandlers[toolName]) {
      return {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: -32602,
          message: `Tool not found: ${toolName}`
        }
      };
    }

    try {
      const handler = toolHandlers[toolName];
      const result = await handler(toolArgs);

      return {
        jsonrpc: '2.0',
        id: message.id,
        result: result
      };
    } catch (err) {
      this.outputChannel.appendLine(`Tool execution error: ${err}`);
      return {
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: [{
            type: 'text',
            text: `Error executing tool: ${err instanceof Error ? err.message : String(err)}`
          }],
          isError: true
        }
      };
    }
  }

  async close(): Promise<void> {
    // Close all active connections
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections.clear();

    if (this.server) {
      this.outputChannel.appendLine('Closing socket server');
      
      return new Promise((resolve) => {
        this.server!.close(async () => {
          // Unregister from router table
          try {
            await unregisterByPid(this.pid);
            this.outputChannel.appendLine(`Unregistered PID ${this.pid} from router table`);
          } catch (err) {
            this.outputChannel.appendLine(`Failed to unregister from router table: ${err}`);
          }
          
          // Clean up socket file (Unix only)
          await cleanupStaleSocketFile(this.pid);
          
          this.server = undefined;
          resolve();
        });
      });
    }
  }
}
