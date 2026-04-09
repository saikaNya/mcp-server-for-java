#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type ListToolsResult,
} from '@modelcontextprotocol/sdk/types.js';

import { IdeaAdapter } from './idea-adapter.js';
import { initialTools } from './initial_tools.js';
import {
  createTextResult,
  isRecord,
  isStringArray,
  isSupportedIde,
  isSupportedTool,
  type AdapterFallback,
  type CliOptions,
  type GetSourceCodeByFQNArgs,
  type IdeAdapter,
  type IdeKind,
  type MatchMode,
  type SearchJavaTypesArgs,
  type ToolInvocation,
} from './types.js';
import { VSCodeAdapter } from './vscode-adapter.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isMatchMode(value: unknown): value is MatchMode {
  return value === 'strict' || value === 'fuzzy';
}

function parseIdeToken(token: string): IdeKind[] {
  const trimmed = token.trim();
  if (!trimmed) {
    return [];
  }

  const parsedTokens: string[] = trimmed.startsWith('[')
    ? (() => {
        const parsed = JSON.parse(trimmed) as unknown;
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
          throw new Error('The --ides JSON value must be a string array.');
        }
        return parsed;
      })()
    : trimmed.split(',');

  return parsedTokens.map((entry) => {
    const ide = entry.trim().toLowerCase();
    if (!isSupportedIde(ide)) {
      throw new Error(`Unsupported ide: ${entry}. Supported values are: idea, vscode.`);
    }
    return ide;
  });
}

export function parseArgs(argv: string[]): CliOptions {
  const ides: IdeKind[] = [];
  let client: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--client') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--client requires a value.');
      }
      client = next;
      index += 1;
      continue;
    }

    if (current === '--ides') {
      const collected: IdeKind[] = [];
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) {
        collected.push(...parseIdeToken(argv[index + 1]));
        index += 1;
      }

      if (collected.length === 0) {
        throw new Error('--ides requires at least one value.');
      }

      ides.push(...collected);
      continue;
    }
  }

  return {
    client,
    ides: ides.length > 0 ? ides : ['idea'],
  };
}

function validateSearchJavaTypesArgs(value: unknown): SearchJavaTypesArgs | string {
  if (!isRecord(value)) {
    return 'searchJavaTypes requires an arguments object.';
  }

  if (!isNonEmptyString(value.name)) {
    return 'searchJavaTypes requires a non-empty name.';
  }

  if (!isNonEmptyString(value.workspacePath)) {
    return 'searchJavaTypes requires a non-empty workspacePath.';
  }

  if (value.matchMode !== undefined && !isMatchMode(value.matchMode)) {
    return "searchJavaTypes matchMode must be either 'strict' or 'fuzzy'.";
  }

  return {
    name: value.name.trim(),
    matchMode: value.matchMode,
    workspacePath: value.workspacePath.trim(),
  };
}

function validateGetSourceCodeByFQNArgs(value: unknown): GetSourceCodeByFQNArgs | string {
  if (!isRecord(value)) {
    return 'getSourceCodeByFQN requires an arguments object.';
  }

  if (!isNonEmptyString(value.fullyQualifiedName)) {
    return 'getSourceCodeByFQN requires a non-empty fullyQualifiedName.';
  }

  if (!isNonEmptyString(value.workspacePath)) {
    return 'getSourceCodeByFQN requires a non-empty workspacePath.';
  }

  if (value.methodNames !== undefined && !isStringArray(value.methodNames)) {
    return 'getSourceCodeByFQN methodNames must be a string array when provided.';
  }

  if (value.uriPath !== undefined && !isNonEmptyString(value.uriPath)) {
    return 'getSourceCodeByFQN uriPath must be a non-empty string when provided.';
  }

  return {
    fullyQualifiedName: value.fullyQualifiedName.trim(),
    workspacePath: value.workspacePath.trim(),
    methodNames: value.methodNames,
    uriPath: value.uriPath?.trim(),
  };
}

