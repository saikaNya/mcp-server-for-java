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

![获取类的定义](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/getTypeDefinition_cn.gif)

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
![项目完全加载完毕](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/envReady.png)

## 插件参数声明
`mcpServer.maxOutputLength`最大输出java源代码字符数，默认为70000，即要获取的类的源代码超过70000个字符就会报错。可以手动调整该参数，控制插件的最大类源代码输出字符数，但并不建议调的过大，过大会造成模型input token过大无法请求模型，或无法将类的源代码放入上下文中。

## 后续规划
1. 使用lombook注解替换类源码或反编译后的源码中的 getter，setter，toString等。
2. 类源码过大支持，隐藏类所有方法的实现，并支持显示传入特定方法。

## 联系
**非常欢迎大家对插件的问题，bug或新功能建议进行反馈！** 🙇

<h1 id="en-readme">MCP Server For Java</h1>

## Background
AI code agents developed based on VSCode such as Cursor, Github copilot, and Winsurf can access a Java project's own source code when writing Java projects, but they cannot access the classes from project dependencies. This extension is designed to solve the problem that AI code agents cannot access code from project dependency packages.

## Description
A VSCode or Cursor extension that turns your VSCode or Cursor into an MCP server, providing advanced coding assistance for MCP clients (such as Cursor, VSCode copilot, Claude Desktop, Cherry studio). Features include retrieving classes from your project and getting source code via fully qualified names (including project source code and classes from all accessible dependencies in the project).

## Key Features

### Java Development Support
- Search for Java types (classes, interfaces, enums) across your project, external dependencies, and JDK
- Get Java type definitions and source code from both project and external dependencies

![Get Type Definition](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/getTypeDefinition_eng.gif)

### Multi-instance Switching (Note: Functionality will run on the only MCP server in running status)
- Easily switch the MCP server between multiple open VSCode or Cursor windows by clicking the status bar item.

![Instance switching](https://storage.googleapis.com/zenn-user-upload/0a2bc2bee634-20250407.gif)

## Available Built-in Tools

- **searchJavaTypes**: Search for Java types (classes, interfaces, and enums) by name
- **getSourceCodeByFQN**: Retrieve the source code definition of a Java type by its fully qualified name

## Installation & Setup

1. Confirm that the [Extension Pack for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) plugin is installed and can run Java projects normally

2. Download and install this extension [MCP Server for Java](https://marketplace.visualstudio.com/items?itemName=saika.mcp-server-for-java).

3. Configure your MCP client:

    - **For clients like Claude Desktop, Cursor, Winsurf, VSCode, Cherry studio**: Add the following to your configuration file (`claude_desktop_config.json`):

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

4. Check the MCP server status in the bottom-right VSCode or Cursor status bar:

    - ✅: Server is running
    - ∅: Click to start the server

![Server status indicator](https://storage.googleapis.com/zenn-user-upload/321704116d4a-20250408.png)

5. Open a Java project and make sure the project is fully loaded
![Project fully loaded](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/envReady.png)

## Extension Parameter Declaration
`mcpServer.maxOutputLength` is the maximum number of characters for Java source code output, with a default value of 70000. This means that if the source code of the class you want to retrieve exceeds 70000 characters, an error will be reported. You can manually adjust this parameter to control the maximum character output of class source code, but it is not recommended to set it too large, as excessive values may cause the model's input token to be too large to request the model, or make it impossible to place the class source code in the context.

## Future Plans
1. Use Lombok annotations to replace getters, setters, toString, etc. in class source code or decompiled source code.
2. Support for large class source code, hiding all method implementations in the class and supporting the display of specific methods when passed in.

## Contact
**Feedback on issues, bugs, or suggestions for new features of the extension is highly welcomed!** 🙇
