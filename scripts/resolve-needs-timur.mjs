import { appendFileSync, chmodSync } from 'node:fs';
import { EmmaApi } from '../dist/api.js';
import { loadCredentials } from '../dist/config.js';

const config = '/home/openclaw/.config/emma-private-api/credentials.json';
const audit = '/home/openclaw/clawd/data/emma/private-api/migration-audit.jsonl';
const api = new EmmaApi(loadCredentials(config), config);
const spaceId = await api.getSpaceId();

const targets = new Map([
  [11033225904, 'Medical & Dental'],       // Tallinn pharmacy (merchant identity)
  [11033225903, 'Shopping'],               // Solaris XS Mänguasjad = toy shop
  [11033225901, 'Taxi'],                   // descriptor explicitly says Takso
  [11033225900, 'Eating Out'],             // Lido Solaris restaurant
  [11033225899, 'Spa & Treatment'],        // Borealis Massage
  [11033225898, 'Spa & Treatment'],
  [11033225897, 'Spa & Treatment'],
  [10888080726, 'Charity'],                // legacy exact rule: Gifts & Charity
  [10888084040, 'Transport'],              // exact same-day Trainsplit refund pair
  [10888084039, 'Transport'],
  [10888084036, 'Transport'],
  [10888084035, 'Transport'],
  [10888081112, 'Transfer'],               // legacy exact rule: Payments to Persons
  [10888082170, 'Transfer'],
  [10888081299, 'Eating Out'],              // legacy exact rule
  [10888084883, 'Eating Out'],
  [10888081992, 'Eating Out'],
  [10888081792, 'Eating Out'],              // legacy exact rule
  [10888084912, 'Holidays'],                // legacy exact rule: Travel & Holidays
  [10888080990, 'Income'],                  // legacy exact rule confirms existing category
  [10888081001, 'RSU & Share Vest'],        // vest-day Global Money residual
  [10888082111, 'Shopping'],                // legacy exact rule
  [10888082121, 'Shopping'],
  [10888082137, 'Shopping'],
  [10888085237, 'Eating Out'],              // legacy exact rule
  [10888085239, 'Eating Out'],              // legacy exact rule
  [10888082156, 'Eating Out'],              // legacy exact rule
]);

const categories = await api.get('/categories', { withTransactionsCount: 'true' }, spaceId);
const categoryIds = new Map([...categories.categories, ...categories.customCategories]
  .map((category) => [category.displayName, category.id]));
const patch = [];
for (const [id, target] of targets) {
  const current = await api.get(`/transactions/${id}`, undefined, spaceId);
  if (!(current.labels ?? []).includes('Needs-Timur')) continue;
  const labels = (current.labels ?? []).filter((label) => label !== 'Needs-Timur');
  patch.push({ id, categoryId: categoryIds.get(target), labels });
}
for (let index = 0; index < patch.length; index += 25) {
  await api.request('PATCH', '/transactions/', { body: patch.slice(index, index + 25), spaceId });
}
const failures = [];
for (const change of patch) {
  const current = await api.get(`/transactions/${change.id}`, undefined, spaceId);
  if (current.category?.id !== change.categoryId || (current.labels ?? []).includes('Needs-Timur')) {
    failures.push({ id: change.id, categoryId: current.category?.id, labels: current.labels });
  }
}
const record = { at: new Date().toISOString(), operation: 'resolve-needs-timur-from-evidence',
  attempted: patch.length, verified: failures.length === 0, failures };
appendFileSync(audit, `${JSON.stringify(record)}\n`, { mode: 0o600 });
chmodSync(audit, 0o600);
console.log(JSON.stringify(record, null, 2));
if (failures.length) process.exit(1);