export function validateToolInvocation(
  toolName: string,
  argumentsValue: unknown,
  client?: string,
): ToolInvocation | CallToolResult {
  if (!isSupportedTool(toolName)) {
    return createTextResult(`Unsupported tool: ${toolName}`, true);
  }

  if (toolName === 'searchJavaTypes') {
    const parsedArgs = validateSearchJavaTypesArgs(argumentsValue);
    return typeof parsedArgs === 'string'
      ? createTextResult(parsedArgs, true)
      : {
          toolName,
          args: parsedArgs,
          client,
        };
  }

  const parsedArgs = validateGetSourceCodeByFQNArgs(argumentsValue);
  return typeof parsedArgs === 'string'
    ? createTextResult(parsedArgs, true)
    : {
        toolName,
        args: parsedArgs,
        client,
      };
}

function isCallToolResult(value: ToolInvocation | CallToolResult): value is CallToolResult {
  return 'content' in value;
}

export function buildFallbackErrorMessage(
  workspacePath: string,
  fallbacks: AdapterFallback[],
): string {
  if (fallbacks.length === 0) {
    return `No IDE adapters are configured for workspacePath: ${workspacePath}`;
  }

  const details = fallbacks.map((fallback) => `${fallback.ide}: ${fallback.message}`).join('; ');
  const hasUnreachable = fallbacks.some((fallback) => fallback.reason === 'idea_unreachable');
  const hasProjectNotOpen = fallbacks.some((fallback) => fallback.reason === 'project_not_open');

  if (hasProjectNotOpen && !hasUnreachable) {
    return `No configured IDE has opened workspacePath: ${workspacePath}. ${details}`;
  }

  if (hasUnreachable && !hasProjectNotOpen) {
    return `Failed to communicate with the configured IDE clients for workspacePath: ${workspacePath}. ${details}`;
  }

  return `No configured IDE could handle workspacePath: ${workspacePath}. ${details}`;
}

export async function executeWithFallback(
  invocation: ToolInvocation,
  ides: IdeKind[],
  adapters: Record<IdeKind, IdeAdapter>,
): Promise<CallToolResult> {
  const fallbacks: AdapterFallback[] = [];

  for (const ide of ides) {
    const adapter = adapters[ide];
    const outcome = await adapter.call(invocation);

    if (outcome.status === 'success' || outcome.status === 'error') {
      return outcome.result;
    }

    fallbacks.push(outcome);
  }

  return createTextResult(buildFallbackErrorMessage(invocation.args.workspacePath, fallbacks), true);
}

export class McpServerForLanguage {
  private readonly mcpServer: McpServer;
  private readonly adapters: Record<IdeKind, IdeAdapter>;

  constructor(
    private readonly options: CliOptions,
    adapters?: Partial<Record<IdeKind, IdeAdapter>>,
  ) {
    this.adapters = {
      idea: adapters?.idea || new IdeaAdapter(),
      vscode: adapters?.vscode || new VSCodeAdapter(),
    };

    this.mcpServer = new McpServer(
      {
        name: 'mcp-server-for-language',
        version: '0.0.1',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: [
          'This MCP server provides Java language support tools through IDEA and VSCode based IDEs.',
          'It can search for Java types (classes, interfaces, enums) and retrieve their source code,',
          'including project source code, external dependencies, and JDK sources.',
          '',
          'Available tools:',
          '- searchJavaTypes: Search for Java types by name or partial name.',
          '- getSourceCodeByFQN: Get source code of a Java type by its fully qualified name.',
          '',
          'Both tools require a "workspacePath" parameter and route to the first available IDE in the configured ides order.',
        ].join('\n'),
      },
    );

    this.mcpServer.server.setRequestHandler(ListToolsRequestSchema, async (): Promise<ListToolsResult> => {
      return {
        tools: initialTools as never[],
      };
    });

    this.mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
      const validated = validateToolInvocation(
        request.params.name,
        request.params.arguments,
        this.options.client,
      );

      if (isCallToolResult(validated)) {
        return validated;
      }

      return executeWithFallback(validated, this.options.ides, this.adapters);
    });
  }

  start(): Promise<void> {
    return this.mcpServer.connect(new StdioServerTransport());
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const server = new McpServerForLanguage(options);
  await server.start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
