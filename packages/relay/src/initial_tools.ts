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
    "name": "searchJavaTypes",
    "description": "Searches for Java types (classes, interfaces, and enums) by full name, partial name, or package name.\nThe search scope includes:\n- Project source code\n- External dependencies (libraries and frameworks)\n- JDK source code\nReturns a list of fully qualified names (FQNs) of all matching types.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The class name, partial class name, or package name of the Java types (classes, enums, and interfaces) to search for."
        },
        "workspacePaths": workspacePathsProperty
      },
      "required": [
        "name",
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
