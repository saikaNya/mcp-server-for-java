import * as http from 'node:http';
import * as https from 'node:https';

export const DEFAULT_IDEA_BASE_URL = 'http://127.0.0.1:63342';
export const IDEA_SEARCH_CLASS_PATH = '/api/language-interface/search-class';
export const IDEA_CLASS_CONTENT_PATH = '/api/language-interface/class-content';

export interface IdeaApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}

export interface IdeaTransport {
  postJson<T>(url: URL, body: string, timeoutMs: number): Promise<IdeaApiResponse<T>>;
}

export interface IdeaClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  transport?: IdeaTransport;
}

export interface IdeaHttpClientLike {
  postJson<T>(pathname: string, body: Record<string, unknown>): Promise<IdeaApiResponse<T>>;
}

export class IdeaClientTransportError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'invalid_json',
  ) {
    super(message);
    this.name = 'IdeaClientTransportError';
  }
}

class NodeIdeaTransport implements IdeaTransport {
  async postJson<T>(url: URL, body: string, timeoutMs: number): Promise<IdeaApiResponse<T>> {
    const transport = url.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const request = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (response) => {
          let raw = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            raw += chunk;
          });
          response.on('end', () => {
            if (response.statusCode !== 200) {
              reject(
                new IdeaClientTransportError(
                  `IDEA language interface returned HTTP ${response.statusCode ?? 'unknown'}.`,
                  'http',
                ),
              );
              return;
            }

            if (!raw.trim()) {
              reject(new IdeaClientTransportError('IDEA language interface returned an empty response body.', 'invalid_json'));
              return;
            }

            try {
              resolve(JSON.parse(raw) as IdeaApiResponse<T>);
            } catch (error) {
              reject(
                new IdeaClientTransportError(
                  `Failed to parse IDEA language interface response: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                  'invalid_json',
                ),
              );
            }
          });
        },
      );

      request.setTimeout(timeoutMs, () => {
        request.destroy(new IdeaClientTransportError('Request timeout when calling IDEA language interface.', 'timeout'));
      });

      request.on('error', (error) => {
        if (error instanceof IdeaClientTransportError) {
          reject(error);
          return;
        }

        reject(
          new IdeaClientTransportError(
            `Failed to communicate with IDEA language interface: ${error.message}`,
            'network',
          ),
        );
      });

      request.write(body);
      request.end();
    });
  }
}

export class IdeaClient implements IdeaHttpClientLike {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly transport: IdeaTransport;

  constructor(options: IdeaClientOptions = {}) {
    this.baseUrl = options.baseUrl || DEFAULT_IDEA_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.transport = options.transport || new NodeIdeaTransport();
  }

  async postJson<T>(pathname: string, body: Record<string, unknown>): Promise<IdeaApiResponse<T>> {
    const url = new URL(pathname, this.baseUrl);
    return this.transport.postJson<T>(url, JSON.stringify(body), this.timeoutMs);
  }
}
