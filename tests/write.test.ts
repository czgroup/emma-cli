import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { EmmaApi } from '../src/api.js';
import { runTransactionWrite } from '../src/commands/write.js';
import type { Transaction } from '../src/types.js';

function transaction(): Transaction {
  return {
    id: 7, userId: 1, accountId: 2, provider: 'test', bookingDate: '2026-08-31',
    amount: -10, currency: 'GBP', category: { id: 'general', displayName: 'General', color: '', emoji: '', parentCategoryId: null, hideFromStats: false, canSetBudget: true },
    type: 'PURCHASE', description: null, counterpartName: 'Fixture', realCounterpartName: null,
    merchant: null, notes: '', customName: '', labels: [], isPending: false, isRecurring: false, accountType: 'CURRENT',
  };
}

test('transaction write applies one field, reads back, and audits', async () => {
  const item = transaction();
  const requests: unknown[] = [];
  const api = {
    getSpaceId: async () => '42',
    get: async () => structuredClone(item),
    request: async (_method: string, _path: string, options: any) => {
      requests.push(options.body);
      item.notes = options.body.notes;
      return {};
    },
  } as unknown as EmmaApi;
  const directory = mkdtempSync(join(tmpdir(), 'emma-write-test-'));
  const auditLog = join(directory, 'audit.jsonl');
  try {
    await runTransactionWrite(api, {
      id: 7, field: 'notes', value: 'API test', expected: '', apply: true,
      reason: 'unit test mutation', auditLog,
    });
    assert.equal(item.notes, 'API test');
    assert.deepEqual(requests, [{ notes: 'API test' }]);
    assert.equal(JSON.parse(readFileSync(auditLog, 'utf8')).verified, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('transaction write stops on a stale precondition without audit or mutation', async () => {
  let wrote = false;
  const api = {
    get: async () => transaction(),
    request: async () => { wrote = true; },
  } as unknown as EmmaApi;
  const auditLog = join(tmpdir(), `emma-write-absent-${process.pid}.jsonl`);
  await assert.rejects(
    runTransactionWrite(api, {
      id: 7, field: 'categoryId', value: 'groceries', expected: 'wrong', apply: true,
      reason: 'unit test mutation', auditLog,
    }),
    /Precondition failed/,
  );
  assert.equal(wrote, false);
  assert.equal(existsSync(auditLog), false);
});

test('transaction write rejects unsupported custom-name clearing', async () => {
  const api = { get: async () => transaction() } as unknown as EmmaApi;
  await assert.rejects(
    runTransactionWrite(api, {
      id: 7, field: 'customName', value: '', expected: '', apply: false,
      auditLog: join(tmpdir(), 'unused-emma-audit.jsonl'),
    }),
    /true clear semantics are not supported/,
  );
});
