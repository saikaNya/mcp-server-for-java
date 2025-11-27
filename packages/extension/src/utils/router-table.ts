/**
 * Port Router Table Management for Extension
 * 
 * Maintains a mapping between workspace paths and their assigned ports.
 * The router table is stored in the user's home directory.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';

const ROUTER_TABLE_FILE = path.join(os.homedir(), '.vscode-mcp-router.json');
const DEFAULT_PORT = 60100;
const MAX_PORT = 63999;

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
 * Finds a workspace entry in the router table.
 */
export async function findWorkspaceEntry(workspacePath: string): Promise<RouterEntry | undefined> {
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
 * Checks if a port is available (not in use by another process).
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Finds an available port, prioritizing DEFAULT_PORT (60100) first.
 */
export async function findAvailablePort(): Promise<number> {
  const table = await loadRouterTable();
  const usedPorts = new Set(table.entries.map(e => e.port));
  
  // First, try the default port 60100
  if (!usedPorts.has(DEFAULT_PORT) && await isPortAvailable(DEFAULT_PORT)) {
    return DEFAULT_PORT;
  }
  
  // If default port is not available, find the next available port
  for (let port = DEFAULT_PORT + 1; port <= MAX_PORT; port++) {
    if (!usedPorts.has(port) && await isPortAvailable(port)) {
      return port;
    }
  }
  
  throw new Error('No available ports in range');
}

/**
 * Registers a workspace with a specific port in the router table.
 */
export async function registerWorkspace(workspacePath: string, port: number, pid?: number): Promise<void> {
  const table = await loadRouterTable();
  const normalized = normalizeWorkspacePath(workspacePath);
  
  // Remove existing entry for this workspace if exists
  table.entries = table.entries.filter(e => normalizeWorkspacePath(e.workspace) !== normalized);
  
  // Add new entry
  table.entries.push({
    workspace: workspacePath,
    port,
    pid,
    lastUpdated: Date.now(),
  });
  
  await saveRouterTable(table);
}

/**
 * Unregisters a workspace from the router table.
 */
export async function unregisterWorkspace(workspacePath: string): Promise<void> {
  const table = await loadRouterTable();
  const normalized = normalizeWorkspacePath(workspacePath);
  
  table.entries = table.entries.filter(e => normalizeWorkspacePath(e.workspace) !== normalized);
  
  await saveRouterTable(table);
}

/**
 * Unregisters a workspace by port from the router table.
 */
export async function unregisterByPort(port: number): Promise<void> {
  const table = await loadRouterTable();
  table.entries = table.entries.filter(e => e.port !== port);
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
 * Gets the default port constant.
 */
export function getDefaultPort(): number {
  return DEFAULT_PORT;
}

