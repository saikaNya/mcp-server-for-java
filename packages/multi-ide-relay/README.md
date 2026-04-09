# MCP Server For Language

`mcp-server-for-language` 是一个面向多 IDE 的 MCP Server，当前版本同时兼容：

- IntelliJ IDEA 系列
- VSCode / Cursor / Windsurf 等 VSCode 系 IDE

当前暴露的工具能力仍然与现有 `relay` 保持一致，主要是 Java 相关的两类工具：

- `searchJavaTypes`
- `getSourceCodeByFQN`

与原有 `relay` 的主要区别：

- 工具入参中的工作目录统一为单值 `workspacePath: string`
- 启动时可通过 `--ides` 指定 IDE 优先级
- 当首选 IDE 无法处理目标目录时，支持按顺序降级到下一个 IDE

## 启动方式

默认只尝试 IDEA：

```bash
npx mcp-server-for-language
```

先尝试 IDEA，失败后降级到 VSCode：

```bash
npx mcp-server-for-language --ides idea vscode
```

指定 MCP 客户端标识：

```bash
npx mcp-server-for-language --ides idea vscode --client cursor
```

`--ides` 支持以下写法：

- `--ides idea vscode`
- `--ides idea,vscode`
- `--ides '["idea","vscode"]'`

未指定 `--ides` 时，默认值为：

```txt
["idea"]
```

## MCP 客户端配置示例

```json
{
  "mcpServers": {
    "language": {
      "command": "npx",
      "args": [
        "mcp-server-for-language",
        "--ides",
        "idea",
        "vscode",
        "--client",
        "cursor"
      ]
    }
  }
}
```

## 工具定义

### `searchJavaTypes`

入参：

```json
{
  "name": "StringUtils",
  "matchMode": "strict",
  "workspacePath": "D:/githubProject/demo"
}
```

说明：

- `name`: 必填，类名或部分类名
- `matchMode`: 可选，`strict` 或 `fuzzy`
- `workspacePath`: 必填，只允许单个目录

### `getSourceCodeByFQN`

入参：

```json
{
  "fullyQualifiedName": "org.apache.commons.lang3.StringUtils",
  "workspacePath": "D:/githubProject/demo",
  "methodNames": ["isBlank", "isEmpty"],
  "uriPath": "/D:/m2/repository/..."
}
```

说明：

- `fullyQualifiedName`: 必填，全限定名
- `workspacePath`: 必填，只允许单个目录
- `methodNames`: 可选，仅返回指定方法
- `uriPath`: 可选，当同一 FQN 存在多个候选时用于进一步定位

## 路由与降级规则

### IDEA

IDEA 通过内置 HTTP 服务调用 `language-interface` 插件接口：

- `POST http://127.0.0.1:63342/api/language-interface/search-class`
- `POST http://127.0.0.1:63342/api/language-interface/class-content`

`workspacePath` 会映射到 IDEA 接口中的 `project` 字段。

### VSCode

VSCode 通过以下方式路由：

- 读取 `~/.vscode-mcp-router-v2.json`
- 根据 `workspacePath` 查找匹配工作目录
- 命中后通过 named pipe / unix socket 转发 JSON-RPC 请求

### 何时继续降级

仅在以下情况会尝试 `ides` 中的下一个 IDE：

- VSCode 路由表中找不到目标 `workspacePath`
- IDEA 返回 `PROJECT_NOT_FOUND(2001)`
- IDEA 返回 `SPECIFIED_PROJECT_NOT_FOUND(2003)`
- IDEA HTTP 接口不可访问、连接失败或超时

以下情况不会降级，而是直接返回当前 IDE 的错误：

- 类或源码本身未找到
- IDEA 正在索引
- 请求参数不合法
- 已命中目标 IDE，但工具执行失败

## 返回格式

- `searchJavaTypes` 返回与现有 `relay` 一致的文本 JSON 数组
- `getSourceCodeByFQN` 返回代码块文本
- 当 `--client cursor` 时，项目内源码会尽量使用 Cursor 友好的代码块路径格式

## 开发

安装依赖：

```bash
pnpm install
```

构建：

```bash
pnpm build
```

测试：

```bash
pnpm test
```
