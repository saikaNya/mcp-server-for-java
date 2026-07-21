import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { IdeaAdapter, normalizeIdeaSearchResults } from './idea-adapter.js';
import {
  IDEA_SEARCH_CLASS_PATH,
  IdeaClient,
  type IdeaTransport,
} from './idea-client.js';
import {
  DEFAULT_IDEA_BASE_URL,
  resolveIdeaBaseUrl,
} from './idea-host.js';
import { buildFallbackErrorMessage, executeWithFallback, parseArgs } from './index.js';
import { findEntryForWorkspacePath } from './router-table.js';
import { createTextResult, type IdeAdapter, type IdeKind, type ToolInvocation } from './types.js';
import { VSCodeAdapter } from './vscode-adapter.js';

test('parseArgs uses idea by default', () => {
  assert.deepEqual(parseArgs([]), {
    client: undefined,
    ides: ['idea'],
  });
});

test('parseArgs supports comma separated and repeated ides values', () => {
  assert.deepEqual(parseArgs(['--ides', 'idea,vscode', '--client', 'cursor']), {
    client: 'cursor',
    ides: ['idea', 'vscode'],
  });

  assert.deepEqual(parseArgs(['--ides', '["vscode","idea"]']), {
    client: undefined,
    ides: ['vscode', 'idea'],
  });
});

