import * as vscode from "vscode";
import { z } from "zod";

/**
 * 符号类别枚举
 * - type: 类型定义 (Class, Interface, Enum, Struct)
 * - callable: 可调用成员 (Method, Function, Constructor, Operator)
 * - data: 数据成员 (Property, Field, Variable, Constant, EnumMember)
 * - container: 容器/组织单元 (File, Module, Namespace, Package)
 * - other: 其他 (String, Number, Boolean, Array, Object, Key, Null, TypeParameter, Event)
 */
export const SymbolCategoryEnum = z.enum(['type', 'callable', 'data', 'container', 'other']);
export type SymbolCategory = z.infer<typeof SymbolCategoryEnum>;

/**
 * 符号类别到 SymbolKind 的映射
 */
export const categoryToSymbolKinds: Record<SymbolCategory, vscode.SymbolKind[]> = {
  type: [
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Enum,
    vscode.SymbolKind.Struct,
  ],
  callable: [
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Constructor,
    vscode.SymbolKind.Operator,
  ],
  data: [
    vscode.SymbolKind.Property,
    vscode.SymbolKind.Field,
    vscode.SymbolKind.Variable,
    vscode.SymbolKind.Constant,
    vscode.SymbolKind.EnumMember,
  ],
  container: [
    vscode.SymbolKind.File,
    vscode.SymbolKind.Module,
    vscode.SymbolKind.Namespace,
    vscode.SymbolKind.Package,
  ],
  other: [
    vscode.SymbolKind.String,
    vscode.SymbolKind.Number,
    vscode.SymbolKind.Boolean,
    vscode.SymbolKind.Array,
    vscode.SymbolKind.Object,
    vscode.SymbolKind.Key,
    vscode.SymbolKind.Null,
    vscode.SymbolKind.TypeParameter,
    vscode.SymbolKind.Event,
  ],
};

/**
 * SymbolKind 转换为可读字符串
 */
export function symbolKindToString(kind: vscode.SymbolKind): string {
  const kindMap: Record<vscode.SymbolKind, string> = {
    [vscode.SymbolKind.File]: 'File',
    [vscode.SymbolKind.Module]: 'Module',
    [vscode.SymbolKind.Namespace]: 'Namespace',
    [vscode.SymbolKind.Package]: 'Package',
    [vscode.SymbolKind.Class]: 'Class',
    [vscode.SymbolKind.Method]: 'Method',
    [vscode.SymbolKind.Property]: 'Property',
    [vscode.SymbolKind.Field]: 'Field',
    [vscode.SymbolKind.Constructor]: 'Constructor',
    [vscode.SymbolKind.Enum]: 'Enum',
    [vscode.SymbolKind.Interface]: 'Interface',
    [vscode.SymbolKind.Function]: 'Function',
    [vscode.SymbolKind.Variable]: 'Variable',
    [vscode.SymbolKind.Constant]: 'Constant',
    [vscode.SymbolKind.String]: 'String',
    [vscode.SymbolKind.Number]: 'Number',
    [vscode.SymbolKind.Boolean]: 'Boolean',
    [vscode.SymbolKind.Array]: 'Array',
    [vscode.SymbolKind.Object]: 'Object',
    [vscode.SymbolKind.Key]: 'Key',
    [vscode.SymbolKind.Null]: 'Null',
    [vscode.SymbolKind.EnumMember]: 'EnumMember',
    [vscode.SymbolKind.Struct]: 'Struct',
    [vscode.SymbolKind.Event]: 'Event',
    [vscode.SymbolKind.Operator]: 'Operator',
    [vscode.SymbolKind.TypeParameter]: 'TypeParameter',
  };
  return kindMap[kind] || 'Unknown';
}

/**
 * 构建 Java 的全限定名
 */
export function buildJavaFqn(symbol: vscode.SymbolInformation): string {
  if (symbol.name.includes('.')) {
    return symbol.name;
  }
  if (symbol.containerName && symbol.containerName.length > 0) {
    return `${symbol.containerName}.${symbol.name}`;
  }
  return symbol.name;
}

/**
 * 文件扩展名到语言的映射
 */
const extensionToLanguage: Record<string, string> = {
  // Java
  '.java': 'java',
  // JavaScript/TypeScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hxx': 'cpp',
  // C#
  '.cs': 'csharp',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // Ruby
  '.rb': 'ruby',
  // PHP
  '.php': 'php',
  // Swift
  '.swift': 'swift',
  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  // Scala
  '.scala': 'scala',
  // Lua
  '.lua': 'lua',
  // Perl
  '.pl': 'perl',
  '.pm': 'perl',
  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  // PowerShell
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  // SQL
  '.sql': 'sql',
  // HTML/CSS
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  // JSON/YAML/XML
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  // Markdown
  '.md': 'markdown',
  // Groovy
  '.groovy': 'groovy',
  '.gradle': 'groovy',
};

/**
 * URI scheme 到语言的映射
 */
const schemeToLanguage: Record<string, string> = {
  'jdt': 'java',
  'csharp': 'csharp',
};

/**
 * 检测符号的语言
 */
export async function detectLanguage(uri: vscode.Uri): Promise<string> {
  // 1. 通过文件扩展名检测
  const fsPath = uri.fsPath || uri.path;
  const ext = fsPath.substring(fsPath.lastIndexOf('.')).toLowerCase();
  if (extensionToLanguage[ext]) {
    return extensionToLanguage[ext];
  }

  // 2. 通过 URI scheme 检测
  if (schemeToLanguage[uri.scheme]) {
    return schemeToLanguage[uri.scheme];
  }

  // 3. 尝试通过文档内容检测
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const languageId = doc.languageId;
    if (languageId && languageId !== 'plaintext') {
      return languageId;
    }
  } catch {
    // 无法打开文档，忽略
  }

  return 'unknown';
}
