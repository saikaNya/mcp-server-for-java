import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol';
import { CallToolRequestSchema, CallToolResult, ErrorCode, ListToolsRequestSchema, ListToolsResult, McpError, Tool } from '@modelcontextprotocol/sdk/types.js';
import dedent from 'dedent';
import * as vscode from 'vscode';
import { AnyZodObject, z, ZodRawShape } from 'zod';
import { zodToJsonSchema } from "zod-to-json-schema";
import packageJson from '../package.json';
import { searchJavaTypesSchema, searchJavaTypesTool } from './tools/search_java_types';
import { getSourceCodeByFQNSchema, getSourceCodeByFQNTool } from './tools/get_source_code_by_fqn';
export const extensionName = 'mcp-server-for-java';
export const extensionDisplayName = 'MCP Server for Java';

interface RegisteredTool {
  description?: string;
  inputZodSchema?: AnyZodObject;
  inputSchema?: Tool['inputSchema'];
  callback: ToolCallback<undefined | ZodRawShape>;
};

export class ToolRegistry {
  private _registeredTools: { [name: string]: RegisteredTool } = {};
  private _toolHandlersInitialized = false;
  constructor(readonly server: Server) { }
  toolWithRawInputSchema(
    name: string,
    description: string,
    inputSchema: Tool['inputSchema'],
    cb: (args: unknown, extra: RequestHandlerExtra) => ReturnType<ToolCallback<any>>,
  ) {
    if (this._registeredTools[name]) {
      throw new Error(`Tool ${name} is already registered`);
    }

    this._registeredTools[name] = {
      description,
      inputSchema,
      callback: cb,
    };

    this.#setToolRequestHandlers();
  }
  tool<Args extends ZodRawShape>(
    name: string,
    description: string,
    paramsSchema: Args,
    cb: ToolCallback<Args>,
  ) {
    if (this._registeredTools[name]) {
      throw new Error(`Tool ${name} is already registered`);
    }

    this._registeredTools[name] = {
      description,
      inputZodSchema:
        paramsSchema === undefined ? undefined : z.object(paramsSchema),
      callback: cb,
    };

    this.#setToolRequestHandlers();
  }
  #setToolRequestHandlers() {
    if (this._toolHandlersInitialized) {
      return;
    }

    this.server.assertCanSetRequestHandler(
      ListToolsRequestSchema.shape.method.value,
    );
    this.server.assertCanSetRequestHandler(
      CallToolRequestSchema.shape.method.value,
    );

    this.server.registerCapabilities({
      tools: {},
    });

    this.server.setRequestHandler(ListToolsRequestSchema, (): ListToolsResult => ({
      tools: Object.entries(this._registeredTools).map(([name, tool]): Tool => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema
          ?? (tool.inputZodSchema && (zodToJsonSchema(tool.inputZodSchema, {
            strictUnions: true,
          }) as Tool["inputSchema"]))
          ?? { type: "object" as const },
      })),
    }));

    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, extra): Promise<CallToolResult> => {
        const tool = this._registeredTools[request.params.name];
        if (!tool) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Tool ${request.params.name} not found`,
          );
        }

        if (tool.inputSchema) {
          // Skip validation because raw inputschema tool is used by another tool provider
          const args = request.params.arguments;
          const cb = tool.callback as (args: unknown, extra: RequestHandlerExtra) => ReturnType<ToolCallback<any>>;
          return await Promise.resolve(cb(args, extra));
        } else if (tool.inputZodSchema) {
          const parseResult = await tool.inputZodSchema.safeParseAsync(
            request.params.arguments,
          );
          if (!parseResult.success) {
            throw new McpError(
              ErrorCode.InvalidParams,
              `Invalid arguments for tool ${request.params.name}: ${parseResult.error.message}`,
            );
          }

          const args = parseResult.data;
          const cb = tool.callback as ToolCallback<ZodRawShape>;
          try {
            return await Promise.resolve(cb(args, extra));
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
              isError: true,
            };
          }
        } else {
          const cb = tool.callback as ToolCallback<undefined>;
          try {
            return await Promise.resolve(cb(extra));
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: error instanceof Error ? error.message : String(error),
                },
              ],
              isError: true,
            };
          }
        }
      },
    );

    this._toolHandlersInitialized = true;
  }
}

export function createMcpServer(_outputChannel: vscode.OutputChannel): McpServer {
  const mcpServer = new McpServer({
    name: extensionName,
    version: packageJson.version,
  }, {
    capabilities: {
      tools: {},
    },
  });

  const toolRegistry = new ToolRegistry(mcpServer.server);

  // Register tools
  registerTools(toolRegistry);

  return mcpServer;
}

function registerTools(mcpServer: ToolRegistry) {

   // Register the "searchJavaTypes" tool
   mcpServer.tool(
    'searchJavaTypes',
    dedent`
      search for Java types (classes, enums, and interfaces) by their name or partial name. 
      The search scope includes not only the project's source code but also external dependencies (such as libraries or frameworks) and the JDK. 
      The result will return a list of fully qualified names of all matching Java types.
    `.trim(),
    searchJavaTypesSchema.shape,
    async (params) => {   
      const result = await searchJavaTypesTool(params);
      return {
        content: result.content.map(item => ({
          ...item,
          type: 'text' as const,
        })),
        isError: result.isError,
      };
    }
  );

  // Register the "getSourceCodeByFQN" tool
  mcpServer.tool(
    'getSourceCodeByFQN',
    dedent`
      Retrieves the source code definition of a Java type (class, enum, or interface) by its fully qualified name (FQN).
      The search scope includes not only the project's source code but also external dependencies (such as libraries or frameworks) and the JDK. 
    `.trim(),
    getSourceCodeByFQNSchema.shape,
    async (params) => {   
      const result = await getSourceCodeByFQNTool(params);
      return {
        content: result.content.map(item => ({
          ...item,
          type: 'text' as const,
        })),
        isError: result.isError,
      };
    }
  );
}
