import { appendFileSync, chmodSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { EmmaApi } from '../dist/api.js';
import { loadCredentials } from '../dist/config.js';

const config = '/home/openclaw/.config/emma-private-api/credentials.json';
const audit = '/home/openclaw/clawd/data/emma/private-api/migration-audit.jsonl';
const apply = process.argv.includes('--apply');
const api = new EmmaApi(loadCredentials(config), config);
const spaceId = await api.getSpaceId();

async function allTransactions() {
  const all = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await api.get('/transactions', { page: String(page), perPage: '100' }, spaceId);
    const rows = response.transactions ?? [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all;
}

const transactions = await allTransactions();
const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
const categoriesResponse = await api.get('/categories', { withTransactionsCount: 'true' }, spaceId);
const categoryId = Object.fromEntries(
  [...categoriesResponse.categories, ...categoriesResponse.customCategories].map((category) => [category.displayName, category.id]),
);
const name = (transaction) => transaction.customName || transaction.counterpartName || transaction.realCounterpartName || '';
const in2026 = (transaction) => String(transaction.bookingDate).startsWith('2026-');

const categoryChanges = new Map();
const labelChanges = new Map();
const customNameChanges = new Map();
const noteChanges = new Map();
const reasons = new Map();

function addCategory(transaction, target, reason) {
  if (!transaction) throw new Error(`Missing transaction for ${reason}`);
  categoryChanges.set(transaction.id, categoryId[target]);
  reasons.set(transaction.id, reason);
}
function addLabel(transaction, label, reason) {
  if (!transaction) throw new Error(`Missing transaction for ${reason}`);
  labelChanges.set(transaction.id, [...new Set([...(transaction.labels ?? []), label])].sort());
  reasons.set(transaction.id, reason);
}

const meta = transactions.filter((t) => in2026(t) && t.category?.id === 'income' && /^Meta$/i.test(name(t)));
if (meta.length !== 8) throw new Error(`Expected 8 Meta income rows, found ${meta.length}`);
for (const transaction of meta) addCategory(transaction, 'Salary', 'Income salary migration');

const vestIds = [10888081000, 10888080612, 10972489001];
for (const id of vestIds) addCategory(byId.get(id), 'RSU & Share Vest', 'Income vest migration');

const rachmaninoff = transactions.filter((t) => in2026(t) && /Rachmaninoff/i.test(name(t)));
if (rachmaninoff.length !== 12) throw new Error(`Expected 12 Rachmaninoff rows, found ${rachmaninoff.length}`);
for (const transaction of rachmaninoff) addCategory(transaction, 'Music School & Lessons', 'Music school migration');

const yes = byId.get(11022885166);
addCategory(yes, 'Spa & Treatment', 'Turkey spa anchor');
addLabel(yes, 'Turkey-Aug26', 'Turkey trip tag');
for (const id of [10927030710, 11016550864, 11027221332]) {
  const transaction = byId.get(id);
  addCategory(transaction, 'Accommodation', 'Turkey accommodation anchor');
  addLabel(transaction, 'Turkey-Aug26', 'Turkey trip tag');
}
const intiba = byId.get(11029865681);
addLabel(intiba, 'Turkey-Aug26', 'Turkey trip tag');
const flywire = byId.get(10976991374);
addCategory(flywire, 'University Tuition', 'Anna university tuition anchor');
addLabel(flywire, 'Anna-University', 'Anna university tag');
customNameChanges.set(flywire.id, 'University tuition via Flywire');

const exactCleaning = transactions.filter((t) => in2026(t) && t.category?.id === 'cash' && t.amount === -80);
if (exactCleaning.length !== 10) throw new Error(`Expected 10 exact £80 cash rows, found ${exactCleaning.length}`);
for (const transaction of exactCleaning) {
  addCategory(transaction, 'Household Services', 'Verified £80 cleaning cadence');
  customNameChanges.set(transaction.id, 'Weekly house cleaning');
  noteChanges.set(transaction.id, '£80 cash withdrawal treated as weekly house cleaning under the agreed cadence rule.');
}

addCategory(byId.get(10888084191), 'Shopping', 'Monsoon refund to original category');
for (const id of [10888080485, 10888080346, 11016550988]) addCategory(byId.get(id), 'Travel', 'Rubikus travel refund');
addCategory(byId.get(10888080380), 'Medical & Dental', 'NHS refund to original category');
for (const id of [10888084040, 10888084039, 10888084036, 10888084035, 10888080990]) {
  addLabel(byId.get(id), 'Needs-Timur', 'Ambiguous refund/income exception');
}

const plans = {
  categories: [...categoryChanges].map(([id, target]) => ({ id, before: byId.get(id)?.category?.id, target, reason: reasons.get(id) })),
  labels: [...labelChanges].map(([id, labels]) => ({ id, before: byId.get(id)?.labels ?? [], labels })),
  customNames: [...customNameChanges].map(([id, customName]) => ({ id, before: byId.get(id)?.customName ?? null, customName })),
  notes: [...noteChanges].map(([id, notes]) => ({ id, before: byId.get(id)?.notes ?? null, notes })),
};
console.log(JSON.stringify({ apply, counts: Object.fromEntries(Object.entries(plans).map(([key, value]) => [key, value.length])) }, null, 2));
if (!apply) process.exit(0);

const patch = [];
for (const [id, target] of categoryChanges) patch.push({ id, categoryId: target });
for (const [id, labels] of labelChanges) patch.push({ id, labels });
for (const [id, customName] of customNameChanges) patch.push({ id, customName });
for (let index = 0; index < patch.length; index += 25) {
  await api.request('PATCH', '/transactions/', { body: patch.slice(index, index + 25), spaceId });
}
for (const [id, notes] of noteChanges) {
  await api.request('POST', `/transactions/${id}/edit`, { body: { notes }, spaceId });
}

const failures = [];
for (const [id, target] of categoryChanges) {
  const current = await api.get(`/transactions/${id}`, undefined, spaceId);
  if (current.category?.id !== target) failures.push({ id, field: 'categoryId', expected: target, observed: current.category?.id });
}
for (const [id, labels] of labelChanges) {
  const current = await api.get(`/transactions/${id}`, undefined, spaceId);
  if (JSON.stringify([...(current.labels ?? [])].sort()) !== JSON.stringify(labels)) failures.push({ id, field: 'labels' });
}
for (const [id, customName] of customNameChanges) {
  const current = await api.get(`/transactions/${id}`, undefined, spaceId);
  if (current.customName !== customName) failures.push({ id, field: 'customName', expected: customName, observed: current.customName });
}
for (const [id, notes] of noteChanges) {
  const current = await api.get(`/transactions/${id}`, undefined, spaceId);
  if (current.notes !== notes) failures.push({ id, field: 'notes' });
}
const record = { at: new Date().toISOString(), operation: 'complete-handover', verified: failures.length === 0, counts: Object.fromEntries(Object.entries(plans).map(([key, value]) => [key, value.length])), failures };
mkdirSync(dirname(audit), { recursive: true, mode: 0o700 });
appendFileSync(audit, `${JSON.stringify(record)}\n`, { mode: 0o600 });
chmodSync(audit, 0o600);
console.log(JSON.stringify(record, null, 2));
if (failures.length) process.exit(1);
