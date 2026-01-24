/**
 * Router Table Management for Extension
 * 
 * Maintains a mapping between workspace paths and their assigned PIDs for socket communication.
 * The router table is stored in the user's home directory.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const ROUTER_TABLE_FILE = path.join(os.homedir(), '.vscode-mcp-router-v2.json');

export interface RouterEntry {
  workspaces: string[];  // Array of workspace paths (supports multi-root workspaces)
  pid: number;           // Required, used for socket routing
  lastUpdated: number;
}

export interface RouterTable {
  entries: RouterEntry[];
}

/**
 * Gets the socket path for a given PID.
 * Uses Named Pipe on Windows, Unix Domain Socket on other platforms.
 */
export function getSocketPath(pid: number): string {
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\vscode-mcp-${pid}`;
  } else {
    const socketDir = path.join(os.homedir(), '.vscode-mcp-sockets');
    return path.join(socketDir, `${pid}.sock`);
  }
}

/**
 * Ensures the socket directory exists (Unix only).
 */
export async function ensureSocketDir(): Promise<void> {
  if (process.platform !== 'win32') {
    const socketDir = path.join(os.homedir(), '.vscode-mcp-sockets');
    try {
      await fs.mkdir(socketDir, { recursive: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw err;
      }
    }
  }
}

/**
 * Normalizes a workspace path for consistent comparison across platforms.
 */
export function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Normalizes an array of workspace paths.
 */
export function normalizeWorkspacePaths(workspacePaths: string[]): string[] {
  return workspacePaths.map(normalizeWorkspacePath).sort();
}

/**
 * Loads the router table from disk.
 */
export async function loadRouterTable(): Promise<RouterTable> {
  try {
    const data = await fs.readFile(ROUTER_TABLE_FILE, 'utf8');
    return JSON.parse(data) as RouterTable;
  } catch {
    return { entries: [] };
  }
}

/**
 * Saves the router table to disk.
 */
export async function saveRouterTable(table: RouterTable): Promise<void> {
  await fs.writeFile(ROUTER_TABLE_FILE, JSON.stringify(table, null, 2), 'utf8');
}

/**
 * Finds a workspace entry in the router table by exact workspaces match.
 */
export async function findWorkspaceEntry(workspacePaths: string[]): Promise<RouterEntry | undefined> {
  const table = await loadRouterTable();
  const normalizedInput = normalizeWorkspacePaths(workspacePaths);
  
  return table.entries.find(e => {
    const normalizedEntry = normalizeWorkspacePaths(e.workspaces);
    return normalizedInput.length === normalizedEntry.length &&
      normalizedInput.every((p, i) => p === normalizedEntry[i]);
  });
}

/**
 * Finds a workspace entry by PID.
 */
export async function findEntryByPid(pid: number): Promise<RouterEntry | undefined> {
  const table = await loadRouterTable();
  return table.entries.find(e => e.pid === pid);
}

/**
 * Registers workspaces with a specific PID in the router table.
 */
export async function registerWorkspaces(workspacePaths: string[], pid: number): Promise<void> {
  const table = await loadRouterTable();
  
  // Remove existing entry for this PID if exists
  table.entries = table.entries.filter(e => e.pid !== pid);

  // Add new entry
  table.entries.push({
    workspaces: workspacePaths,
    pid,
    lastUpdated: Date.now(),
  });

  await saveRouterTable(table);
}

/**
 * Unregisters workspaces from the router table by PID.
 */
export async function unregisterByPid(pid: number): Promise<void> {
  const table = await loadRouterTable();
  table.entries = table.entries.filter(e => e.pid !== pid);
  await saveRouterTable(table);
}

/**
 * Lists all registered workspaces.
 */
export async function listWorkspaces(): Promise<RouterEntry[]> {
  const table = await loadRouterTable();
  return table.entries;
}

/**
 * Cleans up stale socket files (Unix only).
 */
export async function cleanupStaleSocketFile(pid: number): Promise<void> {
  if (process.platform !== 'win32') {
    const socketPath = getSocketPath(pid);
    try {
      await fs.unlink(socketPath);
    } catch {
      // Ignore errors if file doesn't exist
    }
  }
}
