import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
    client?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 获取当前请求的上下文
 */
export function getRequestContext(): RequestContext | undefined {
    return requestContextStorage.getStore();
}

/**
 * 获取当前请求的 client
 */
export function getClient(): string | undefined {
    return requestContextStorage.getStore()?.client;
}

