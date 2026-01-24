#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, CallToolResult, JSONRPCRequest, JSONRPCResponse, ListToolsRequestSchema, ListToolsResult } from '@modelcontextprotocol/sdk/types.js';
import { initialTools } from './initial_tools.js';
import { findMatchingEntry, listWorkspaces } from './router-table.js';
import { sendSocketRequest, isSocketAvailable } from './socket-client.js';

const MAX_RETRIES = 3;
const RETRY_INTERVAL = 1000; // 1 second
const RELAY_VERSION = '0.0.9';

class MCPRelay {
  private mcpServer: McpServer;
  private client?: string;

  constructor(client?: string) {
    this.client = client;
    this.mcpServer = new McpServer({
      name: 'vscode-as-mcp',
      version: '0.0.1',
    }, {
      capabilities: {
        tools: {},
      },
    });

    this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (_request): Promise<ListToolsResult> => {
      // Always return initialTools - no caching needed
      return { tools: initialTools as any[] };
    });

    this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      try {
        // Extract workspacePaths parameter from tool arguments
        const args = request.params.arguments as Record<string, unknown> | undefined;
        const workspacePaths = args?.workspacePaths as string[] | undefined;

        // Get target PID based on workspacePaths parameter
        const pid = await this.getTargetPid(workspacePaths || []);
        if (!pid) {
          return {
            isError: true,
            content: [{
              type: 'text',
              text: `Failed to find matching VSCode extension. No extension found for workspacePaths: ${workspacePaths?.join(', ') || 'none'}`,
            }],
          };
        }

        console.error(`Routing tool call to PID: ${pid} (workspacePaths: ${workspacePaths?.join(', ') || 'default'})`);
        console.error(`Process PID: ${process.pid}, Parent PID: ${process.ppid}`);

        const response = await this.requestWithRetry(pid, {
          jsonrpc: '2.0',
          method: request.method,
          params: request.params,
          id: Math.floor(Math.random() * 1000000),
        } as JSONRPCRequest, {
          'X-Relay-Version': RELAY_VERSION,
          ...(this.client && { 'X-MCP-Client': this.client }),
        });
        const parsedResponse = response as JSONRPCResponse;
        return parsedResponse.result as any;
      } catch (e) {
        console.error(`Failed to call tool: ${(e as Error).message}`);
        return {
          isError: true,
          content: [{
            type: 'text',
            text: `Failed to communicate with the VSCode MCP Server.`,
          }],
        };
      }
    });
  }

  /**
   * Gets the target PID for routing based on workspacePaths.
   * @param workspacePaths Array of workspace paths from the tool request
   * @returns The PID to route to, or undefined if no match found
   */
  async getTargetPid(workspacePaths: string[]): Promise<number | undefined> {
    // If no workspacePaths provided, try to find any available extension
    if (!workspacePaths || workspacePaths.length === 0) {
      const entries = await listWorkspaces();
      for (const entry of entries) {
        if (await isSocketAvailable(entry.pid)) {
          return entry.pid;
        }
      }
      return undefined;
    }

    // Use the new matching logic with parent PID
    const entry = await findMatchingEntry(workspacePaths, process.ppid);
    if (entry && await isSocketAvailable(entry.pid)) {
      return entry.pid;
    }

    // Fallback: try to find any available extension
    const entries = await listWorkspaces();
    for (const e of entries) {
      if (await isSocketAvailable(e.pid)) {
        console.error(`Fallback: using PID ${e.pid} as no exact match found for workspacePaths`);
        return e.pid;
      }
    }

    return undefined;
  }

  async requestWithRetry(pid: number, body: unknown, extraHeaders?: Record<string, string>): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        console.error(`Retry attempt ${attempt + 1}/${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
      }

      try {
        const response = await sendSocketRequest(pid, body, {
          headers: extraHeaders,
        });
        return response;
      } catch (err) {
        lastError = err as Error;
        console.error(`Request failed: ${lastError.message}`);
      }
    }

    throw new Error(`All retry attempts failed: ${lastError?.message}`);
  }

  start() {
    return this.mcpServer.connect(new StdioServerTransport());
  }
};

// コマンドライン引数の解析
function parseArgs() {
  const args = process.argv.slice(2);
  let client: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--client' && i + 1 < args.length) {
      client = args[i + 1];
      i++;
    }
  }

  return { client };
}

try {
  console.error(`Relay starting - PID: ${process.pid}, Parent PID: ${process.ppid}`);
  const { client } = parseArgs();
  const relay = new MCPRelay(client);
  await relay.start();
} catch (err) {
  console.error(`Fatal error: ${(err as Error).message}`);
  process.exit(1);
}
