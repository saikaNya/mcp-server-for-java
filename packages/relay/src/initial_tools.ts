// Common workspace property definition for all tools
const workspaceProperty = {
  "type": "string",
  "description": "Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise."
};

export const initialTools = [
  {
    "name": "searchJavaTypes",
    "description": "search for Java types (classes, enums, and interfaces) by their name or partial name.\nThe search scope includes not only the project's source code but also external dependencies (such as libraries or frameworks) and the JDK.\nThe result will return a list of fully qualified names of all matching Java types.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "description": "The name or partial name of the Java types (classes, enums, and interfaces) to search for."
        },
        "workspace": workspaceProperty
      },
      "required": [
        "name","workspace"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  },
  {
    "name": "getSourceCodeByFQN",
    "description": "Retrieves the source code definition of a Java type (class, enum, or interface) by its fully qualified name (FQN).\nThe search scope includes not only the project's source code but also external dependencies (such as libraries or frameworks) and the JDK.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "fullyQualifiedName": {
          "type": "string",
          "description": "The fully qualified name (FQN) of the Java type to retrieve its source code."
        },
        "uriPath": {
          "type": "string",
          "description": "The vscode uri path. Only required when the fully qualified name cannot uniquely identify a single uri."
        },
        "workspace": workspaceProperty
      },
      "required": [
        "fullyQualifiedName","workspace"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
]
