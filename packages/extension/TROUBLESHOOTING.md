# MCP Server for Java 故障排除指南

## 工作区切换问题

### 问题描述
当MCP服务器尝试自动切换工作区时，可能会遇到切换失败的情况。通常表现为以下错误信息：

```
工作区不匹配检测。自动切换失败。
当前工作区: d:\githubProject\vscodeProject\hello-vscode
请求的工作区: d:\githubProject\javaProject\linkConvert
```

### 常见原因

1. **工作区切换时间不足**: VSCode/Cursor需要时间来完全加载新工作区
2. **权限问题**: 目标工作区可能没有读取权限
3. **路径问题**: 目标工作区路径不存在或无效
4. **Java扩展未激活**: 目标工作区中Java扩展包未正确加载

### 解决方案

#### 方案1: 调整配置参数 (推荐)

在VSCode/Cursor设置中添加以下配置来增加等待时间：

```json
{
  "mcpServer.workspace.switchTimeout": 20000,
  "mcpServer.workspace.verificationRetries": 7,
  "mcpServer.workspace.verificationDelay": 5000,
  "mcpServer.workspace.logging.detailed": true
}
```

这将：
- 增加工作区切换超时到20秒
- 增加验证重试次数到7次
- 增加每次验证之间的延迟到5秒
- 启用详细日志记录

#### 方案2: 手动工作区切换

1. **关闭所有VSCode/Cursor窗口**
2. **重新打开VSCode/Cursor**
3. **直接打开目标工作区**:
   - 使用 `Ctrl+Shift+P` (Windows/Linux) 或 `Cmd+Shift+P` (Mac)
   - 输入 "File: Open Folder"
   - 选择目标工作区: `d:\githubProject\javaProject\linkConvert`
4. **等待工作区完全加载** (查看状态栏确认Java扩展已激活)
5. **重试MCP操作**

#### 方案3: 使用状态栏切换

1. **在底部状态栏找到MCP服务器状态指示器**
2. **点击状态栏项目**
3. **选择"为目标工作区激活MCP服务器"选项**
4. **等待服务器重启完成**

#### 方案4: 创建多根工作区

创建一个 `.code-workspace` 文件包含所有项目：

```json
{
    "folders": [
        {
            "path": "d:\\githubProject\\vscodeProject\\hello-vscode"
        },
        {
            "path": "d:\\githubProject\\javaProject\\linkConvert"
        }
    ],
    "settings": {
        "mcpServer.workspace.autoSwitch.enabled": true
    }
}
```

### 验证解决方案

执行以下步骤验证问题已解决：

1. **检查当前工作区**: 确认VSCode显示正确的工作区名称
2. **验证Java扩展**: 确认状态栏显示Java项目已识别
3. **测试MCP功能**: 尝试搜索Java类型或获取源代码
4. **查看日志**: 检查输出面板中的"MCP Server for Java"通道

### 预防措施

1. **保持工作区整洁**: 确保项目目录结构清晰
2. **使用绝对路径**: 在MCP调用中提供完整路径
3. **定期更新扩展**: 保持Java扩展包和MCP服务器为最新版本
4. **监控系统性能**: 在慢速系统上适当增加超时时间

### 高级配置

对于复杂环境，可以使用以下高级配置：

```json
{
  "mcpServer.workspace.autoSwitch.enabled": true,
  "mcpServer.workspace.switchStrategy": "all",
  "mcpServer.workspace.switchTimeout": 25000,
  "mcpServer.workspace.verificationRetries": 10,
  "mcpServer.workspace.verificationDelay": 4000,
  "mcpServer.workspace.logging.detailed": true,
  "mcpServer.workspace.logging.level": "info"
}
```

### 日志分析

启用详细日志后，查找以下关键信息：

- `Workspace switch command executed successfully`: 切换命令已执行
- `Verification attempt X/Y`: 验证尝试次数
- `Current workspace after wait`: 等待后的当前工作区
- `Workspace verification failed`: 验证失败

如果看到多次验证失败，说明需要增加等待时间或重试次数。

### 联系支持

如果以上方案都无法解决问题，请：

1. 启用详细日志记录
2. 收集完整的错误日志
3. 记录系统环境信息 (操作系统、VSCode版本、Java版本)
4. 在GitHub仓库提交issue: https://github.com/saikaNya/mcp-server-for-java

---

## 其他常见问题

### MCP服务器无法启动

**症状**: 状态栏显示"MCP Server: Not Running"

**解决方案**:
1. 检查端口冲突 (默认60100)
2. 重启VSCode/Cursor
3. 检查防火墙设置

### Java类型搜索无结果

**症状**: `searchJavaTypes` 返回空结果

**解决方案**:
1. 确认工作区包含Java项目
2. 等待Java扩展完全加载项目
3. 检查项目构建状态 (Maven/Gradle)

### 源代码获取失败

**症状**: `getSourceCodeByFQN` 返回错误

**解决方案**:
1. 确认类的完全限定名正确
2. 检查类是否在当前工作区的classpath中
3. 验证Java Language Server已启动 