import { readFileSync as nodeReadFileSync } from 'node:fs';

export const DEFAULT_IDEA_HOST = '127.0.0.1';
export const DEFAULT_IDEA_PORT = 63342;
export const DEFAULT_IDEA_BASE_URL = `http://${DEFAULT_IDEA_HOST}:${DEFAULT_IDEA_PORT}`;

const OS_RELEASE_PATH = '/proc/sys/kernel/osrelease';
const PROC_VERSION_PATH = '/proc/version';
const PROC_NET_ROUTE_PATH = '/proc/net/route';

export interface HostResolverDeps {
  readFileSync?: (path: string) => string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export interface ResolveIdeaBaseUrlOptions extends HostResolverDeps {
  cliBaseUrl?: string;
}

function tryReadFile(
  readFn: (path: string) => string,
  path: string,
): string | undefined {
  try {
    return readFn(path);
  } catch {
    return undefined;
  }
}

export function isWsl(deps: HostResolverDeps = {}): boolean {
  const platform = deps.platform ?? process.platform;
  if (platform !== 'linux') {
    return false;
  }

  const readFn = deps.readFileSync ?? ((path: string) => nodeReadFileSync(path, 'utf8'));
  const env = deps.env ?? process.env;

  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP) {
    return true;
  }

  const osRelease = tryReadFile(readFn, OS_RELEASE_PATH);
  if (osRelease && /microsoft|wsl/i.test(osRelease)) {
    return true;
  }

  const procVersion = tryReadFile(readFn, PROC_VERSION_PATH);
  if (procVersion && /microsoft|wsl/i.test(procVersion)) {
    return true;
  }

  return false;
}

function parseGatewayFromRouteLine(line: string): string | undefined {
  const columns = line.trim().split(/\s+/);
  if (columns.length < 8) {
    return undefined;
  }

  const [, destination, gateway, flagsRaw] = columns;
  if (destination !== '00000000') {
    return undefined;
  }

  const flags = Number.parseInt(flagsRaw, 16);
  if (Number.isNaN(flags)) {
    return undefined;
  }

  // RTF_UP = 0x0001, RTF_GATEWAY = 0x0002
  if ((flags & 0x0001) === 0 || (flags & 0x0002) === 0) {
    return undefined;
  }

  if (!/^[0-9a-fA-F]{8}$/.test(gateway) || gateway === '00000000') {
    return undefined;
  }

  const octets: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const byte = Number.parseInt(gateway.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      return undefined;
    }
    octets.unshift(byte);
  }

  return octets.join('.');
}

export function getWindowsHostFromGateway(deps: HostResolverDeps = {}): string | undefined {
  const readFn = deps.readFileSync ?? ((path: string) => nodeReadFileSync(path, 'utf8'));
  const contents = tryReadFile(readFn, PROC_NET_ROUTE_PATH);
  if (!contents) {
    return undefined;
  }

  const lines = contents.split('\n');
  // First line is the header; skip it.
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) {
      continue;
    }
    const gateway = parseGatewayFromRouteLine(line);
    if (gateway) {
      return gateway;
    }
  }

  return undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/\/+$/, '');
}

export function resolveIdeaBaseUrl(options: ResolveIdeaBaseUrlOptions = {}): string {
  const env = options.env ?? process.env;

  const cliBaseUrl = normalizeBaseUrl(options.cliBaseUrl);
  if (cliBaseUrl) {
    return cliBaseUrl;
  }

  const envBaseUrl = normalizeBaseUrl(env.IDEA_BASE_URL);
  if (envBaseUrl) {
    return envBaseUrl;
  }

  const envHost = env.IDEA_HOST?.trim();
  const envPort = env.IDEA_PORT?.trim();
  if (envHost || envPort) {
    const host = envHost || DEFAULT_IDEA_HOST;
    const port = envPort || String(DEFAULT_IDEA_PORT);
    return `http://${host}:${port}`;
  }

  if (isWsl(options)) {
    const gateway = getWindowsHostFromGateway(options);
    if (gateway) {
      return `http://${gateway}:${DEFAULT_IDEA_PORT}`;
    }
  }

  return DEFAULT_IDEA_BASE_URL;
}
