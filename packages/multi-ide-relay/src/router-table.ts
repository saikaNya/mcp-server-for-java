import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const DEFAULT_ROUTER_TABLE_FILE = path.join(os.homedir(), '.vscode-mcp-router-v2.json');

export interface RouterEntry {
  workspaces: string[];
  pid: number;
  lastUpdated: number;
}

export interface RouterTable {
  entries: RouterEntry[];
}

export function getRouterTableFile(): string {
  return process.env.MULTI_IDE_RELAY_VSCODE_ROUTER_TABLE_FILE || DEFAULT_ROUTER_TABLE_FILE;
}

export function getSocketPath(pid: number): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\vscode-mcp-${pid}`;
  }

  const socketDir = path.join(os.homedir(), '.vscode-mcp-sockets');
  return path.join(socketDir, `${pid}.sock`);
}

export function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/([a-zA-Z]:)/, '$1')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function normalizeWorkspacePaths(workspacePaths: string[]): string[] {
  return workspacePaths.map(normalizeWorkspacePath).sort();
}

async function loadRouterTable(): Promise<RouterTable> {
  try {
    const data = await fs.readFile(getRouterTableFile(), 'utf8');
    return JSON.parse(data) as RouterTable;
  } catch {
    return { entries: [] };
  }
}

export async function listWorkspaces(): Promise<RouterEntry[]> {
  const table = await loadRouterTable();
  return table.entries;
}

export async function findEntryForWorkspacePath(workspacePath: string): Promise<RouterEntry | undefined> {
  const entries = await listWorkspaces();
  const normalizedInput = normalizeWorkspacePath(workspacePath);

  for (const entry of entries) {
    const normalizedEntry = normalizeWorkspacePaths(entry.workspaces);
    if (normalizedEntry.length === 1 && normalizedEntry[0] === normalizedInput) {
      return entry;
    }
  }

  for (const entry of entries) {
    const normalizedEntry = normalizeWorkspacePaths(entry.workspaces);
    if (normalizedEntry.includes(normalizedInput)) {
      return entry;
    }
  }

  return undefined;
}
