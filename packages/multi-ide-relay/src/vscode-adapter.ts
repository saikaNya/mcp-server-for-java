import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { findEntryForWorkspacePath, type RouterEntry } from './router-table.js';
import { isSocketAvailable, sendSocketRequest, type SocketRequestOptions } from './socket-client.js';
import {
  createTextResult,
  omitUndefined,
  type AdapterOutcome,
  type IdeAdapter,
  type ToolInvocation,
} from './types.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_INTERVAL_MS = 1000;
const RELAY_VERSION = '0.0.9';

interface JSONRPCRequest {
  jsonrpc: '2.0';
  id: number;
  method: 'tools/call';
  params: {
    name: ToolInvocation['toolName'];
    arguments: Record<string, unknown>;
  };
}

interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: CallToolResult;
  error?: {
    code: number;
    message: string;
  };
}

export interface VSCodeAdapterOptions {
  relayVersion?: string;
  maxRetries?: number;
  retryIntervalMs?: number;
  findEntryForWorkspacePathFn?: (workspacePath: string) => Promise<RouterEntry | undefined>;
  isSocketAvailableFn?: (pid: number) => Promise<boolean>;
  sendSocketRequestFn?: (
    pid: number,
    body: unknown,
    options?: SocketRequestOptions,
  ) => Promise<unknown>;
}

export class VSCodeAdapter implements IdeAdapter {
  readonly ide = 'vscode' as const;

  private readonly relayVersion: string;
  private readonly maxRetries: number;
  private readonly retryIntervalMs: number;
  private readonly findEntryForWorkspacePathFn: (workspacePath: string) => Promise<RouterEntry | undefined>;
  private readonly isSocketAvailableFn: (pid: number) => Promise<boolean>;
  private readonly sendSocketRequestFn: (
    pid: number,
    body: unknown,
    options?: SocketRequestOptions,
  ) => Promise<unknown>;

  constructor(options: VSCodeAdapterOptions = {}) {
    this.relayVersion = options.relayVersion || RELAY_VERSION;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryIntervalMs = options.retryIntervalMs ?? DEFAULT_RETRY_INTERVAL_MS;
    this.findEntryForWorkspacePathFn = options.findEntryForWorkspacePathFn || findEntryForWorkspacePath;
    this.isSocketAvailableFn = options.isSocketAvailableFn || isSocketAvailable;
    this.sendSocketRequestFn = options.sendSocketRequestFn || sendSocketRequest;
  }

  async call(invocation: ToolInvocation): Promise<AdapterOutcome> {
    const workspacePath = invocation.args.workspacePath;
    const entry = await this.findEntryForWorkspacePathFn(workspacePath);
    if (!entry) {
      return {
        status: 'fallback',
        ide: this.ide,
        reason: 'project_not_open',
        message: `VSCode has not opened workspacePath: ${workspacePath}`,
      };
    }

    if (!(await this.isSocketAvailableFn(entry.pid))) {
      return {
        status: 'error',
        ide: this.ide,
        result: createTextResult('Failed to communicate with the VSCode MCP Server.', true),
      };
    }

    try {
      const response = (await this.requestWithRetry(
        entry.pid,
        this.buildRequest(invocation),
        this.buildHeaders(invocation.client),
      )) as JSONRPCResponse;

      if (response.error) {
        return {
          status: 'error',
          ide: this.ide,
          result: createTextResult(`VSCode MCP Server error: ${response.error.message}`, true),
        };
      }

      if (!response.result) {
        return {
          status: 'error',
          ide: this.ide,
          result: createTextResult('VSCode MCP Server returned an empty result.', true),
        };
      }

      return {
        status: 'success',
        ide: this.ide,
        result: response.result,
      };
    } catch {
      return {
        status: 'error',
        ide: this.ide,
        result: createTextResult('Failed to communicate with the VSCode MCP Server.', true),
      };
    }
  }

  private buildRequest(invocation: ToolInvocation): JSONRPCRequest {
    return {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1_000_000),
      method: 'tools/call',
      params: {
        name: invocation.toolName,
        arguments: this.mapArguments(invocation),
      },
    };
  }

  private buildHeaders(client?: string): Record<string, string> {
    return {
      'X-Relay-Version': this.relayVersion,
      ...(client ? { 'X-MCP-Client': client } : {}),
    };
  }

  private mapArguments(invocation: ToolInvocation): Record<string, unknown> {
    if (invocation.toolName === 'searchJavaTypes') {
      return omitUndefined({
        name: invocation.args.name,
        matchMode: invocation.args.matchMode,
        workspacePaths: [invocation.args.workspacePath],
      });
    }

    return omitUndefined({
      fullyQualifiedName: invocation.args.fullyQualifiedName,
      workspacePaths: [invocation.args.workspacePath],
      methodNames: invocation.args.methodNames,
      uriPath: invocation.args.uriPath,
    });
  }

  private async requestWithRetry(
    pid: number,
    body: JSONRPCRequest,
    headers: Record<string, string>,
  ): Promise<unknown> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.retryIntervalMs));
      }

      try {
        return await this.sendSocketRequestFn(pid, body, { headers });
      } catch (error) {
        lastError = error as Error;
      }
    }

    throw new Error(lastError?.message || 'All VSCode relay retry attempts failed.');
  }
}
