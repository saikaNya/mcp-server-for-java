// Common workspacePaths property definition for all tools
const workspacePathsProperty = {
  "type": "array",
  "items": {
    "type": "string"
  },
  "description": "Specify the absolute paths of the workspaces in which to search. Pass the current workspace paths unless the user specifies otherwise."
};

export const initialTools = [
  {
    "name": "searchSymbol",
    "description": "Searches for symbols (classes, interfaces, enums, methods, functions, variables, etc.) by name across multiple languages.\nThe search scope includes:\n- Project source code\n- External dependencies (libraries and frameworks)\n- JDK source code (for Java)\nReturns results grouped by language with symbol details.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "symbolName": {
          "type": "string",
          "description": "The symbol name to search for."
        },
        "symbolCategories": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["type", "callable", "data", "container", "other"]
          },
          "description": "Filter symbols by category. If not provided, no filtering is applied. Available categories: 'type' (Class, Interface, Enum, Struct), 'callable' (Method, Function, Constructor, Operator), 'data' (Property, Field, Variable, Constant, EnumMember), 'container' (File, Module, Namespace, Package), 'other' (Others...)."
        },
        "matchMode": {
          "type": "string",
          "enum": ["strict", "fuzzy"],
          "description": "Match mode for symbol search. 'strict' (default) matches only when the simple name or fully qualified name is exactly the same. 'fuzzy' matches when partial match is found."
        },
        "workspacePaths": workspacePathsProperty
      },
      "required": [
        "symbolName",
        "workspacePaths"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "getSourceCodeByFQN",
    "description": "Given a fully qualified name (FQN), returns the source code definition of the corresponding Java type (class, interface, or enum).\nThe search includes:\n- Project source code\n- External dependencies (libraries and frameworks)\n- JDK source code",
    "inputSchema": {
      "type": "object",
      "properties": {
        "fullyQualifiedName": {
          "type": "string",
          "description": "The fully qualified name (FQN) of the Java type to retrieve its source code."
        },
        "workspacePaths": workspacePathsProperty,
        "methodNames": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Optional list of method names to filter. If provided, only methods whose simple name is in this list will be returned; all other methods will not be included in the result, but the rest of the class content is kept unchanged."
        },
        "uriPath": {
          "type": "string",
          "description": "The vscode uri path. Only required when the fully qualified name cannot uniquely identify a single uri."
        }
      },
      "required": [
        "fullyQualifiedName",
        "workspacePaths"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
]
