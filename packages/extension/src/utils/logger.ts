import * as vscode from 'vscode';

let _outputChannel: vscode.OutputChannel | undefined;

/**
 * 初始化日志模块
 */
export function initLogger(outputChannel: vscode.OutputChannel): void {
    _outputChannel = outputChannel;
}

/**
 * 输出日志到 Output Channel
 */
export function log(message: string): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    
    if (_outputChannel) {
        _outputChannel.appendLine(formattedMessage);
    } else {
        // fallback to console if outputChannel not initialized
        console.log(`[MCP Java] ${formattedMessage}`);
    }
}

/**
 * 输出调试日志
 */
export function debug(message: string): void {
    log(`[DEBUG] ${message}`);
}

/**
 * 输出错误日志
 */
export function error(message: string): void {
    log(`[ERROR] ${message}`);
}

