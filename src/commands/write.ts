import { appendFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { EmmaApi } from '../api.js';
import type { Budget, Transaction } from '../types.js';

type Field = 'categoryId' | 'labels' | 'customName' | 'notes';

export interface TransactionWriteOptions {
  id: number;
  field: Field;
  value: string;
  expected: string;
  apply: boolean;
  reason?: string;
  auditLog: string;
}

export interface BudgetWriteOptions {
  key: string;
  baseLimit: number;
  expectedBaseLimit: number;
  shouldRollover: boolean;
  expectedShouldRollover: boolean;
  apply: boolean;
  reason?: string;
  auditLog: string;
}

function transactionValue(transaction: Transaction, field: Field): string {
  if (field === 'categoryId') return transaction.category?.id ?? '';
  if (field === 'labels') return JSON.stringify([...(transaction.labels ?? [])].sort());
  return transaction[field] ?? '';
}

function requestedValue(field: Field, value: string): string | string[] {
  // The current web client has no true clear contract: it resets the display
  // by writing counterpartName. Empty string and null are ignored by the API.
  if (field === 'customName' && value === '') {
    throw new Error('customName cannot be empty; true clear semantics are not supported');
  }
  if (field !== 'labels') return value;
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('labels value must be a JSON array of strings');
  }
  return [...new Set(parsed)].sort();
}

function appendAudit(path: string, record: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  appendFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function requireApplyReason(apply: boolean, reason?: string): void {
  if (apply && (!reason || reason.trim().length < 8)) {
    throw new Error('--reason of at least 8 characters is required with --apply');
  }
}

/** Execute one allowlisted transaction-field mutation with pre/post checks. */
export async function runTransactionWrite(api: EmmaApi, options: TransactionWriteOptions): Promise<void> {
  requireApplyReason(options.apply, options.reason);
  const before = await api.get<Transaction>(`/transactions/${options.id}`);
  const oldValue = transactionValue(before, options.field);
  const newValue = requestedValue(options.field, options.value);
  const normalizedNew = options.field === 'labels' ? JSON.stringify(newValue) : String(newValue);
  if (oldValue !== options.expected) {
    throw new Error(`Precondition failed for ${options.field}: expected ${JSON.stringify(options.expected)}, observed ${JSON.stringify(oldValue)}`);
  }
  const plan = { operation: 'transaction-write', id: options.id, field: options.field, before: oldValue, after: normalizedNew };
  if (!options.apply) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, ...plan }, null, 2)}\n`);
    return;
  }

  const spaceId = await api.getSpaceId();
  if (options.field === 'notes') {
    await api.request('POST', `/transactions/${options.id}/edit`, { body: { notes: newValue }, spaceId });
  } else if (options.field === 'labels') {
    await api.request('PATCH', '/transactions/', { body: [{ id: options.id, labels: newValue }], spaceId });
  } else if (options.field === 'categoryId') {
    await api.request('PATCH', '/transactions/', { body: [{ id: options.id, categoryId: newValue }], spaceId });
  } else {
    await api.request('PATCH', '/transactions/', { body: [{ id: options.id, customName: newValue }], spaceId });
  }

  const after = await api.get<Transaction>(`/transactions/${options.id}`, undefined, spaceId);
  const observed = transactionValue(after, options.field);
  if (observed !== normalizedNew) throw new Error(`Read-back failed for ${options.field}: observed ${JSON.stringify(observed)}`);
  for (const protectedField of ['amount', 'currency', 'bookingDate', 'accountId'] as const) {
    if (after[protectedField] !== before[protectedField]) throw new Error(`Protected field changed: ${protectedField}`);
  }
  appendAudit(options.auditLog, { at: new Date().toISOString(), reason: options.reason, verified: true, ...plan });
  process.stdout.write(`${JSON.stringify({ ok: true, verified: true, ...plan })}\n`);
}

/** Update one existing budget key with optimistic preconditions and read-back. */
export async function runBudgetWrite(api: EmmaApi, options: BudgetWriteOptions): Promise<void> {
  requireApplyReason(options.apply, options.reason);
  const spaceId = await api.getSpaceId();
  const beforeResponse = await api.get<{ budgets: Budget[] }>('/budgets', undefined, spaceId);
  const before = beforeResponse.budgets.find((budget) => budget.key === options.key);
  if (!before) throw new Error(`Budget not found: ${options.key}`);
  if (before.baseLimit !== options.expectedBaseLimit || before.shouldRollover !== options.expectedShouldRollover) {
    throw new Error(`Budget precondition failed: observed baseLimit=${before.baseLimit}, shouldRollover=${before.shouldRollover}`);
  }
  const plan = {
    operation: 'budget-write', key: options.key,
    before: { baseLimit: before.baseLimit, shouldRollover: before.shouldRollover },
    after: { baseLimit: options.baseLimit, shouldRollover: options.shouldRollover },
  };
  if (!options.apply) {
    process.stdout.write(`${JSON.stringify({ dryRun: true, ...plan }, null, 2)}\n`);
    return;
  }
  await api.request('POST', '/budgets', {
    spaceId,
    body: {
      [options.key]: { baseLimit: options.baseLimit, shouldRollover: options.shouldRollover, resetRollingAccumulated: false },
      skipListBudgetsOnResponse: true,
    },
  });
  const afterResponse = await api.get<{ budgets: Budget[] }>('/budgets', undefined, spaceId);
  const after = afterResponse.budgets.find((budget) => budget.key === options.key);
  if (!after || after.baseLimit !== options.baseLimit || after.shouldRollover !== options.shouldRollover) {
    throw new Error('Budget read-back failed');
  }
  appendAudit(options.auditLog, { at: new Date().toISOString(), reason: options.reason, verified: true, ...plan });
  process.stdout.write(`${JSON.stringify({ ok: true, verified: true, ...plan })}\n`);
}
