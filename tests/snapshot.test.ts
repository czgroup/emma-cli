import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { EmmaApi } from '../src/api.js';
import { runSnapshot } from '../src/commands/snapshot.js';

function fixtureApi(overrides: Record<string, unknown> = {}): EmmaApi {
  const values: Record<string, unknown> = {
    '/feed': { netWorth: 100 },
    '/bank-connections': { connections: [] },
    '/budgets': { budgets: [] },
    '/analytics/totals/': { totals: [] },
    '/analytics/categories/': { categories: [] },
    '/categories': { categories: [] },
    '/labels': { labels: [] },
    '/spaces': { spaces: [] },
    '/transactions': { transactions: [] },
    ...overrides,
  };
  return {
    getSpaceId: async () => '42',
    get: async (path: string) => values[path],
  } as unknown as EmmaApi;
}

test('snapshot writes an atomic private file with provenance', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'emma-snapshot-test-'));
  const output = join(directory, 'latest.json');
  try {
    await runSnapshot(fixtureApi(), { output, transactionLimit: 25 });
    const value = JSON.parse(readFileSync(output, 'utf8')) as Record<string, any>;
    assert.equal(value.schemaVersion, 1);
    assert.equal(value.source.mode, 'read-only');
    assert.equal(value.source.spaceId, '42');
    assert.equal(value.request.transactionLimit, 25);
    assert.equal(statSync(output).mode & 0o777, 0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('snapshot fails closed when a core response changes shape', async () => {
  await assert.rejects(
    runSnapshot(fixtureApi({ '/budgets': { unexpected: [] } }), { transactionLimit: 25 }),
    /Schema drift: budgets\.budgets is not an array/,
  );
});

test('snapshot rejects an excessive transaction limit before API calls', async () => {
  await assert.rejects(
    runSnapshot(fixtureApi(), { transactionLimit: 10001 }),
    /transaction-limit must be an integer from 1 to 10000/,
  );
});
