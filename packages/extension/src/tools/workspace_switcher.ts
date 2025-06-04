import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs";

export interface WorkspaceSwitchResult {
    success: boolean;
    message?: string;
    currentWorkspace?: string;
    requestedWorkspace?: string;
}

/**
 * Workspace switcher manager
 * Handles workspace checking and switching logic for existing workspaces only
 */
export class WorkspaceSwitcher {
    private static instance: WorkspaceSwitcher;
    private static globalOutputChannel?: vscode.OutputChannel;
    private outputChannel?: vscode.OutputChannel;

    private constructor(outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel || WorkspaceSwitcher.globalOutputChannel;
        this.log('WorkspaceSwitcher initialized');
    }

    public static getInstance(outputChannel?: vscode.OutputChannel): WorkspaceSwitcher {
        if (!WorkspaceSwitcher.instance) {
            WorkspaceSwitcher.instance = new WorkspaceSwitcher(outputChannel);
        } else if (outputChannel && !WorkspaceSwitcher.instance.outputChannel) {
            // Set outputChannel if instance exists but doesn't have one
            WorkspaceSwitcher.instance.outputChannel = outputChannel;
        }
        return WorkspaceSwitcher.instance;
    }

    /**
     * Set global outputChannel for all instances
     */
    public static setGlobalOutputChannel(outputChannel: vscode.OutputChannel): void {
        WorkspaceSwitcher.globalOutputChannel = outputChannel;
        // Set outputChannel if instance exists but doesn't have one
        if (WorkspaceSwitcher.instance && !WorkspaceSwitcher.instance.outputChannel) {
            WorkspaceSwitcher.instance.outputChannel = outputChannel;
        }
    }

