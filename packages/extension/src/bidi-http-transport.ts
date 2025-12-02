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

export class BidiHttpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private pendingResponses = new Map<string | number, (resp: JSONRPCMessage) => void>();
  private httpServer?: http.Server; // Express server instance

  constructor(
    readonly listenPort: number,
    private readonly outputChannel: vscode.OutputChannel,
    private readonly workspacePath?: string
  ) { }

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
      this.outputChannel.appendLine('Received message: ' + JSON.stringify(req.body));
      try {
        const message = req.body as JSONRPCMessage;

        // Check relay version for tools/call requests
        if ('method' in message && message.method === 'tools/call') {
          const relayVersion = req.headers['x-relay-version'] as string | undefined;
          if (!relayVersion || compareVersions(relayVersion, MIN_RELAY_VERSION) < 0) {
            const now = Date.now();
            const displayVersion = relayVersion || 'unknown';
            this.outputChannel.appendLine(`Warning: Relay version ${displayVersion} is outdated (minimum required: ${MIN_RELAY_VERSION})`);
            
            // Only show warning if cooldown period has passed
            if (now - lastVersionWarningTime > VERSION_WARNING_COOLDOWN_MS) {
              lastVersionWarningTime = now;
              vscode.window.showWarningMessage(
                `vscode-to-mcp-server npm package version is outdated (current: ${displayVersion}, required: >= ${MIN_RELAY_VERSION}). Click "View Extension" to see details and resolve the issue.`,
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

    // Only try to listen on the specified port
    const startServer = (port: number): Promise<number> => {
      console.trace('Starting server on port: ' + port);
      return new Promise((resolve, reject) => {
        const server = app.listen(port)
          .once('listening', () => {
            this.httpServer = server; // Store server instance
            this.outputChannel.appendLine(`MCP Server running at :${port}`);
            resolve(port);
          })
          .once('error', (err: NodeJS.ErrnoException) => {
            this.outputChannel.appendLine(`Failed to listen on port ${port}: ${err.message}`);
            reject(err);
          });
      });
    };

    try {
      await startServer(this.listenPort);
      this.outputChannel.appendLine('Server is now running');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.outputChannel.appendLine(`Failed to start server on port ${this.listenPort}: ${errorMessage}`);
      throw new Error(`Failed to bind to port ${this.listenPort}: ${errorMessage}`);
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.outputChannel.appendLine('Sending message: ' + JSON.stringify(message));

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
