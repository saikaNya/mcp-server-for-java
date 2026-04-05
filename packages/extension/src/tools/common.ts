import * as vscode from "vscode";

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
