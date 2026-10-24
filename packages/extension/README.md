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
AI Code Agent 在写 Java 项目时，可以访问项目本身的源代码，但**无法获取项目依赖的类定义与源码**。导致 AI Code Agent 生成依赖包中方法时，参数出错，类型出错等。或其他不知道依赖包或 JDK 源代码导致的其他幻觉瞎编问题。

本插件将 VSCode/Cursor 转变为 MCP 服务器，让 AI Agent 能够：
- **搜索 Java 类型**：通过名称或部分名称在项目、外部依赖和 JDK 中搜索类 ————对应mcp工具`searchJavaTypes`
- **获取源代码**：通过全限定名获取任意可访问类的源码（包括依赖库和 JDK）————对应mcp工具`getSourceCodeByFQN`

![获取类的定义](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/getTypeDefinition_cn.gif)

## 多工作区支持
- v0.0.3 之前：通过点击状态栏在多个 VSCode/Cursor 工作区之间切换 MCP 服务器
- v0.0.3 起：支持同时连接多个工作区，除非用户指定 AI Agent 会自动选择当前活动窗口对应的工作区

## 首次安装与设置

1. 安装以下任意一种 Java Language Server 插件，并确保它可以正常运行 Java 项目（建议只启用一种，以免语言功能冲突）：

    - `Extension Pack for Java`：[微软插件市场](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) / [Open VSX](https://open-vsx.org/extension/vscjava/vscode-java-pack)
    - `Java and Kotlin by IntelliJ IDEA`：[微软插件市场](https://marketplace.visualstudio.com/items?itemName=JetBrains.intellij-server) / [Open VSX](https://open-vsx.org/extension/JetBrains/intellij-server)

2. 下载安装本插件。

3. 配置您的 MCP 客户端，重启并确认 MCP 工具加载完成。

    **仅使用 VSCode / Cursor / Windsurf 等 VSCode 系 IDE：**

    将以下内容添加到 Claude Desktop、Cursor、Windsurf、VSCode、Cherry Studio 等客户端的 MCP 配置文件（如 `claude_desktop_config.json`）中：

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

    **兼容 IntelliJ IDEA 和 VSCode 系 IDE：**

    如果平时会分别使用 IntelliJ IDEA 和 VSCode 系 IDE，并希望 MCP 根据目标项目自动选择可用的 IDE：

    1. 在 VSCode 系 IDE 中保留本插件并完成上述 Java Language Server 设置。
    2. 在 IntelliJ IDEA 中安装 `Language Interface` 插件并重启 IDEA，可任选以下方式：
       - **插件商店安装（推荐）**：打开 <kbd>Settings/Preferences</kbd> → <kbd>Plugins</kbd> → <kbd>Marketplace</kbd>，搜索 `Language Interface` 并点击安装。
       - **本地安装**：从 [GitHub Releases](https://github.com/saikaNya/language-interface/releases/latest) 下载插件 ZIP，然后通过 <kbd>Settings/Preferences</kbd> → <kbd>Plugins</kbd> → <kbd>⚙️</kbd> → <kbd>Install Plugin from Disk...</kbd> 选择 ZIP 安装。
    3. 使用下面的多 IDE 配置替换前面的 `vscode-to-mcp-server` 配置（不要同时配置两者，以免 MCP 工具重复）：

    ```json
    {
      "mcpServers": {
        "java-ides": {
          "command": "npx",
          "args": [
            "-y",
            "mcp-server-for-language",
            "--ides",
            "idea",
            "vscode"
          ]
        }
      }
    }
    ```

    `--ides` 后面的参数顺序就是 IDE 的优先级和降级顺序，服务会从左到右依次尝试：

    - `--ides idea vscode`：优先使用 IntelliJ IDEA，IDEA 不可用或没有打开目标项目时降级到 VSCode 系 IDE。
    - `--ides vscode idea`：优先使用 VSCode 系 IDE，无法处理目标项目时再降级到 IntelliJ IDEA。

    调用工具时，`workspacePath` 应与目标 IDE 中打开的项目根目录一致。

4. 打开一个 Java 项目，等待项目导入、依赖解析和索引完成，并确认 Java Language Server 已就绪：

    - 使用 `Extension Pack for Java` 时，状态栏中的 Java 项目加载状态应显示为已完成：

      ![Extension Pack for Java 已就绪](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/envReady.png)

    - 使用 `Java and Kotlin by IntelliJ IDEA` 时，点击状态栏中的 **Java and Kotlin**，状态菜单应显示 **Running**；正式版还应显示许可证已激活：

      ![Java and Kotlin by IntelliJ IDEA 已就绪](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/intellijLspReady.png)

## 提高工具调用率（推荐配置）
为了让 AI Agent 更主动地调用本插件提供的工具，建议在系统提示词中添加以下内容（如果你没有更好或者更适合自己应用场景的提示词）：
```txt
通过项目源代码找不到的类或类的定义或方法具体实现，且有类名或者部分类名时，可以使用工具 searchJavaTypes 与 getSourceCodeByFQN 判断其是否存在，或获取其源代码
```

## 插件参数声明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `mcpServer.maxOutputLength` | number | `70000` | 最大输出 Java 源代码字符数。当要获取的类的源代码超过此限制时会报错。不建议设置过大，过大会导致模型 input token 过大无法请求模型，或无法将类的源代码放入上下文中。 |
| `mcpServer.enableRelayVersionCheck` | boolean | `true` | 是否启用 relay 版本更新检查和通知。设置为 `false` 可禁用版本更新提醒。 |

## 联系
**非常欢迎大家对插件的问题，bug或新功能建议进行反馈！** 🙇

## 更新日志
- **0.0.8** 兼容 Java and Kotlin by IntelliJ IDEA 插件
- **0.0.7** 多根工作区支持
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
When working on Java projects, AI Code Agents can access the project's own source code, but **cannot retrieve class definitions and source code from project dependencies**. As a result, generated calls to dependency APIs may use incorrect argument counts or types, while the lack of visibility into dependency and JDK source code can lead to other hallucinated classes, methods, or fields.

This extension turns VSCode/Cursor into an MCP server, enabling AI Agents to:
- **Search Java Types**: Search for classes by name or partial name across your project, external dependencies, and JDK — corresponding MCP tool `searchJavaTypes`
- **Get Source Code**: Retrieve source code of any accessible class by fully qualified name (including dependency libraries and JDK) — corresponding MCP tool `getSourceCodeByFQN`

![Get Type Definition](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/getTypeDefinition_eng.gif)

## Multi-Workspace Support
- Before v0.0.3: Switch MCP server between multiple VSCode/Cursor workspaces by clicking the status bar
- From v0.0.3: Supports connecting to multiple workspaces simultaneously. Unless specified by the user, AI Agent will automatically select the workspace corresponding to the currently active window

## Installation & Setup

1. Install either of the following Java Language Server extensions and make sure it can run Java projects normally (enable only one to avoid conflicting language features):

    - `Extension Pack for Java`: [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-java-pack) / [Open VSX](https://open-vsx.org/extension/vscjava/vscode-java-pack)
    - `Java and Kotlin by IntelliJ IDEA`: [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=JetBrains.intellij-server) / [Open VSX](https://open-vsx.org/extension/JetBrains/intellij-server)

2. Download and install this extension.

3. Configure your MCP client, restart it, and confirm that the MCP tools are loaded.

    **Use VSCode-based IDEs only (VSCode, Cursor, Windsurf, and similar IDEs):**

    Add the following to the MCP configuration file (such as `claude_desktop_config.json`) of Claude Desktop, Cursor, Windsurf, VSCode, Cherry Studio, or another client:

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

    **Use both IntelliJ IDEA and VSCode-based IDEs:**

    If you use IntelliJ IDEA and VSCode-based IDEs separately and want MCP to select an available IDE for the target project automatically:

    1. Keep this extension installed in the VSCode-based IDE and complete the Java Language Server setup above.
    2. Install the `Language Interface` plugin in IntelliJ IDEA using either method below, then restart IDEA:
       - **Marketplace (recommended)**: Open <kbd>Settings/Preferences</kbd> → <kbd>Plugins</kbd> → <kbd>Marketplace</kbd>, search for `Language Interface`, and install it.
       - **Install from disk**: Download the plugin ZIP from [GitHub Releases](https://github.com/saikaNya/language-interface/releases/latest), then open <kbd>Settings/Preferences</kbd> → <kbd>Plugins</kbd> → <kbd>⚙️</kbd> → <kbd>Install Plugin from Disk...</kbd> and select the ZIP.
    3. Replace the preceding `vscode-to-mcp-server` configuration with the multi-IDE configuration below. Do not configure both servers, or the MCP tools will be duplicated.

    ```json
    {
      "mcpServers": {
        "java-ides": {
          "command": "npx",
          "args": [
            "-y",
            "mcp-server-for-language",
            "--ides",
            "idea",
            "vscode"
          ]
        }
      }
    }
    ```

    The arguments after `--ides` define both IDE priority and fallback order. The server tries them from left to right:

    - `--ides idea vscode`: Prefer IntelliJ IDEA and fall back to a VSCode-based IDE when IDEA is unavailable or has not opened the target project.
    - `--ides vscode idea`: Prefer a VSCode-based IDE and fall back to IntelliJ IDEA when VSCode cannot handle the target project.

    The `workspacePath` passed to a tool should match the project root open in the target IDE.

4. Open a Java project, wait for project import, dependency resolution, and indexing to finish, and verify that the Java Language Server is ready:

    - With `Extension Pack for Java`, the Java project loading status in the status bar should show that loading is complete:

      ![Extension Pack for Java ready](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/envReady.png)

    - With `Java and Kotlin by IntelliJ IDEA`, click **Java and Kotlin** in the status bar and verify that its status menu displays **Running**. Stable releases should also show an active license:

      ![Java and Kotlin by IntelliJ IDEA ready](https://raw.githubusercontent.com/saikaNya/mcp-server-for-java/refs/heads/main/images/intellijLspReady.png)

## Improve Tool Invocation Rate (Recommended Configuration)
To help AI Agents invoke the tools provided by this extension more proactively, it is recommended to add the following content to your system prompt (if you don't have a better or more suitable prompt for your use case):
```txt
When you cannot find the class, class definition, or specific implementation of methods through the project source code, and you have the class name or partial class name, you can use the tools searchJavaTypes and getSourceCodeByFQN to check if it exists or get its source code
```

## Extension Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mcpServer.maxOutputLength` | number | `70000` | Maximum number of characters for Java source code output. An error will be reported when the source code exceeds this limit. It is not recommended to set it too large, as excessive values may cause the model's input token to be too large or make it impossible to place the class source code in the context. |
| `mcpServer.enableRelayVersionCheck` | boolean | `true` | Whether to enable relay version update check and notification. Set to `false` to disable version update warnings. |

## Contact
**Feedback on issues, bugs, or suggestions for new features is highly welcomed!** 🙇

## Changelog
- **0.0.8** Add compatibility with the Java and Kotlin by IntelliJ IDEA extension
- **0.0.7** Multi-root workspace support
- **0.0.5** Support filtering by method names when retrieving source code
- **0.0.4** Support for retrieving classes with the same fully qualified name from multiple versions
- **0.0.3** MCP commands auto-route to multiple workspaces without manual switching
- **0.0.2** Fixed a bug where querying fully qualified names sometimes returned non-matching results