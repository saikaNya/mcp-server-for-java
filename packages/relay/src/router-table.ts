/**
 * Router Table Management (Read-Only)
 * 
 * Relay only needs to read the router table to find workspace PIDs for socket communication.
 * The extension is responsible for writing/managing the router table.
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
async function loadRouterTable(): Promise<RouterTable> {
  try {
    const data = await fs.readFile(ROUTER_TABLE_FILE, 'utf8');
    return JSON.parse(data) as RouterTable;
  } catch {
    return { entries: [] };
  }
}

/**
 * Lists all registered workspaces.
 */
export async function listWorkspaces(): Promise<RouterEntry[]> {
  const table = await loadRouterTable();
  return table.entries;
}

/**
 * Finds a matching entry based on workspacePaths and parentPid.
 * 
 * For single workspace (workspacePaths.length === 1):
 * 1. Exact match: entry.workspaces contains only this single directory
 * 2. Parent PID match: entry.pid === parentPid
 * 3. Contains match: entry.workspaces contains this directory
 * 
 * For multiple workspaces (workspacePaths.length > 1):
 * 1. Exact match: entry.workspaces exactly equals workspacePaths (sorted)
 * 2. Parent PID match: entry.pid === parentPid
 * 3. Contains match: entry.workspaces contains any of the directories
 */
export async function findMatchingEntry(
  workspacePaths: string[],
  parentPid: number
): Promise<RouterEntry | undefined> {
  const entries = await listWorkspaces();
  const normalizedInput = normalizeWorkspacePaths(workspacePaths);
  const isSingle = normalizedInput.length === 1;

  // Priority 1: Exact match
  for (const entry of entries) {
    const normalizedEntry = normalizeWorkspacePaths(entry.workspaces);

    if (isSingle) {
      // For single workspace: entry should contain only this directory
      if (normalizedEntry.length === 1 && normalizedEntry[0] === normalizedInput[0]) {
        console.error(`[Router] Priority 1 (Exact match): pid=${entry.pid}, workspaces=${JSON.stringify(entry.workspaces)}`);
        return entry;
      }
    } else {
      // For multiple workspaces: arrays should be exactly equal
      if (normalizedEntry.length === normalizedInput.length &&
        normalizedEntry.every((p, i) => p === normalizedInput[i])) {
        console.error(`[Router] Priority 1 (Exact match): pid=${entry.pid}, workspaces=${JSON.stringify(entry.workspaces)}`);
        return entry;
      }
    }
  }

  // Priority 2: Parent PID match
  for (const entry of entries) {
    if (entry.pid === parentPid) {
      console.error(`[Router] Priority 2 (Parent PID match): pid=${entry.pid}, workspaces=${JSON.stringify(entry.workspaces)}`);
      return entry;
    }
  }

  // Priority 3: Contains match
  for (const entry of entries) {
    const normalizedEntry = normalizeWorkspacePaths(entry.workspaces);

    if (isSingle) {
      // For single workspace: entry.workspaces should contain this directory
      if (normalizedEntry.includes(normalizedInput[0])) {
        console.error(`[Router] Priority 3 (Contains match): pid=${entry.pid}, workspaces=${JSON.stringify(entry.workspaces)}`);
        return entry;
      }
    } else {
      // For multiple workspaces: entry.workspaces should contain any of the directories
      if (normalizedInput.some(p => normalizedEntry.includes(p))) {
        console.error(`[Router] Priority 3 (Contains match): pid=${entry.pid}, workspaces=${JSON.stringify(entry.workspaces)}`);
        return entry;
      }
    }
  }

  return undefined;
}

/**
 * Gets the PID for matching workspaces.
 */
export async function getPidForWorkspaces(
  workspacePaths: string[],
  parentPid: number
): Promise<number | undefined> {
  const entry = await findMatchingEntry(workspacePaths, parentPid);
  return entry?.pid;
}
