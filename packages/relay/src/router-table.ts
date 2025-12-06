/**
 * Port Router Table Management (Read-Only)
 * 
 * Relay only needs to read the router table to find workspace ports.
 * The extension is responsible for writing/managing the router table.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const ROUTER_TABLE_FILE = path.join(os.homedir(), '.vscode-mcp-router.json');
const DEFAULT_PORT = 60100;

export interface RouterEntry {
  workspace: string;
  port: number;
  pid?: number;
  lastUpdated: number;
}

export interface RouterTable {
  entries: RouterEntry[];
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
 * Finds a workspace entry in the router table.
 */
async function findWorkspaceEntry(workspacePath: string): Promise<RouterEntry | undefined> {
  const table = await loadRouterTable();
  const normalized = normalizeWorkspacePath(workspacePath);
  return table.entries.find(e => normalizeWorkspacePath(e.workspace) === normalized);
}

/**
 * Gets the port for a workspace, returns undefined if not found.
 */
export async function getPortForWorkspace(workspacePath: string): Promise<number | undefined> {
  const entry = await findWorkspaceEntry(workspacePath);
  return entry?.port;
}

/**
 * Lists all registered workspaces.
 */
export async function listWorkspaces(): Promise<RouterEntry[]> {
  const table = await loadRouterTable();
  return table.entries;
}

/**
 * Gets the default port constant.
 */
export function getDefaultPort(): number {
  return DEFAULT_PORT;
}
