# MCP Server For Java

A VSCode or Cursor extension that turns your VSCode or Cursor into an MCP server for Java development, enabling advanced coding assistance from MCP clients like Cursor, VSCode copilot, Claude Desktop, Cherry studio.

## Key Features

### Java Development Support
- Get Java type definitions and source code from both project and external dependencies
- Search for Java types (classes, interfaces, enums) across your project external dependencies and JDK
- Benefit from real-time diagnostic messages for Java code

![Code editing diff](https://storage.googleapis.com/zenn-user-upload/778b7e9ad8c4-20250407.gif)

### Multi-instance Switching
- Easily switch the MCP server between multiple open VSCode or Cursor windows (just by clicking the status bar item).

![Instance switching](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

## Available Built-in Tools

- **searchJavaTypes**: Search for Java types (classes, interfaces, and enums) by name
- **getSourceCodeByFQN**: Retrieve the source code definition of a Java type by its fully qualified name

## Installation & Setup

1. Install the extension from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=saika.mcp-server-for-java).

2. Configure your MCP client:

    - **clients like Claude Desktop**: Add the following to your configuration file (`claude_desktop_config.json`):

    ```json
    {
      "mcpServers": {
        "vscode-java": {
          "command": "npx",
          "args": ["vscode-as-mcp-server"]
        }
      }
    }
    ```

3. Check the MCP server status in the bottom-right VSCode or Cursor status bar:

    - ✅: Server is running
    - ∅: Click to start the server

![Server status indicator](https://storage.googleapis.com/zenn-user-upload/321704116d4a-20250408.png)
