export const initialTools = [
  {
    "name": "list_directory",
    "description": "List directory contents in a tree format, respecting .gitignore patterns.\nShows files and directories with proper indentation and icons.\nUseful for exploring workspace structure while excluding ignored files.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "Directory path to list"
        },
        "depth": {
          "type": "integer",
          "minimum": 1,
          "description": "Maximum depth for traversal (default: unlimited)"
        },
        "include_hidden": {
          "type": "boolean",
          "description": "Include hidden files/directories (default: false)"
        }
      },
      "required": [
        "path"
      ],
      "additionalProperties": false,
      "$schema": "http://json-schema.org/draft-07/schema#"
    }
  }
]
