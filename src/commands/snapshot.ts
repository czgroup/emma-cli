import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EmmaApi } from '../api.js';

type JsonObject = Record<string, unknown>;

export interface SnapshotOptions {
  output?: string;
  transactionLimit: number;
}

function londonDateParts(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

function calendarMonth(now = new Date()): { from: string; to: string } {
  const { year, month } = londonDateParts(now);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${String(month).padStart(2, '0')}-01`,
    to: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function assertObject(name: string, value: unknown): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Schema drift: ${name} is not an object`);
  }
}

function assertArray(name: string, parent: JsonObject, key: string): void {
  if (!Array.isArray(parent[key])) {
    throw new Error(`Schema drift: ${name}.${key} is not an array`);
  }
}

function writeAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
  chmodSync(path, 0o600);
}

/**
 * Fetch the private API fields absent from Emma Live Export.
 *
 * This command deliberately performs GET requests only. Emma remains the
 * canonical ledger; the result is a drift-detectable observation snapshot.
 */
export async function runSnapshot(api: EmmaApi, options: SnapshotOptions): Promise<void> {
  if (!Number.isInteger(options.transactionLimit) || options.transactionLimit < 1 || options.transactionLimit > 500) {
    throw new Error('transaction-limit must be an integer from 1 to 500');
  }

  const spaceId = await api.getSpaceId();
  const period = calendarMonth();
  const scoped = <T>(path: string, params?: Record<string, string>) => api.get<T>(path, params, spaceId);

  const [feed, connections, budgets, totals, categoryAnalytics, categories, labels, spaces, transactions] =
    await Promise.all([
      scoped<unknown>('/feed'),
      scoped<unknown>('/bank-connections'),
      scoped<unknown>('/budgets'),
      scoped<unknown>('/analytics/totals/', {
        withSpendingBreakdown: 'true',
        step: 'month',
        dateFrom: period.from,
        dateTo: period.to,
      }),
      scoped<unknown>('/analytics/categories/', { dateFrom: period.from, dateTo: period.to }),
      scoped<unknown>('/categories', { withTransactionsCount: 'true' }),
      scoped<unknown>('/labels'),
      api.get<unknown>('/spaces'),
      scoped<unknown>('/transactions', { page: '1', perPage: String(options.transactionLimit) }),
    ]);

  assertObject('budgets', budgets);
  assertArray('budgets', budgets, 'budgets');
  assertObject('analytics.totals', totals);
  assertArray('analytics.totals', totals, 'totals');
  assertObject('analytics.categories', categoryAnalytics);
  assertArray('analytics.categories', categoryAnalytics, 'categories');
  assertObject('categories', categories);
  assertArray('categories', categories, 'categories');
  assertObject('transactions', transactions);
  assertArray('transactions', transactions, 'transactions');

  const snapshot = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    source: {
      kind: 'emma-private-web-api',
      supported: false,
      mode: 'read-only',
      canonicalLedger: 'Emma',
      spaceId,
    },
    request: { period, transactionLimit: options.transactionLimit },
    data: { feed, connections, budgets, analytics: { totals, categories: categoryAnalytics }, categories, labels, spaces, transactions },
  };

  if (options.output) {
    writeAtomic(options.output, snapshot);
    process.stdout.write(`${JSON.stringify({ ok: true, output: options.output, capturedAt: snapshot.capturedAt, schemaVersion: 1 })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  }
}
