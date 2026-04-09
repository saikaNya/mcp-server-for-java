const workspacePathProperty = {
  type: 'string',
  description: 'Specify the absolute path of the workspace in which to search. Pass the current workspace path unless the user specifies otherwise.',
};

export const initialTools = [
  {
    name: 'searchJavaTypes',
    description:
      "search for Java types (classes, enums, and interfaces) by their name or partial name.\nThe search scope includes not only the project's source code but also external dependencies (such as libraries or frameworks) and the JDK.\nThe result will return a list of fully qualified names or uri paths of all matching Java types.",
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name or partial name of the Java types (classes, enums, and interfaces) to search for.',
        },
        matchMode: {
          type: 'string',
          enum: ['strict', 'fuzzy'],
          description:
            "Match mode for search. 'strict' (default) matches only when the simple name or fully qualified name is exactly the same. 'fuzzy' matches when partial match is found.",
        },
        workspacePath: workspacePathProperty,
      },
      required: ['name', 'workspacePath'],
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
    },
  },
  {
    name: 'getSourceCodeByFQN',
    description:
      'Given a fully qualified name (FQN), returns the source code definition of the corresponding Java type (class, interface, or enum).\nThe search includes:\n- Project source code\n- External dependencies (libraries and frameworks)\n- JDK source code',
    inputSchema: {
      type: 'object',
      properties: {
        fullyQualifiedName: {
          type: 'string',
          description: 'The fully qualified name (FQN) of the Java type to retrieve its source code.',
        },
        workspacePath: workspacePathProperty,
        methodNames: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Optional list of method names to filter. If provided, only methods whose simple name is in this list will be returned; all other methods will not be included in the result, but the rest of the class content is kept unchanged.',
        },
        uriPath: {
          type: 'string',
          description: 'The IDE uri path. Only required when the fully qualified name cannot uniquely identify a single uri.',
        },
      },
      required: ['fullyQualifiedName', 'workspacePath'],
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
    },
  },
];
