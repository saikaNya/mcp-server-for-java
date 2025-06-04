# Workspace Switching for Existing Workspaces

## Overview

The MCP Server for Java plugin includes workspace switching functionality to handle workspace mismatch scenarios. This feature is designed to work with existing workspace windows only and does not automatically open new workspaces.

## How It Works

When you call `searchJavaTypes` or `getSourceCodeByFQN` with a `workspacePath` parameter, the system will:

1. **Normalize paths**: Handle URL encoding and path format issues (e.g., `d%3A` → `d:`)
2. **Compare workspaces**: Check if the current workspace matches the requested workspace
3. **Attempt switching**: If there's a mismatch, try to switch to an existing workspace window
4. **Provide guidance**: If automatic switching fails, provide detailed manual instructions

## Usage

### Tool Parameters

Both tools accept a `workspacePath` parameter:

```json
{
  "name": "searchJavaTypes",
  "arguments": {
    "name": "String",
    "workspacePath": "d:\\githubProject\\javaProject\\linkConvert"
  }
}
```

```json
{
  "name": "getSourceCodeByFQN", 
  "arguments": {
    "fullyQualifiedName": "com.example.MyClass",
    "workspacePath": "d:\\githubProject\\javaProject\\linkConvert"
  }
}
```

### Automatic Switching

When workspace mismatch is detected, the system will:

1. Validate that the target workspace exists and is valid
2. Attempt to switch using multiple strategies based on configuration
3. Wait for the switch to complete with configurable timeout and retries
4. Verify the switch was successful

### Manual Guidance

If automatic switching fails, you'll receive detailed instructions in Chinese:

```
工作区不匹配检测。自动切换失败。

当前工作区: d:\githubProject\vscodeProject\mcp-server-for-java
请求的工作区: d:\githubProject\javaProject\linkConvert

请选择以下解决方案之一:

解决方案1: 手动工作区切换
1. 使用 Ctrl+Shift+P (或 Cmd+Shift+P) 打开命令面板
2. 输入 "File: Open Folder" 并选择
3. 导航到目标工作区: d:\githubProject\javaProject\linkConvert
4. 点击 "Select Folder" 打开工作区
5. 等待工作区完全加载后重试操作

解决方案2: 使用状态栏切换
1. 在VSCode/Cursor底部状态栏找到MCP服务器状态指示器
2. 点击状态栏项目为目标工作区激活MCP服务器
3. 重试此操作

解决方案3: 关闭当前窗口并直接打开目标工作区
1. 关闭当前VSCode/Cursor窗口
2. 重新打开VSCode/Cursor
3. 选择 "Open Folder" 并选择: d:\githubProject\javaProject\linkConvert
4. 等待工作区完全加载后重试操作
```

## Configuration

The plugin provides comprehensive configuration options:

### Basic Configuration

### `mcpServer.workspace.autoSwitch.enabled`
- **Type**: boolean
- **Default**: true
- **Description**: Enable automatic workspace switching functionality

### `mcpServer.workspace.logging.detailed`
- **Type**: boolean  
- **Default**: true
- **Description**: Enable detailed logging for debugging

### `mcpServer.workspace.logging.level`
- **Type**: string (info|warn|error)
- **Default**: info
- **Description**: Set logging level for workspace operations

### Advanced Configuration

### `mcpServer.workspace.switchStrategy`
- **Type**: string (currentWindow|newWindow|handover|all)
- **Default**: all
- **Description**: Workspace switching strategy
  - `currentWindow`: Switch in current window only
  - `newWindow`: Open in new window and handover
  - `handover`: Use handover mechanism only
  - `all`: Try all strategies sequentially

### `mcpServer.workspace.switchTimeout`
- **Type**: number
- **Default**: 15000
- **Description**: Workspace switching timeout in milliseconds. How long to wait for workspace switching to complete.

### `mcpServer.workspace.verificationRetries`
- **Type**: number
- **Default**: 5
- **Description**: Number of verification attempts when checking if workspace switch was successful.

### `mcpServer.workspace.verificationDelay`
- **Type**: number
- **Default**: 3000
- **Description**: Delay between verification attempts in milliseconds.

### Example Configuration

```json
{
  "mcpServer.workspace.autoSwitch.enabled": true,
  "mcpServer.workspace.switchStrategy": "all",
  "mcpServer.workspace.switchTimeout": 20000,
  "mcpServer.workspace.verificationRetries": 3,
  "mcpServer.workspace.verificationDelay": 5000,
  "mcpServer.workspace.logging.detailed": true,
  "mcpServer.workspace.logging.level": "info"
}
```

## Limitations

- **Existing workspaces only**: Does not automatically open new workspace windows
- **Single window support**: Designed to work with one active workspace at a time
- **Path validation**: Target workspace must exist and contain valid project files
- **Manual fallback**: Some scenarios may require manual workspace switching

## Troubleshooting

### Common Issues

1. **Target workspace not found**: Ensure the path exists and is accessible
2. **Switch timeout**: Increase `mcpServer.workspace.switchTimeout` if switching takes longer
3. **Invalid workspace**: Ensure target directory contains project files (`.vscode`, `pom.xml`, etc.)
4. **Verification fails**: Increase `mcpServer.workspace.verificationRetries` and `mcpServer.workspace.verificationDelay`

### Debugging

Enable detailed logging to see what's happening:

```json
{
  "mcpServer.workspace.logging.detailed": true,
  "mcpServer.workspace.logging.level": "info"
}
```

Check the Output panel → "MCP Server for Java" channel for detailed logs.

### Performance Tuning

For faster switching (but less reliable):
```json
{
  "mcpServer.workspace.switchTimeout": 10000,
  "mcpServer.workspace.verificationRetries": 3,
  "mcpServer.workspace.verificationDelay": 2000
}
```

For more reliable switching (but slower):
```json
{
  "mcpServer.workspace.switchTimeout": 25000,
  "mcpServer.workspace.verificationRetries": 7,
  "mcpServer.workspace.verificationDelay": 5000
}
```

## Best Practices

1. **Organize workspaces**: Keep project directories clearly structured
2. **Use absolute paths**: Provide full paths for better reliability
3. **Wait for loading**: Allow workspace to fully load before operations
4. **Check Java extensions**: Ensure Java extension pack is active in target workspace 
5. **Adjust timeouts**: Tune configuration based on your system performance
6. **Monitor logs**: Use detailed logging to understand switching behavior 