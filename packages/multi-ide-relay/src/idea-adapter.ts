import * as path from 'node:path';

import {
  IDEA_CLASS_CONTENT_PATH,
  IDEA_SEARCH_CLASS_PATH,
  IdeaClient,
  IdeaClientTransportError,
  type IdeaApiResponse,
  type IdeaHttpClientLike,
} from './idea-client.js';
import {
  createTextResult,
  isCursorClient,
  omitUndefined,
  type AdapterOutcome,
  type GetSourceCodeByFQNArgs,
  type IdeAdapter,
  type MatchMode,
  type SearchJavaTypesArgs,
  type ToolInvocation,
} from './types.js';

const IDEA_SUCCESS = 0;
const IDEA_PROJECT_NOT_FOUND = 2001;
const IDEA_CLASS_NOT_FOUND = 2002;
const IDEA_SPECIFIED_PROJECT_NOT_FOUND = 2003;
const IDEA_INDEXING = 3001;

interface IdeaSearchResultItem {
  fqn: string;
  paths?: string[];
}

interface IdeaSearchData {
  query: string;
  total: number;
  results: IdeaSearchResultItem[];
}

interface IdeaMethodDetail {
  name: string;
  startLine: number;
  endLine: number;
}

interface IdeaClassContentData {
  content: string;
  path?: string;
  fqn?: string;
  methods?: IdeaMethodDetail[];
}

type RelaySearchResultItem = string | { fqn: string; uriPath: string };

export function normalizeIdeaSearchResults(
  results: IdeaSearchResultItem[],
  originalQuery: string,
  matchMode: MatchMode = 'strict',
): RelaySearchResultItem[] {
  const filtered =
    matchMode === 'strict' && originalQuery.includes('.')
      ? results.filter((item) => item.fqn === originalQuery)
      : results;

  return filtered.reduce<RelaySearchResultItem[]>((accumulator, item) => {
    if (item.paths && item.paths.length > 0) {
      accumulator.push(
        ...item.paths.map((currentPath) => ({
          fqn: item.fqn,
          uriPath: currentPath,
        })),
      );
      return accumulator;
    }

    accumulator.push(item.fqn);
    return accumulator;
  }, []);
}

function isProjectNotOpenCode(code: number): boolean {
  return code === IDEA_PROJECT_NOT_FOUND || code === IDEA_SPECIFIED_PROJECT_NOT_FOUND;
}

function toComparablePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/([a-zA-Z]:)/, '$1')
    .replace(/\/+$/, '');
}

function resolveDisplayPath(
  filePath: string | undefined,
  workspacePath: string,
): { displayPath: string; isProjectSource: boolean } {
  if (!filePath) {
    return {
      displayPath: 'unknown',
      isProjectSource: false,
    };
  }

  const comparableFile = toComparablePath(filePath);
  const comparableWorkspace = toComparablePath(workspacePath);
  const normalizedFile = comparableFile.toLowerCase();
  const normalizedWorkspace = comparableWorkspace.toLowerCase();

  if (!comparableFile.includes('!/')) {
    if (normalizedFile === normalizedWorkspace) {
      return {
        displayPath: path.posix.basename(comparableFile),
        isProjectSource: true,
      };
    }

    if (normalizedFile.startsWith(`${normalizedWorkspace}/`)) {
      const relativePath = comparableFile.slice(comparableWorkspace.length).replace(/^\/+/, '');
      return {
        displayPath: relativePath || path.posix.basename(comparableFile),
        isProjectSource: true,
      };
    }
  }

  return {
    displayPath: comparableFile,
    isProjectSource: false,
  };
}

function estimateLineCount(content: string, methods?: IdeaMethodDetail[]): number {
  const lines = content.split(/\r?\n/);
  const numberedLineCount = lines.reduce((maxLine, line) => {
    const match = line.match(/^\s*(\d+)\|/);
    return match ? Math.max(maxLine, Number(match[1])) : maxLine;
  }, 0);
  const methodLineCount = methods?.reduce((maxLine, method) => Math.max(maxLine, method.endLine), 0) || 0;
  return Math.max(lines.length, numberedLineCount, methodLineCount, 1);
}

export function formatIdeaSourceCode(
  data: IdeaClassContentData,
  workspacePath: string,
  client?: string,
): string {
  const { displayPath, isProjectSource } = resolveDisplayPath(data.path, workspacePath);
  const lineCount = estimateLineCount(data.content, data.methods);

  if (isCursorClient(client) && isProjectSource) {
    return `\`\`\`1:${lineCount}:${displayPath}
${data.content}
\`\`\``;
  }

  return `\`\`\`java:${displayPath}
${data.content}
\`\`\``;
}

export class IdeaAdapter implements IdeAdapter {
  readonly ide = 'idea' as const;

  constructor(private readonly client: IdeaHttpClientLike = new IdeaClient()) {}

