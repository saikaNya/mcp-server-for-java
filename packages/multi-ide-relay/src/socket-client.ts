import * as net from 'node:net';

import { getSocketPath } from './router-table.js';

const CONNECTION_TIMEOUT = 5000;
const REQUEST_TIMEOUT = 30000;

export interface SocketRequestOptions {
  headers?: Record<string, string>;
}

export async function sendSocketRequest(
  pid: number,
  body: unknown,
  options?: SocketRequestOptions,
): Promise<unknown> {
  const socketPath = getSocketPath(pid);

  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let buffer = '';
    let settled = false;

    const connectionTimer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      client.destroy();
      reject(new Error(`Connection timeout to socket: ${socketPath}`));
    }, CONNECTION_TIMEOUT);

    const requestTimer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      client.destroy();
      reject(new Error(`Request timeout to socket: ${socketPath}`));
    }, REQUEST_TIMEOUT);

    client.on('connect', () => {
      clearTimeout(connectionTimer);

      const message = options?.headers ? { ...(body as object), headers: options.headers } : body;
      client.write(`${JSON.stringify(message)}\n`);
    });

    client.on('data', (data) => {
      buffer += data.toString('utf8');

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const response = JSON.parse(line);
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(requestTimer);
          client.end();
          resolve(response);
        } catch {
          // Wait for more data when JSON is incomplete.
        }
      }
    });

    client.on('error', (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(connectionTimer);
      clearTimeout(requestTimer);
      reject(new Error(`Socket error: ${error.message}`));
    });

    client.on('close', () => {
      clearTimeout(connectionTimer);
      clearTimeout(requestTimer);

      if (!buffer.trim() || settled) {
        if (!settled) {
          settled = true;
          reject(new Error('Connection closed without response'));
        }
        return;
      }

      try {
        const response = JSON.parse(buffer);
        settled = true;
        resolve(response);
      } catch {
        settled = true;
        reject(new Error('Connection closed before receiving complete response'));
      }
    });
  });
}

export async function isSocketAvailable(pid: number): Promise<boolean> {
  const socketPath = getSocketPath(pid);

  return new Promise((resolve) => {
    const client = net.createConnection(socketPath);

    const timer = setTimeout(() => {
      client.destroy();
      resolve(false);
    }, 1000);

    client.on('connect', () => {
      clearTimeout(timer);
      client.end();
      resolve(true);
    });

    client.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}
