<div align="center">
    <a href="#zh-readme">中文</a> | <a href="#en-readme">English</a>
</div>

<h1 id="zh-readme">MCP Server For Java</h1>

## 背景
我们知道Cursor,Github copilot,Winsurf等，基于vscode开发的ai code agent在编写java项目时。可以获取项目本身的源代码，但无法获取项目依赖的类。本插件就是为了解决ai code agent，无法获取项目依赖包代码的问题。

## 描述
一个VSCode或Cursor插件，可将您的VSCode或Cursor作为MCP服务器，为MCP客户端（如Cursor、VSCode copilot、Claude Desktop、Cherry studio）提供高级编码辅助功能。如获取项目中的类，与通过全限定名获取类的源代码等（包含项目源代码，以及项目中所有可访问依赖中的类）

## 主要功能

### Java开发支持
- 在项目、外部依赖和JDK中搜索Java类型（类、接口、枚举）
- 获取项目和外部依赖的Java类型定义和源代码

![获取类的定义](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

### 多实例切换（注：功能会运行在唯一处于运行状态的mcp server上）
- 通过点击状态栏项目，轻松在多个打开的VSCode或Cursor窗口之间切换MCP服务器。

![实例切换](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

## 内置工具

- **searchJavaTypes**: 按名称搜索Java类型（类、接口和枚举）
- **getSourceCodeByFQN**: 通过完全限定名获取Java类型的源代码定义

## 首次安装与设置

1. 确认已经安装插件[Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) 且可正常运行java项目

2. 下载安装本插件[MCP Server for Java](https://marketplace.visualstudio.com/items?itemName=saika.mcp-server-for-java)。

3. 配置您的MCP客户端：

    - **如Claude Desktop，Curosr，Winsurf，Vsocde，Cherry studio等客户端**：添加以下内容到您的配置文件(`claude_desktop_config.json`)中：

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
4. 在VSCode或Cursor状态栏右下角查看MCP服务器状态：

    - ✅: 服务器正在运行
    - ∅: 点击启动服务器

![服务器状态指示器](https://storage.googleapis.com/zenn-user-upload/321704116d4a-20250408.png)

5. 打开一个java项目，并确保项目完全加载完毕
![项目完全加载完毕](https://storage.googleapis.com/zenn-user-upload/321704116d4a-20250408.png)

## 插件参数声明
`mcpServer.maxOutputLength`最大输出java源代码字符数，默认为70000，即要获取的类的源代码超过70000个字符就会报错。可以手动调整该参数，控制插件的最大类源代码输出字符数，但并不建议调的过大，过大会造成模型input token过大无法请求模型，或无法将类的源代码放入上下文中。

## 后续规划
1. 使用lombook注解替换类源码或反编译后的源码中的 getter，setter，toString等。
2. 类源码过大支持，隐藏类所有方法的实现，并支持显示传入特定方法。

## 联系
**非常欢迎大家对插件的问题，bug或新功能建议进行反馈！** 🙇

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