    /**
     * Log messages to outputChannel
     */
    private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [WorkspaceSwitcher] [${level.toUpperCase()}] ${message}`;
        
        if (this.outputChannel) {
            this.outputChannel.appendLine(logMessage);
        }
        
        // Also output to console
        switch (level) {
            case 'error':
                console.error(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            default:
                console.log(logMessage);
                break;
        }
    }

    /**
     * Normalize path, handle URL encoding and path format issues
     */
    private normalizePath(inputPath: string): string {
        this.log(`Normalizing path: ${inputPath}`);
        
        try {
            let workingPath = inputPath;
            
            // 1. Handle encoded paths starting with slash, e.g. /d%3A/... -> d:/...
            if (workingPath.startsWith('/') && workingPath.includes('%3A')) {
                workingPath = workingPath.substring(1); // Remove leading slash
                this.log(`Removed leading slash: ${workingPath}`);
            }
            
            // 2. Handle URL encoding
            let decodedPath = decodeURIComponent(workingPath);
            this.log(`After URL decode: ${decodedPath}`);
            
            // 3. Handle special encoding formats, e.g. d%3A -> d:
            decodedPath = decodedPath.replace(/%3A/gi, ':');
            this.log(`After colon decode: ${decodedPath}`);
            
            // 4. Handle path separators
            decodedPath = decodedPath.replace(/\//g, path.sep);
            this.log(`After separator normalization: ${decodedPath}`);
            
            // 5. Use path.resolve to normalize path
            const resolvedPath = path.resolve(decodedPath);
            this.log(`After path.resolve: ${resolvedPath}`);
            
            // 6. Use lowercase drive letters on Windows
            const finalPath = process.platform === 'win32' 
                ? resolvedPath.replace(/^[A-Z]:/, (match) => match.toLowerCase())
                : resolvedPath;
            
            this.log(`Final normalized path: ${finalPath}`);
            return finalPath;
        } catch (error) {
            this.log(`Error normalizing path ${inputPath}: ${error}`, 'error');
            // Fallback to basic path.resolve if normalization fails
            return path.resolve(inputPath);
        }
    }

    /**
     * Check if directory exists and is a valid workspace
     */
    private async isValidWorkspace(workspacePath: string): Promise<boolean> {
        try {
            const normalizedPath = this.normalizePath(workspacePath);
            this.log(`Checking if ${normalizedPath} is a valid workspace`);
            
            // Check if directory exists
            if (!fs.existsSync(normalizedPath)) {
                this.log(`Directory does not exist: ${normalizedPath}`, 'warn');
                return false;
            }
            
            // Check if it's a directory
            const stat = fs.statSync(normalizedPath);
            if (!stat.isDirectory()) {
                this.log(`Path is not a directory: ${normalizedPath}`, 'warn');
                return false;
            }
            
            // Simple check for common project files
            const projectFiles = ['.vscode', 'package.json', 'pom.xml', 'build.gradle', '.project', '.classpath'];
            const hasProjectFile = projectFiles.some(file => {
                const filePath = path.join(normalizedPath, file);
                return fs.existsSync(filePath);
            });
            
            this.log(`Valid workspace check result for ${normalizedPath}: ${hasProjectFile}`);
            return hasProjectFile;
        } catch (error) {
            this.log(`Error checking workspace validity: ${error}`, 'error');
            return false;
        }
    }

    /**
     * Check and handle workspace requirements
     */
    async handleWorkspaceRequirement(requestedWorkspacePath?: string): Promise<WorkspaceSwitchResult> {
        this.log(`Handling workspace requirement: ${requestedWorkspacePath || 'none'}`);
        
        if (!requestedWorkspacePath || requestedWorkspacePath === '') {
            this.log('No workspace path specified, returning success');
            return { success: true }; // Return success if no workspace path specified
        }

        const currentWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.log(`Current workspace: ${currentWorkspace || 'none'}`);
        this.log(`Requested workspace: ${requestedWorkspacePath}`);
        
        if (!currentWorkspace) {
            const errorMsg = 'No current workspace available. Please open a workspace in VSCode first.';
            this.log(errorMsg, 'error');
            return {
                success: false,
                message: errorMsg,
                requestedWorkspace: requestedWorkspacePath
            };
        }

        // Use new normalization method for path comparison
        const normalizedCurrent = this.normalizePath(currentWorkspace);
        const normalizedRequested = this.normalizePath(requestedWorkspacePath);

        this.log(`Normalized current workspace: ${normalizedCurrent}`);
        this.log(`Normalized requested workspace: ${normalizedRequested}`);

        if (normalizedCurrent === normalizedRequested) {
            this.log('Workspace paths match, no switch needed');
            return {
                success: true,
                currentWorkspace: normalizedCurrent,
                requestedWorkspace: normalizedRequested
            }; // Workspaces already match
        }

        this.log('Workspace paths do not match, attempting switch');
        // Workspace mismatch, attempt switching via handover only
        return await this.attemptWorkspaceSwitch(normalizedCurrent, normalizedRequested);
    }

    /**
     * Attempt workspace switching via handover method only
     */
    private async attemptWorkspaceSwitch(currentWorkspace: string, requestedWorkspace: string): Promise<WorkspaceSwitchResult> {
        this.log(`Attempting workspace switch from ${currentWorkspace} to ${requestedWorkspace}`);
        
        try {
            // Check if target workspace is valid
            const isValidTarget = await this.isValidWorkspace(requestedWorkspace);
            if (!isValidTarget) {
                const errorMsg = `Target workspace is invalid or does not exist: ${requestedWorkspace}`;
                this.log(errorMsg, 'error');
                return {
                    success: false,
                    message: errorMsg,
                    currentWorkspace: currentWorkspace,
                    requestedWorkspace: requestedWorkspace
                };
            }

            // Try handover method only (switch between existing workspace windows)
            this.log('Attempting handover to existing workspace window');
            const handoverSuccess = await this.requestHandoverToWorkspace(requestedWorkspace);
            
            if (handoverSuccess) {
                this.log('Handover request successful, waiting for switch completion');
                
                // 从配置中获取重试设置
                const config = vscode.workspace.getConfiguration('mcpServer');
                const maxRetries = config.get<number>('workspace.verificationRetries', 5);
                const retryDelay = config.get<number>('workspace.verificationDelay', 3000);
                
                for (let i = 0; i < maxRetries; i++) {
                    this.log(`Verification attempt ${i + 1}/${maxRetries}`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    
                    const newWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const normalizedNew = newWorkspace ? this.normalizePath(newWorkspace) : '';
                    
                    this.log(`Current workspace after wait: ${normalizedNew}`);
                    this.log(`Expected workspace: ${requestedWorkspace}`);
                    
                    if (normalizedNew === requestedWorkspace) {
                        const successMsg = `Successfully switched from ${currentWorkspace} to ${requestedWorkspace}`;
                        this.log(successMsg);
                        return {
                            success: true,
                            message: successMsg,
                            currentWorkspace: normalizedNew,
                            requestedWorkspace: requestedWorkspace
                        };
                    }
                    
                    // 如果是最后一次尝试但仍未成功，记录详细信息
                    if (i === maxRetries - 1) {
                        this.log(`Workspace verification failed after ${maxRetries} attempts`, 'warn');
                        this.log(`Final check - Current: ${normalizedNew}, Expected: ${requestedWorkspace}`, 'warn');
                    }
                }
            }

            // If handover fails or verification fails, provide manual guidance
            const errorMsg = this.buildDetailedErrorMessage(currentWorkspace, requestedWorkspace);
            this.log(errorMsg, 'warn');
            return {
                success: false,
                message: errorMsg,
                currentWorkspace: currentWorkspace,
                requestedWorkspace: requestedWorkspace
            };

        } catch (error) {
            const errorMsg = `Error during workspace switch: ${error}`;
            this.log(errorMsg, 'error');
            return {
                success: false,
                message: errorMsg,
                currentWorkspace: currentWorkspace,
                requestedWorkspace: requestedWorkspace
            };
        }
    }

    /**
     * Build detailed error message
     */
    private buildDetailedErrorMessage(currentWorkspace: string, requestedWorkspace: string): string {
        return `工作区不匹配检测。自动切换失败。

当前工作区: ${currentWorkspace}
请求的工作区: ${requestedWorkspace}

请选择以下解决方案之一:

解决方案1: 手动工作区切换
1. 使用 Ctrl+Shift+P (或 Cmd+Shift+P) 打开命令面板
2. 输入 "File: Open Folder" 并选择
3. 导航到目标工作区: ${requestedWorkspace}
4. 点击 "Select Folder" 打开工作区
5. 等待工作区完全加载后重试操作

解决方案2: 使用状态栏切换
1. 在VSCode/Cursor底部状态栏找到MCP服务器状态指示器
2. 点击状态栏项目为目标工作区激活MCP服务器
3. 重试此操作

解决方案3: 关闭当前窗口并直接打开目标工作区
1. 关闭当前VSCode/Cursor窗口
2. 重新打开VSCode/Cursor
3. 选择 "Open Folder" 并选择: ${requestedWorkspace}
4. 等待工作区完全加载后重试操作

解决方案4: 使用VSCode工作区功能
1. 创建多根工作区文件 (.code-workspace)
2. 在其中包含所有需要的项目路径
3. 使用 "File > Open Workspace" 打开工作区文件

如果问题持续存在，请确认:
- 目标工作区路径存在且可访问
- 目标工作区包含有效的Java项目
- Java扩展包已安装并启用
- 您有访问目标工作区的权限

注意: 工作区切换可能需要几秒钟时间，请耐心等待。如果您看到新窗口打开，
请等待其完全加载后再检查MCP服务器状态。`;
    }

    /**
     * Request handover to specified workspace (improved method)
     */
    private async requestHandoverToWorkspace(targetWorkspacePath: string): Promise<boolean> {
        this.log(`Requesting handover to workspace: ${targetWorkspacePath}`);
        
        // 获取配置的切换策略
        const switchStrategy = vscode.workspace.getConfiguration('mcpServer').get<string>('workspace.switchStrategy', 'all');
        this.log(`Using workspace switch strategy: ${switchStrategy}`);
        
        try {
            // 根据配置选择策略
            switch (switchStrategy) {
                case 'currentWindow':
                    return await this.tryCurrentWindowStrategy(targetWorkspacePath);
                    
                case 'newWindow':
                    return await this.tryNewWindowStrategy(targetWorkspacePath);
                    
                case 'handover':
                    return await this.tryHandoverStrategy();
                    
                case 'all':
                default:
                    return await this.tryAllStrategies(targetWorkspacePath);
            }
            
        } catch (error) {
            this.log(`Failed to request handover: ${error}`, 'error');
            return false;
        }
    }

    /**
     * 尝试在当前窗口切换工作区
     */
    private async tryCurrentWindowStrategy(targetWorkspacePath: string): Promise<boolean> {
        this.log('Strategy: Attempting to open workspace in current VSCode instance');
        try {
            const workspaceUri = vscode.Uri.file(targetWorkspacePath);
            
            // 检查是否可以在当前窗口切换工作区
            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, false);
            this.log('Workspace switch command executed successfully');
            
            // 从配置中获取重试设置
            const config = vscode.workspace.getConfiguration('mcpServer');
            const maxRetries = Math.min(config.get<number>('workspace.verificationRetries', 5), 3); // 最多3次
            const retryDelay = Math.max(config.get<number>('workspace.verificationDelay', 3000), 5000); // 至少5秒
            
            for (let i = 0; i < maxRetries; i++) {
                this.log(`Current window strategy verification ${i + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // 检查是否成功切换
                const newWorkspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                const normalizedNew = newWorkspace ? this.normalizePath(newWorkspace) : '';
                const normalizedTarget = this.normalizePath(targetWorkspacePath);
                
                this.log(`Current window strategy - Current: ${normalizedNew}, Target: ${normalizedTarget}`);
                
                if (normalizedNew === normalizedTarget) {
                    this.log('Workspace switch successful via vscode.openFolder');
                    return true;
                }
            }
            
