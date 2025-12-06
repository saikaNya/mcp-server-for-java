import * as vscode from 'vscode';

const JAVA_EXTENSION_ID = 'redhat.java';
const MAX_WAIT_TIME_MS = 15000; // 最长等待 15 秒
const CHECK_INTERVAL_MS = 1000; // 每隔 1 秒检测一次

export interface LspCheckResult {
    ready: boolean;
    errorMessage?: string;
}

/**
 * LSP 状态枚举
 */
enum LspStatus {
    NOT_INSTALLED = 'NOT_INSTALLED',       // 扩展未安装
    NOT_ACTIVATED = 'NOT_ACTIVATED',       // 扩展未激活
    NOT_STARTED = 'NOT_STARTED',           // LSP 未启动（当前工作区可能不是 Java 项目）
    STARTING = 'STARTING',                 // LSP 正在启动中
    READY = 'READY'                        // LSP 已就绪
}

/**
 * 检查 Java Language Server 是否已安装
 */
export function isJavaExtensionInstalled(): boolean {
    const javaExtension = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
    return javaExtension !== undefined;
}

/**
 * 获取 Java Language Server 的详细状态
 */
async function getJavaLspStatus(): Promise<LspStatus> {
    try {
        const javaExtension = vscode.extensions.getExtension(JAVA_EXTENSION_ID);
        if (!javaExtension) {
            return LspStatus.NOT_INSTALLED;
        }

        // 检查扩展是否已激活（不主动激活）
        if (!javaExtension.isActive) {
            return LspStatus.NOT_ACTIVATED;
        }

        // 检查服务器模式
        const serverMode = await vscode.commands.executeCommand<string>('java.server.mode');
        
        // serverMode 为 null/undefined 表示 LSP 未启动（当前工作区可能不是 Java 项目）
        if (serverMode === null || serverMode === undefined) {
            return LspStatus.NOT_STARTED;
        }

        // serverMode 可能是 'Standard', 'LightWeight', 'Syntax', 'Hybrid' 等
        // Standard 和 Hybrid 模式下完全支持 workspace symbol
        if (serverMode === 'Standard' || serverMode === 'Hybrid') {
            return LspStatus.READY;
        }

        // 其他模式（LightWeight, Syntax 等）表示正在启动中
        return LspStatus.STARTING;
    } catch {
        return LspStatus.NOT_STARTED;
    }
}

/**
 * 根据 LSP 状态生成错误信息
 */
function getErrorMessageForStatus(status: LspStatus): string {
    switch (status) {
        case LspStatus.NOT_INSTALLED:
            return `Java Language Server extension (${JAVA_EXTENSION_ID}) is not installed. Please install the "Language Support for Java(TM) by Red Hat" extension from the VS Code marketplace.`;
        case LspStatus.NOT_ACTIVATED:
            return `Java Language Server extension is installed but failed to activate. Please try reloading the VS Code window.`;
        case LspStatus.NOT_STARTED:
            return `Java Language Server is not running in this workspace. This may happen if the current workspace is not a Java project, or the language server failed to start. Please ensure this is a valid Java project and try reloading the window.`;
        case LspStatus.STARTING:
            return `Java Language Server is not ready after waiting ${MAX_WAIT_TIME_MS / 1000} seconds. Please wait for the Java project to finish loading and try again.`;
        default:
            return `Java Language Server is not ready.`;
    }
}

/**
 * 等待 Java Language Server 就绪
 * - 如果未安装 Java 扩展，立即返回错误
 * - 如果当前工作区 LSP 未启动，立即返回错误
 * - 如果正在启动中，每隔 1 秒检测一次，最长等待 15 秒
 * - 15 秒后仍未就绪，返回超时错误
 */
export async function waitForJavaLspReady(): Promise<LspCheckResult> {
    // 获取初始状态
    let status = await getJavaLspStatus();

    // 如果未安装，立即返回错误
    if (status === LspStatus.NOT_INSTALLED) {
        return {
            ready: false,
            errorMessage: getErrorMessageForStatus(status)
        };
    }

    // 如果未激活，立即返回错误
    if (status === LspStatus.NOT_ACTIVATED) {
        return {
            ready: false,
            errorMessage: getErrorMessageForStatus(status)
        };
    }

    // 如果 LSP 未启动（当前工作区可能不是 Java 项目），立即返回错误
    if (status === LspStatus.NOT_STARTED) {
        return {
            ready: false,
            errorMessage: getErrorMessageForStatus(status)
        };
    }

    // 如果已就绪，直接返回成功
    if (status === LspStatus.READY) {
        return { ready: true };
    }

    // LSP 正在启动中，等待就绪，每隔 1 秒检测一次，最长 15 秒
    const startTime = Date.now();
    while (Date.now() - startTime < MAX_WAIT_TIME_MS) {
        await sleep(CHECK_INTERVAL_MS);
        status = await getJavaLspStatus();
        
        if (status === LspStatus.READY) {
            return { ready: true };
        }
        
        // 如果状态变为未启动，说明 LSP 可能崩溃了
        if (status === LspStatus.NOT_STARTED) {
            return {
                ready: false,
                errorMessage: getErrorMessageForStatus(status)
            };
        }
    }

    // 超时，返回启动中状态的错误信息
    return {
        ready: false,
        errorMessage: getErrorMessageForStatus(LspStatus.STARTING)
    };
}

/**
 * 辅助函数：睡眠指定毫秒数
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