  async call(invocation: ToolInvocation): Promise<AdapterOutcome> {
    try {
      if (invocation.toolName === 'searchJavaTypes') {
        return await this.callSearchJavaTypes(invocation.args);
      }

      return await this.callGetSourceCodeByFQN(invocation.args, invocation.client);
    } catch (error) {
      if (error instanceof IdeaClientTransportError) {
        return {
          status: 'fallback',
          ide: this.ide,
          reason: 'idea_unreachable',
          message: error.message,
        };
      }

      return {
        status: 'error',
        ide: this.ide,
        result: createTextResult(
          `Failed to communicate with IDEA language interface: ${
            error instanceof Error ? error.message : String(error)
          }`,
          true,
        ),
      };
    }
  }

  private async callSearchJavaTypes(args: SearchJavaTypesArgs): Promise<AdapterOutcome> {
    const queryName =
      (args.matchMode ?? 'strict') === 'strict' && args.name.includes('.')
        ? args.name.slice(args.name.lastIndexOf('.') + 1)
        : args.name;

    const response = await this.client.postJson<IdeaSearchData>(
      IDEA_SEARCH_CLASS_PATH,
      omitUndefined({
        name: queryName,
        matchMode: args.matchMode,
        project: args.workspacePath,
      }),
    );

    return this.handleSearchResponse(response, args);
  }

  private handleSearchResponse(
    response: IdeaApiResponse<IdeaSearchData>,
    args: SearchJavaTypesArgs,
  ): AdapterOutcome {
    if (response.code === IDEA_SUCCESS) {
      const normalized = normalizeIdeaSearchResults(response.data?.results || [], args.name, args.matchMode);
      return {
        status: 'success',
        ide: this.ide,
        result: createTextResult(JSON.stringify(normalized)),
      };
    }

    if (isProjectNotOpenCode(response.code)) {
      return {
        status: 'fallback',
        ide: this.ide,
        reason: 'project_not_open',
        message: response.msg || `IDEA has not opened workspacePath: ${args.workspacePath}`,
      };
    }

    return {
      status: 'error',
      ide: this.ide,
      result: createTextResult(
        response.msg || `IDEA searchJavaTypes failed with code ${response.code}.`,
        true,
      ),
    };
  }

  private async callGetSourceCodeByFQN(
    args: GetSourceCodeByFQNArgs,
    client?: string,
  ): Promise<AdapterOutcome> {
    let response: IdeaApiResponse<IdeaClassContentData>;

    if (args.uriPath) {
      response = await this.client.postJson<IdeaClassContentData>(
        IDEA_CLASS_CONTENT_PATH,
        omitUndefined({
          path: args.uriPath,
          project: args.workspacePath,
          methods: args.methodNames,
        }),
      );

      if (response.code === IDEA_CLASS_NOT_FOUND) {
        response = await this.client.postJson<IdeaClassContentData>(
          IDEA_CLASS_CONTENT_PATH,
          omitUndefined({
            fqn: args.fullyQualifiedName,
            project: args.workspacePath,
            methods: args.methodNames,
          }),
        );
      }
    } else {
      response = await this.client.postJson<IdeaClassContentData>(
        IDEA_CLASS_CONTENT_PATH,
        omitUndefined({
          fqn: args.fullyQualifiedName,
          project: args.workspacePath,
          methods: args.methodNames,
        }),
      );
    }

    return this.handleGetSourceResponse(response, args, client);
  }

  private handleGetSourceResponse(
    response: IdeaApiResponse<IdeaClassContentData>,
    args: GetSourceCodeByFQNArgs,
    client?: string,
  ): AdapterOutcome {
    if (response.code === IDEA_SUCCESS) {
      if (!response.data || typeof response.data.content !== 'string') {
        return {
          status: 'error',
          ide: this.ide,
          result: createTextResult('IDEA language interface returned invalid class content.', true),
        };
      }

      return {
        status: 'success',
        ide: this.ide,
        result: createTextResult(formatIdeaSourceCode(response.data, args.workspacePath, client)),
      };
    }

    if (isProjectNotOpenCode(response.code)) {
      return {
        status: 'fallback',
        ide: this.ide,
        reason: 'project_not_open',
        message: response.msg || `IDEA has not opened workspacePath: ${args.workspacePath}`,
      };
    }

    if (response.code === IDEA_CLASS_NOT_FOUND) {
      return {
        status: 'error',
        ide: this.ide,
        result: createTextResult(
          `No Java type found with the fully qualified name: ${args.fullyQualifiedName}`,
        ),
      };
    }

    if (response.code === IDEA_INDEXING) {
      return {
        status: 'error',
        ide: this.ide,
        result: createTextResult(
          response.msg || 'Indexing in progress, please try again later.',
          true,
        ),
      };
    }

    return {
      status: 'error',
      ide: this.ide,
      result: createTextResult(
        response.msg || `IDEA getSourceCodeByFQN failed with code ${response.code}.`,
        true,
      ),
    };
  }
}
