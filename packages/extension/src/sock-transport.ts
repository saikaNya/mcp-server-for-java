import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import * as net from 'net';
import * as vscode from 'vscode';
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

/**
 * IPC Socket Transport for MCP Server.
 * Uses Named Pipe on Windows, Unix Domain Socket on other platforms.
 */
export class SocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  
  private pendingResponses = new Map<string | number, (resp: JSONRPCMessage) => void>();
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
   * Gets the PID this transport is associated with.
   */
  getPid(): number {
    return this.pid;
  }

  /**
   * Gets the socket path this transport is listening on.
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
              const parsed = JSON.parse(line);
              await this.handleMessage(parsed, conn);
            } catch (err) {
              this.outputChannel.appendLine(`Error parsing JSON: ${err}`);
            }
          }
        });

        conn.on('error', (err) => {
          this.outputChannel.appendLine(`Socket connection error: ${err}`);
          this.connections.delete(conn);
          this.onerror?.(err);
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

  private async handleMessage(message: JSONRPCMessage & { headers?: Record<string, string> }, conn: net.Socket): Promise<void> {
    // Extract headers if present (for relay version check and client info)
    const headers = message.headers || {};
    delete (message as any).headers; // Remove headers from the actual message

    // Don't log for tools/list method
    if (!('method' in message && message.method === 'tools/list')) {
      this.outputChannel.appendLine('Received message: ' + JSON.stringify(message));
      this.outputChannel.appendLine(`Extension Process PID: ${process.pid}, Parent PID: ${process.ppid}`);
    }

    // Extract context from headers
    const context: RequestContext = {
      client: headers['X-MCP-Client'],
    };

    // Use AsyncLocalStorage to wrap request handling
    await requestContextStorage.run(context, async () => {
      try {
        // Check relay version for tools/call requests
        const enableVersionCheck = vscode.workspace.getConfiguration('mcpServer').get<boolean>('enableRelayVersionCheck');
        if ('method' in message && message.method === 'tools/call' && enableVersionCheck !== false) {
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

        if (this.onmessage) {
          if ('id' in message) {
            // Create a new promise for the response
            const responsePromise = new Promise<JSONRPCMessage>((resolve) => {
              this.pendingResponses.set(message.id, resolve);
            });
            
            // Handle the request and wait for response
            this.onmessage(message);
            const resp = await responsePromise;
            
            // Send response back through the socket
            conn.write(JSON.stringify(resp) + '\n');
          } else {
            // Handle the request without waiting for response
            this.onmessage(message);
            conn.write(JSON.stringify({ success: true }) + '\n');
          }
        } else {
          conn.write(JSON.stringify({ error: 'No message handler' }) + '\n');
        }
      } catch (err) {
        this.outputChannel.appendLine('Error handling message: ' + err);
        conn.write(JSON.stringify({ error: 'Internal Server Error' }) + '\n');
      }
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Don't log for tools/list responses
    const isToolsListResponse = 'id' in message && 'result' in message &&
      typeof message.result === 'object' && message.result !== null &&
      'tools' in message.result;

    if (!isToolsListResponse) {
      this.outputChannel.appendLine('Sending message: ' + JSON.stringify(message));
    }

    if ('id' in message && 'result' in message) {
      // This is a response to a previous request
      const resolve = this.pendingResponses.get(message.id);
      if (resolve) {
        resolve(message);
        this.pendingResponses.delete(message.id);
      } else {
        this.outputChannel.appendLine(`No pending response for ID: ${message.id}`);
      }
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
