import type { EmmaApi } from '../api.js';
import type { Budget } from '../types.js';
import { money, table } from '../output.js';

interface BudgetsResponse {
  budgets: Budget[];
}

/**
 * Show budgets for the current period.
 *
 * Emma's `/budgets` endpoint ignores date params and always returns the
 * current period, so no date math is needed. The overall budget is printed
 * first, followed by per-category budgets.
 */
export async function runBudgets(api: EmmaApi): Promise<void> {
  const data = await api.get<BudgetsResponse>('/budgets');
  const overall = data.budgets.find((b) => b.type === 'overall');
  const categories = data.budgets.filter((b) => b.type === 'category');

  if (overall) {
    const remaining = overall.limit + overall.currentValue;
    process.stdout.write(`TOTAL SPENDING\n`);
    table([
      ['Limit', money(overall.limit, overall.currency)],
      ['Spent', money(overall.currentValue, overall.currency)],
      ['Remaining', money(remaining, overall.currency)],
      ['Prev avg', money(overall.previousAverage, overall.currency)],
    ]);
    process.stdout.write('\n');
  }

  if (categories.length === 0) {
    process.stdout.write('No category budgets set.\n');
    return;
  }

  const rows: Array<[string, string]> = categories.map((b) => {
    const pct = b.limit > 0 ? Math.round((Math.abs(b.currentValue) / b.limit) * 100) : 0;
    const status = Math.abs(b.currentValue) > b.limit ? 'OVER' : `${pct}%`;
    return [`${b.emoji} ${b.displayName}`, `${money(b.currentValue)} / ${money(b.limit)} (${status})`];
  });
  table(rows);
}
