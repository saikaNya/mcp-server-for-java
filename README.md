<div align="center">
    <a href="#zh-readme">中文</a> | <a href="#en-readme">English</a>
</div>

<h1 id="zh-readme">MCP Server For Java</h1>

一个VSCode或Cursor扩展，可将您的VSCode或Cursor转变MCP服务器，为MCP客户端（如Cursor、VSCode copilot、Claude Desktop、Cherry studio）提供高级编码辅助功能。如获取项目中的类，与通过全限定名获取类的源代码等

## 主要功能

### Java开发支持
- 在项目、外部依赖和JDK中搜索Java类型（类、接口、枚举）
- 获取项目和外部依赖的Java类型定义和源代码

### 多实例切换
- 通过点击状态栏项目，轻松在多个打开的VSCode或Cursor窗口之间切换MCP服务器。

![实例切换](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

## 内置工具

- **searchJavaTypes**: 按名称搜索Java类型（类、接口和枚举）
- **getSourceCodeByFQN**: 通过完全限定名获取Java类型的源代码定义

## 安装与设置

1. 下载安装扩展。

1. 配置您的MCP客户端：

    - **如Claude Desktop等客户端**：添加以下内容到您的配置文件(`claude_desktop_config.json`)中：

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

3. 在VSCode或Cursor状态栏右下角查看MCP服务器状态：

    - ✅: 服务器正在运行
    - ∅: 点击启动服务器

![服务器状态指示器](https://storage.googleapis.com/zenn-user-upload/321704116d4a-20250408.png)

<h1 id="en-readme">MCP Server For Java</h1>

A VSCode or Cursor extension that turns your VSCode or Cursor into an MCP server for Java development, enabling advanced coding assistance from MCP clients like Cursor, VSCode copilot, Claude Desktop, Cherry studio.

## Key Features

### Java Development Support
- Get Java type definitions and source code from both project and external dependencies
- Search for Java types (classes, interfaces, enums) across your project external dependencies and JDK

### Multi-instance Switching
- Easily switch the MCP server between multiple open VSCode or Cursor windows (just by clicking the status bar item).

![Instance switching](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

## Available Built-in Tools

- **searchJavaTypes**: Search for Java types (classes, interfaces, and enums) by name
- **getSourceCodeByFQN**: Retrieve the source code definition of a Java type by its fully qualified name

## Installation & Setup

1. Install the extension

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
