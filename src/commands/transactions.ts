import type { EmmaApi } from '../api.js';
import type { Transaction } from '../types.js';
import { money, shortDate, table } from '../output.js';

interface TransactionsResponse {
  transactions: Transaction[];
}

/**
 * List transactions, newest first, paginated.
 *
 * NOTE: Emma's API ignores the `search` query param (search is done
 * client-side in the web app), so we filter the fetched page locally.
 *
 * @param api API client.
 * @param page Page number (1-based).
 * @param perPage Items per page.
 * @param search Optional keyword filter (matches counterpart/merchant/real name).
 */
export async function runTransactionsList(
  api: EmmaApi,
  page: number,
  perPage: number,
  search?: string,
): Promise<void> {
  const params: Record<string, string> = { page: String(page), perPage: String(perPage) };

  const data = await api.get<TransactionsResponse>('/transactions', params);
  let transactions = data.transactions;

  if (search) {
    const needle = search.toLowerCase();
    transactions = transactions.filter((t) => {
      const haystack = [t.counterpartName, t.realCounterpartName, t.merchant?.displayName]
        .filter((v): v is string => !!v)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (transactions.length === 0) {
    process.stdout.write('No transactions.\n');
    return;
  }

  const rows = transactions.map((t) => {
    const name = t.counterpartName ?? t.realCounterpartName ?? '(unknown)';
    const cat = t.category?.displayName ? ` — ${t.category.displayName}` : '';
    return [shortDate(t.bookingDate), `${name}${cat}`, money(t.amount, t.currency)];
  });
  table(rows);
  process.stdout.write(`\nPage ${page} (${transactions.length} shown)\n`);
}

/**
 * Show full detail for a single transaction.
 *
 * @param api API client.
 * @param id Numeric transaction id.
 */
export async function runTransactionsGet(api: EmmaApi, id: string): Promise<void> {
  const t = await api.get<Transaction>(`/transactions/${id}`);
  const name = t.counterpartName ?? t.realCounterpartName ?? '(unknown)';
  table([
    ['ID', String(t.id)],
    ['Date', t.bookingDate],
    ['Name', name],
    ['Amount', money(t.amount, t.currency)],
    ['Category', t.category?.displayName ?? '—'],
    ['Type', t.type],
    ['Account', `${t.provider} (${t.accountType})`],
    ['Merchant', t.merchant?.displayName ?? '—'],
    ['Pending', t.isPending ? 'yes' : 'no'],
    ['Recurring', t.isRecurring ? 'yes' : 'no'],
  ]);
}
