/**
 * Socket Client for MCP Relay
 * 
 * Connects to VSCode extension's socket server using Named Pipe (Windows) or Unix Domain Socket.
 */

import * as net from 'node:net';
import { getSocketPath } from './router-table.js';

const CONNECTION_TIMEOUT = 5000; // 5 seconds
const REQUEST_TIMEOUT = 30000; // 30 seconds

export interface SocketRequestOptions {
  headers?: Record<string, string>;
}

/**
 * Sends a JSON-RPC request to the extension's socket server.
 * @param pid The PID of the extension process
 * @param body The JSON-RPC request body
 * @param options Optional headers and other options
 * @returns The parsed JSON response
 */
export async function sendSocketRequest(
  pid: number,
  body: unknown,
  options?: SocketRequestOptions
): Promise<unknown> {
  const socketPath = getSocketPath(pid);
  
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let buffer = '';
    let resolved = false;

    // Connection timeout
    const connectionTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        reject(new Error(`Connection timeout to socket: ${socketPath}`));
      }
    }, CONNECTION_TIMEOUT);

    // Request timeout
    const requestTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        reject(new Error(`Request timeout to socket: ${socketPath}`));
      }
    }, REQUEST_TIMEOUT);

    client.on('connect', () => {
      clearTimeout(connectionTimer);
      
      // Prepare the message with optional headers
      const message = options?.headers 
        ? { ...body as object, headers: options.headers }
        : body;
      
      // Send the request
      client.write(JSON.stringify(message) + '\n');
    });

    client.on('data', (data) => {
      buffer += data.toString('utf8');
      
      // Try to parse complete JSON messages (separated by newlines)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        
        try {
          const response = JSON.parse(line);
          if (!resolved) {
            resolved = true;
            clearTimeout(requestTimer);
            client.end();
            resolve(response);
          }
        } catch (err) {
          // Continue waiting for more data
        }
      }
    });

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(connectionTimer);
        clearTimeout(requestTimer);
        reject(new Error(`Socket error: ${err.message}`));
      }
    });

    client.on('close', () => {
      clearTimeout(connectionTimer);
      clearTimeout(requestTimer);
      
      // Try to parse any remaining data in buffer
      if (buffer.trim() && !resolved) {
        try {
          const response = JSON.parse(buffer);
          resolved = true;
          resolve(response);
        } catch {
          if (!resolved) {
            resolved = true;
            reject(new Error('Connection closed before receiving complete response'));
          }
        }
      } else if (!resolved) {
        resolved = true;
        reject(new Error('Connection closed without response'));
      }
    });
  });
}

/**
 * Checks if a socket is available (can connect to it).
 * @param pid The PID to check
 * @returns True if the socket is available
 */
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
