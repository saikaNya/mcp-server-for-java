import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import * as http from 'node:http';
import * as vscode from 'vscode';
import { unregisterWorkspace } from './utils/router-table';

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

const PORT_RETRY_COUNT = 10; // Number of additional ports to try if the initial port is occupied

export class BidiHttpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private pendingResponses = new Map<string | number, (resp: JSONRPCMessage) => void>();
  private httpServer?: http.Server; // Express server instance
  private actualPort?: number; // The actual port the server is running on

  constructor(
    readonly listenPort: number,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly workspacePath?: string
  ) { }

  /**
   * Gets the actual port the server is running on.
   * This may differ from listenPort if there was a port conflict.
   */
  getActualPort(): number | undefined {
    return this.actualPort;
  }

  async start(): Promise<void> {
    const app = express();

    app.get('/ping', (_req: express.Request, res: express.Response) => {
      this.outputChannel.appendLine('Received ping request');
      const response = {
        status: 'ok',
        timestamp: new Date().toISOString()
      };

      res.send(response);
    });

    app.post('/notify-tools-updated', express.json(), (_req: express.Request, res: express.Response) => {
      this.outputChannel.appendLine('Received tools updated notification');
      vscode.window.showWarningMessage('The Tool List has been updated. Please restart the MCP Client (e.g., Claude Desktop) to notify it of the new Tool List. (For Claude Desktop, click the top hamburger menu -> File -> Exit.)');
      res.send({ success: true });
    });

    app.post('/', express.json(), async (req: express.Request, res: express.Response) => {
      const message = req.body as JSONRPCMessage;

      // 对于 tools/list 方法，不打印日志
      if (!('method' in message && message.method === 'tools/list')) {
        this.outputChannel.appendLine('Received message: ' + JSON.stringify(req.body));
      }

      try {

        // Check relay version for tools/call requests
        const enableVersionCheck = vscode.workspace.getConfiguration('mcpServer').get<boolean>('enableRelayVersionCheck');
        if ('method' in message && message.method === 'tools/call' && enableVersionCheck !== false) {
          const relayVersion = req.headers['x-relay-version'] as string | undefined;
          if (!relayVersion || compareVersions(relayVersion, MIN_RELAY_VERSION) < 0) {
            const now = Date.now();
            if (!relayVersion) {
              this.outputChannel.appendLine(`Warning: Relay version is missing， (minimum required: ${MIN_RELAY_VERSION})`);
            }
            else {
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
            res.send(resp);
          } else {
            // Handle the request without waiting for response
            this.onmessage(message);
            res.send('{ "success": true }');
          }
        } else {
          res.status(500).send('No message handler');
        }
      } catch (err) {
        this.outputChannel.appendLine('Error handling message: ' + err);
        res.status(500).send('Internal Server Error');
      }
    });

    // Try to listen on the specified port
    const tryStartServer = (port: number): Promise<number> => {
      console.trace('Trying to start server on port: ' + port);
      return new Promise((resolve, reject) => {
        const server = app.listen(port)
          .once('listening', () => {
            this.httpServer = server; // Store server instance
            this.actualPort = port; // Store the actual port
            this.outputChannel.appendLine(`MCP Server running at :${port}`);
            resolve(port);
          })
          .once('error', (err: NodeJS.ErrnoException) => {
            this.outputChannel.appendLine(`Failed to listen on port ${port}: ${err.message}`);
            reject(err);
          });
      });
    };

    // Try to start server with port retry logic
    const startServerWithRetry = async (): Promise<number> => {
      const triedPorts: number[] = [];

      // Try the initial port and up to PORT_RETRY_COUNT additional ports
      for (let i = 0; i <= PORT_RETRY_COUNT; i++) {
        const port = this.listenPort + i;
        triedPorts.push(port);

        try {
          return await tryStartServer(port);
        } catch (err) {
          const errnoException = err as NodeJS.ErrnoException;
          // Only retry if the error is port-related (EADDRINUSE or EACCES)
          if (errnoException.code === 'EADDRINUSE' || errnoException.code === 'EACCES') {
            if (i < PORT_RETRY_COUNT) {
              this.outputChannel.appendLine(`Port ${port} is occupied, trying next port...`);
              continue;
            }
          } else {
            // For other errors, throw immediately
            throw err;
          }
        }
      }

      // All ports failed, show warning and throw error
      const errorMessage = `Failed to start MCP Server. Tried ports ${triedPorts[0]}-${triedPorts[triedPorts.length - 1]}, all are occupied or unavailable.`;
      this.outputChannel.appendLine(errorMessage);

      vscode.window.showWarningMessage(
        `${errorMessage} Please check if another application is using these ports. | MCP服务器启动失败，端口 ${triedPorts[0]}-${triedPorts[triedPorts.length - 1]} 均被占用或不可用，请检查是否有其他应用占用这些端口。`,
        'OK'
      );

      throw new Error(errorMessage);
    };

    try {
      const actualPort = await startServerWithRetry();
      this.outputChannel.appendLine(`Server is now running on port ${actualPort}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`Failed to start server: ${errorMessage}`);
      throw err;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // 对于 tools/list 方法的响应，不打印日志
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
    if (this.httpServer) {
      this.outputChannel.appendLine('Closing server');
      this.httpServer.close();
      this.httpServer = undefined;
    }
    // Unregister workspace from router table
    if (this.workspacePath) {
      try {
        await unregisterWorkspace(this.workspacePath);
        this.outputChannel.appendLine(`Unregistered workspace ${this.workspacePath} from router table`);
      } catch (err) {
        this.outputChannel.appendLine(`Failed to unregister workspace: ${err}`);
      }
    }
  }
}
