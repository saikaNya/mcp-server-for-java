export const DEFAULT_IDEA_HOST = '127.0.0.1';
export const DEFAULT_IDEA_PORT = 63342;
export const DEFAULT_IDEA_BASE_URL = `http://${DEFAULT_IDEA_HOST}:${DEFAULT_IDEA_PORT}`;

export interface ResolveIdeaBaseUrlOptions {
  cliBaseUrl?: string;
  env?: NodeJS.ProcessEnv;
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

  return DEFAULT_IDEA_BASE_URL;
}
