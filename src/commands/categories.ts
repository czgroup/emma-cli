import type { EmmaApi } from '../api.js';
import { table } from '../output.js';

interface CategoryItem {
  id: string;
  displayName: string;
  emoji: string;
  transactionsCount?: number;
  hideFromStats?: boolean;
}

interface CategoriesResponse {
  categories: CategoryItem[];
}

/**
 * List all categories used to organise transactions.
 *
 * @param api API client.
 * @param withCounts Include the number of transactions per category.
 */
export async function runCategories(api: EmmaApi, withCounts: boolean): Promise<void> {
  const params: Record<string, string> = { withTransactionsCount: String(withCounts) };
  const data = await api.get<CategoriesResponse>('/categories', params);

  if (data.categories.length === 0) {
    process.stdout.write('No categories.\n');
    return;
  }

  const rows = data.categories.map((c) => {
    const emoji = c.emoji ? `${c.emoji} ` : '';
    const count = c.transactionsCount !== undefined ? String(c.transactionsCount) : '';
    const hidden = c.hideFromStats ? ' (excluded)' : '';
    return [emoji + c.displayName, count, hidden];
  });
  table(rows);
}