            this.log('Current window strategy failed - workspace not switched');
            return false;
        } catch (error) {
            this.log(`Current window strategy failed: ${error}`, 'warn');
            return false;
        }
    }

    /**
     * 尝试在新窗口打开工作区
     */
    private async tryNewWindowStrategy(targetWorkspacePath: string): Promise<boolean> {
        this.log('Strategy: Opening workspace in new window and requesting handover');
        try {
            const workspaceUri = vscode.Uri.file(targetWorkspacePath);
            
            // 在新窗口中打开工作区
            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, true);
            this.log('New window opened for target workspace');
            
            // 从配置中获取超时设置，默认使用较长的等待时间
            const config = vscode.workspace.getConfiguration('mcpServer');
            const switchTimeout = Math.max(config.get<number>('workspace.switchTimeout', 15000), 8000); // 至少8秒
            
            this.log(`Waiting ${switchTimeout}ms for new window to fully start`);
            await new Promise(resolve => setTimeout(resolve, switchTimeout));
            
            // 发送 handover 请求到新实例
            this.log('Executing mcpServer.toggleActiveStatus command for handover');
            await vscode.commands.executeCommand('mcpServer.toggleActiveStatus');
            this.log('Handover command executed successfully');
            
            // 等待 handover 完成
            const handoverDelay = config.get<number>('workspace.verificationDelay', 3000);
            await new Promise(resolve => setTimeout(resolve, handoverDelay));
            
            return true;
        } catch (error) {
            this.log(`New window strategy failed: ${error}`, 'warn');
            return false;
        }
    }

    /**
     * 尝试传统的 handover 策略
     */
    private async tryHandoverStrategy(): Promise<boolean> {
        this.log('Strategy: Traditional handover method');
        try {
            this.log('Executing mcpServer.toggleActiveStatus command');
            await vscode.commands.executeCommand('mcpServer.toggleActiveStatus');
            this.log('Handover command executed successfully');
            return true;
        } catch (error) {
            this.log(`Handover strategy failed: ${error}`, 'error');
            return false;
        }
    }

    /**
     * 尝试所有策略
     */
    private async tryAllStrategies(targetWorkspacePath: string): Promise<boolean> {
        this.log('Strategy: Trying all available strategies');
        
        // 策略 1: 尝试使用 VSCode 命令直接打开工作区（如果用户在同一个 VSCode 实例中）
        if (await this.tryCurrentWindowStrategy(targetWorkspacePath)) {
            return true;
        }
        
        // 策略 2: 尝试在新窗口中打开工作区，然后使用 handover 机制
        if (await this.tryNewWindowStrategy(targetWorkspacePath)) {
            return true;
        }
        
        // 策略 3: 回退到传统的 handover 方法
        if (await this.tryHandoverStrategy()) {
            return true;
        }
        
        // 所有策略都失败
        this.log('All handover strategies failed', 'error');
        return false;
    }

    /**
     * Get current workspace path
     */
    getCurrentWorkspacePath(): string | undefined {
        const currentPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.log(`Getting current workspace path: ${currentPath || 'none'}`);
        return currentPath;
    }

    /**
     * Format workspace error message
     */
    formatWorkspaceError(result: WorkspaceSwitchResult): string {
        this.log(`Formatting workspace error for result: ${JSON.stringify(result)}`);
        
        if (result.success) {
            return '';
        }

        let errorMsg = `WorkspaceError: ${result.message}`;

        if (result.requestedWorkspace) {
            errorMsg += `\n\nTo resolve this:`;
            errorMsg += `\n1. Open the target workspace (${result.requestedWorkspace}) in VSCode/Cursor`;
            errorMsg += `\n2. Click the MCP Server status bar item to activate the server for that workspace`;
            errorMsg += `\n3. Then retry this operation`;

            if (result.currentWorkspace) {
                errorMsg += `\n\nCurrent workspace: ${result.currentWorkspace}`;
                errorMsg += `\nRequested workspace: ${result.requestedWorkspace}`;
            }
        }

        this.log(`Formatted error message: ${errorMsg}`);
        return errorMsg;
    }
} 