<div align="center">
    <a href="#zh-readme">中文</a> | <a href="#en-readme">English</a>
</div>

<h1 id="zh-readme">MCP Server For Java</h1>

> ⚠️ **v0.0.3 重要更新**
>
> MCP 客户端配置需要从：
> ```json
> {
>   "command": "npx",
>   "args": ["vscode-as-mcp-server"]
> }
> ```
> 或
> ```json
> {
>   "url": "http://localhost:60100"
> }
> ```
> 修改为：
> ```json
> {
>   "command": "npx",
>   "args": ["vscode-to-mcp-server"]
> }
> ```
> 如果不修改配置，将无法自动在多工作区间切换，只能获取第一个打开的工作区的类。

## 简介
Cursor、Github Copilot、Windsurf 等基于 VSCode 开发的 AI Code Agent 在编写 Java 项目时，可以访问项目本身的源代码，但**无法获取项目依赖的类定义与源码**。

本插件将 VSCode/Cursor 转变为 MCP 服务器，让 AI Agent 能够：
- **搜索 Java 类型**：通过名称或部分名称在项目、外部依赖和 JDK 中搜索类 ————对应mcp工具`searchJavaTypes`
- **获取源代码**：通过全限定名获取任意可访问类的源码（包括依赖库和 JDK）————对应mcp工具`getSourceCodeByFQN`

![获取类的定义](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/getTypeDefinition_cn.gif)

## 多工作区支持
- v0.0.3 之前：通过点击状态栏在多个 VSCode/Cursor 工作区之间切换 MCP 服务器
- v0.0.3 起：支持同时连接多个工作区，除非用户指定 AI Agent 会自动选择当前活动窗口对应的工作区

## 首次安装与设置

1. 确认已经安装插件`Extension Pack for Java`[微软插件商品版本](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack)或[Open VSX 版本](https://open-vsx.org/extension/vscjava/vscode-java-pack) 且可正常运行java项目

2. 下载安装本插件。

3. 配置您的MCP客户端，重启并确认mcp工具加载完成：

    - **如Claude Desktop，Curosr，Winsurf，Vsocde，Cherry studio等客户端**：添加以下内容到您的配置文件(`claude_desktop_config.json`)中：

    ```json
    {
      "mcpServers": {
        "vscode-java": {
          "command": "npx",
          "args": [
            "vscode-to-mcp-server"
          ]
        }
      }
    }
    ```

4. 打开一个java项目，并确保项目完全加载完毕
![项目完全加载完毕](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/envReady.png)

## 提高工具调用率（推荐配置）
为了让 AI Agent 更主动地调用本插件提供的工具，建议在系统提示词中添加以下内容（如果你没有更好或者更适合自己应用场景的提示词）：
```txt
通过项目源代码找不到的类或类的定义或方法具体实现，且有类名或者部分类名时，可以使用工具 searchJavaTypes 与 getSourceCodeByFQN 判断其是否存在，或获取其源代码
```
> 💡 以 Cursor 为例，可以在 **Settings → General → Rules for AI → User Rules** 中添加

## 插件参数声明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mcpServer.maxOutputLength` | number | `70000` | 最大输出 Java 源代码字符数。当要获取的类的源代码超过此限制时会报错。不建议设置过大，过大会导致模型 input token 过大无法请求模型，或无法将类的源代码放入上下文中。 |
| `mcpServer.enableRelayVersionCheck` | boolean | `true` | 是否启用 relay 版本更新检查和通知。设置为 `false` 可禁用版本更新提醒。 |

## 联系
**非常欢迎大家对插件的问题，bug或新功能建议进行反馈！** 🙇

## 更新日志
- **0.0.5** 获取源码时，支持按方法名过滤
- **0.0.4** 支持获取工作区中存在的全限定名相同但版本不同的类
- **0.0.3** mcp指令执行在多个工作区自动路由，无需手动切换
- **0.0.2** 修改了查询全限定名有时候会查出不符合条件的结果的bug

<h1 id="en-readme">MCP Server For Java</h1>

> ⚠️ **v0.0.3 Important Update**
>
> MCP client configuration needs to be changed from:
> ```json
> {
>   "command": "npx",
>   "args": ["vscode-as-mcp-server"]
> }
> ```
> or
> ```json
> {
>   "url": "http://localhost:60100"
> }
> ```
> to:
> ```json
> {
>   "command": "npx",
>   "args": ["vscode-to-mcp-server"]
> }
> ```
> Without updating the configuration, automatic multi-workspace switching will not work, and only classes from the first opened workspace will be accessible.

## Overview
AI Code Agents based on VSCode (such as Cursor, Github Copilot, Windsurf) can access a Java project's own source code, but **cannot retrieve class definitions and source code from project dependencies**.

This extension turns VSCode/Cursor into an MCP server, enabling AI Agents to:
- **Search Java Types**: Search for classes by name or partial name across your project, external dependencies, and JDK — corresponding MCP tool `searchJavaTypes`
- **Get Source Code**: Retrieve source code of any accessible class by fully qualified name (including dependency libraries and JDK) — corresponding MCP tool `getSourceCodeByFQN`

![Get Type Definition](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/getTypeDefinition_eng.gif)

## Multi-Workspace Support
- Before v0.0.3: Switch MCP server between multiple VSCode/Cursor workspaces by clicking the status bar
- From v0.0.3: Supports connecting to multiple workspaces simultaneously. Unless specified by the user, AI Agent will automatically select the workspace corresponding to the currently active window

## Installation & Setup

1. Confirm that the `Extension Pack for Java` plugin is installed ([VS Marketplace](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) or [Open VSX](https://open-vsx.org/extension/vscjava/vscode-java-pack)) and can run Java projects normally

2. Download and install this extension.

3. Configure your MCP client, restart and confirm MCP tools are loaded:

    - **For clients like Claude Desktop, Cursor, Winsurf, VSCode, Cherry studio**: Add the following to your configuration file (`claude_desktop_config.json`):

    ```json
    {
      "mcpServers": {
        "vscode-java": {
          "command": "npx",
          "args": [
            "vscode-to-mcp-server"
          ]
        }
      }
    }
    ```

4. Open a Java project and make sure the project is fully loaded
![Project fully loaded](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/envReady.png)

## Improve Tool Invocation Rate (Recommended Configuration)
To help AI Agents invoke the tools provided by this extension more proactively, it is recommended to add the following content to your system prompt (if you don't have a better or more suitable prompt for your use case):
```txt
When you cannot find the class, class definition, or specific implementation of methods through the project source code, and you have the class name or partial class name, you can use the tools searchJavaTypes and getSourceCodeByFQN to check if it exists or get its source code
```
> 💡 For example, in Cursor, you can add this in **Settings → General → Rules for AI → User Rules**

## Extension Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mcpServer.maxOutputLength` | number | `70000` | Maximum number of characters for Java source code output. An error will be reported when the source code exceeds this limit. It is not recommended to set it too large, as excessive values may cause the model's input token to be too large or make it impossible to place the class source code in the context. |
| `mcpServer.enableRelayVersionCheck` | boolean | `true` | Whether to enable relay version update check and notification. Set to `false` to disable version update warnings. |

## Contact
**Feedback on issues, bugs, or suggestions for new features is highly welcomed!** 🙇

## Changelog
- **0.0.5** Support filtering by method names when retrieving source code
- **0.0.4** Support for retrieving classes with the same fully qualified name from multiple versions
- **0.0.3** MCP commands auto-route to multiple workspaces without manual switching
- **0.0.2** Fixed a bug where querying fully qualified names sometimes returned non-matching results