test(
  'findEntryForWorkspacePath only matches workspaces present in router table',
  { concurrency: false },
  async (t) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'mcp-server-for-language-router-'));
    const routerFile = path.join(tempDir, 'router.json');
    const previousRouterFile = process.env.MULTI_IDE_RELAY_VSCODE_ROUTER_TABLE_FILE;

    process.env.MULTI_IDE_RELAY_VSCODE_ROUTER_TABLE_FILE = routerFile;
    t.after(async () => {
      if (previousRouterFile === undefined) {
        delete process.env.MULTI_IDE_RELAY_VSCODE_ROUTER_TABLE_FILE;
      } else {
        process.env.MULTI_IDE_RELAY_VSCODE_ROUTER_TABLE_FILE = previousRouterFile;
      }
      await rm(tempDir, { recursive: true, force: true });
    });

    await writeFile(
      routerFile,
      JSON.stringify(
        {
          entries: [
            {
              workspaces: ['D:/workspace-a', 'D:/workspace-b'],
              pid: 1001,
              lastUpdated: 1,
            },
            {
              workspaces: ['D:/workspace-c'],
              pid: 2002,
              lastUpdated: 2,
            },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    assert.equal((await findEntryForWorkspacePath('d:\\workspace-b'))?.pid, 1001);
    assert.equal((await findEntryForWorkspacePath('D:/workspace-c'))?.pid, 2002);
    assert.equal(await findEntryForWorkspacePath('D:/workspace-missing'), undefined);
  },
);

test('normalizeIdeaSearchResults converts IDEA payload to relay payload', () => {
  assert.deepEqual(
    normalizeIdeaSearchResults(
      [
        {
          fqn: 'com.example.Foo',
          paths: ['D:/foo/Foo.java', 'D:/foo/other/Foo.java'],
        },
        {
          fqn: 'com.example.Bar',
        },
      ],
      'com.example.Foo',
      'strict',
    ),
    [
      {
        fqn: 'com.example.Foo',
        uriPath: 'D:/foo/Foo.java',
      },
      {
        fqn: 'com.example.Foo',
        uriPath: 'D:/foo/other/Foo.java',
      },
    ],
  );
});

test('IdeaAdapter maps project-not-found code to fallback', async () => {
  const adapter = new IdeaAdapter({
    async postJson() {
      return {
        code: 2003,
        msg: 'Specified project not found: D:/missing',
        data: null,
      };
    },
  });

  const outcome = await adapter.call({
    toolName: 'searchJavaTypes',
    args: {
      name: 'Foo',
      workspacePath: 'D:/missing',
    },
  });

  assert.equal(outcome.status, 'fallback');
  if (outcome.status === 'fallback') {
    assert.equal(outcome.reason, 'project_not_open');
  }
});

test('IdeaAdapter maps indexing code to non-fallback error', async () => {
  const adapter = new IdeaAdapter({
    async postJson() {
      return {
        code: 3001,
        msg: 'Indexing in progress, please try again later',
        data: null,
      };
    },
  });

  const outcome = await adapter.call({
    toolName: 'getSourceCodeByFQN',
    args: {
      fullyQualifiedName: 'com.example.Foo',
      workspacePath: 'D:/workspace',
    },
  });

  assert.equal(outcome.status, 'error');
  if (outcome.status === 'error') {
    assert.equal(outcome.result.isError, true);
  }
});

test('VSCodeAdapter does not fallback when socket is unavailable after router match', async () => {
  const adapter = new VSCodeAdapter({
    async findEntryForWorkspacePathFn() {
      return {
        workspaces: ['D:/workspace'],
        pid: 123,
        lastUpdated: 1,
      };
    },
    async isSocketAvailableFn() {
      return false;
    },
  });

  const outcome = await adapter.call({
    toolName: 'searchJavaTypes',
    args: {
      name: 'Foo',
      workspacePath: 'D:/workspace',
    },
  });

  assert.equal(outcome.status, 'error');
});

test('executeWithFallback respects ide order and stops on first success', async () => {
  const calls: IdeKind[] = [];
  const adapters: Record<IdeKind, IdeAdapter> = {
    idea: {
      ide: 'idea',
      async call() {
        calls.push('idea');
        return {
          status: 'fallback',
          ide: 'idea',
          reason: 'project_not_open',
          message: 'project missing',
        };
      },
    },
    vscode: {
      ide: 'vscode',
      async call() {
        calls.push('vscode');
        return {
          status: 'success',
          ide: 'vscode',
          result: createTextResult('[]'),
        };
      },
    },
  };

  const invocation: ToolInvocation = {
    toolName: 'searchJavaTypes',
    args: {
      name: 'Foo',
      workspacePath: 'D:/workspace',
    },
  };

  const result = await executeWithFallback(invocation, ['idea', 'vscode'], adapters);
  assert.deepEqual(calls, ['idea', 'vscode']);
  assert.deepEqual(result, createTextResult('[]'));
});

test('buildFallbackErrorMessage summarizes exhausted fallbacks', () => {
  assert.equal(
    buildFallbackErrorMessage('D:/workspace', [
      {
        status: 'fallback',
        ide: 'idea',
        reason: 'idea_unreachable',
        message: 'timeout',
      },
      {
        status: 'fallback',
        ide: 'vscode',
        reason: 'project_not_open',
        message: 'missing workspace',
      },
    ]),
    'No configured IDE could handle workspacePath: D:/workspace. idea: timeout; vscode: missing workspace',
  );
});

test('parseArgs accepts --idea-base-url', () => {
  assert.deepEqual(parseArgs(['--idea-base-url', 'http://10.0.0.5:63342']), {
    client: undefined,
    ides: ['idea'],
    ideaBaseUrl: 'http://10.0.0.5:63342',
  });
});

test('parseArgs rejects --idea-base-url without value', () => {
  assert.throws(() => parseArgs(['--idea-base-url']), /requires a value/);
  assert.throws(() => parseArgs(['--idea-base-url', '--client', 'cursor']), /requires a value/);
});

test('resolveIdeaBaseUrl returns default without config', () => {
  const resolved = resolveIdeaBaseUrl({ env: {} });
  assert.equal(resolved, DEFAULT_IDEA_BASE_URL);
});

test('resolveIdeaBaseUrl prefers cliBaseUrl above all', () => {
  const resolved = resolveIdeaBaseUrl({
    cliBaseUrl: 'http://cli.example:63342/',
    env: {
      IDEA_BASE_URL: 'http://env.example:63342',
      IDEA_HOST: 'ignored',
      IDEA_PORT: '1234',
    },
  });
  assert.equal(resolved, 'http://cli.example:63342');
});

test('resolveIdeaBaseUrl prefers IDEA_BASE_URL over IDEA_HOST/PORT', () => {
  const resolved = resolveIdeaBaseUrl({
    env: {
      IDEA_BASE_URL: 'http://env.example:7777',
      IDEA_HOST: 'ignored',
      IDEA_PORT: '1234',
    },
  });
  assert.equal(resolved, 'http://env.example:7777');
});

test('resolveIdeaBaseUrl assembles URL from IDEA_HOST/IDEA_PORT', () => {
  assert.equal(
    resolveIdeaBaseUrl({
      env: { IDEA_HOST: '10.1.2.3' },
    }),
    'http://10.1.2.3:63342',
  );

  assert.equal(
    resolveIdeaBaseUrl({
      env: { IDEA_PORT: '9999' },
    }),
    'http://127.0.0.1:9999',
  );
});

test('IdeaClient rewrites Host header to localhost when posting over HTTP', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        data: { receivedHost: req.headers.host },
      }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;

  try {
    const client = new IdeaClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const response = await client.postJson<{ receivedHost: string }>(
      IDEA_SEARCH_CLASS_PATH,
      { name: 'Foo' },
    );

    assert.equal(response.code, 0);
    assert.equal(response.data?.receivedHost, `localhost:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test('IdeaClient.postJson forwards body and path to transport', async () => {
  let captured: { url: URL; body: string } | undefined;
  const transport: IdeaTransport = {
    async postJson(url, body) {
      captured = { url, body };
      return { code: 0, msg: 'ok', data: null };
    },
  };

  const client = new IdeaClient({ baseUrl: 'http://example:63342', transport });
  await client.postJson('/api/language-interface/search-class', { name: 'Foo' });

  assert.ok(captured);
  assert.equal(captured?.url.href, 'http://example:63342/api/language-interface/search-class');
  assert.equal(captured?.body, JSON.stringify({ name: 'Foo' }));
});
