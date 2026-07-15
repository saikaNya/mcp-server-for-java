import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export const SUPPORTED_IDES = ['idea', 'vscode'] as const;
export type IdeKind = (typeof SUPPORTED_IDES)[number];

export const SUPPORTED_TOOLS = ['searchJavaTypes', 'getSourceCodeByFQN'] as const;
export type ToolName = (typeof SUPPORTED_TOOLS)[number];

export type MatchMode = 'strict' | 'fuzzy';

export interface SearchJavaTypesArgs {
  name: string;
  matchMode?: MatchMode;
  workspacePath: string;
}

export interface GetSourceCodeByFQNArgs {
  fullyQualifiedName: string;
  workspacePath: string;
  methodNames?: string[];
  uriPath?: string;
}

export interface ToolArgsMap {
  searchJavaTypes: SearchJavaTypesArgs;
  getSourceCodeByFQN: GetSourceCodeByFQNArgs;
}

export type ToolInvocation =
  | {
      toolName: 'searchJavaTypes';
      args: SearchJavaTypesArgs;
      client?: string;
    }
  | {
      toolName: 'getSourceCodeByFQN';
      args: GetSourceCodeByFQNArgs;
      client?: string;
    };

export type FallbackReason = 'project_not_open' | 'idea_unreachable';

interface AdapterOutcomeBase {
  ide: IdeKind;
}

export interface AdapterSuccess extends AdapterOutcomeBase {
  status: 'success';
  result: CallToolResult;
}

export interface AdapterFallback extends AdapterOutcomeBase {
  status: 'fallback';
  reason: FallbackReason;
  message: string;
}

export interface AdapterError extends AdapterOutcomeBase {
  status: 'error';
  result: CallToolResult;
}

export type AdapterOutcome = AdapterSuccess | AdapterFallback | AdapterError;

export interface IdeAdapter {
  readonly ide: IdeKind;
  call(invocation: ToolInvocation): Promise<AdapterOutcome>;
}

export interface CliOptions {
  client?: string;
  ides: IdeKind[];
  ideaBaseUrl?: string;
}

export function createTextResult(text: string, isError = false): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
    ...(isError ? { isError: true } : {}),
  };
}

export function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined));
}

export function isCursorClient(client?: string): boolean {
  return client?.toLowerCase() === 'cursor';
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isSupportedIde(value: string): value is IdeKind {
  return (SUPPORTED_IDES as readonly string[]).includes(value);
}

export function isSupportedTool(value: string): value is ToolName {
  return (SUPPORTED_TOOLS as readonly string[]).includes(value);
}
