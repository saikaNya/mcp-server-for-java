import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

import { IdeaAdapter, normalizeIdeaSearchResults } from './idea-adapter.js';
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
