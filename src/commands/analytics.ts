import type { EmmaApi } from '../api.js';
import { money, table } from '../output.js';

/**
 * Date helpers for analytics requests.
 *
 * `step=month` totals use `dateFrom`/`dateTo` as YYYY-MM-DD. Emma treats the
 * period as a rolling 12-month window for the totals call (observed: a full
 * year back to today). Categories/merchants use the calendar month range.
 */

/** First day of the current month, as YYYY-MM-DD. */
function monthStart(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Last day of the current month, as YYYY-MM-DD. */
function monthEnd(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`;
}

/** One year ago today, as YYYY-MM-DD (used by the totals endpoint). */
function yearAgo(now = new Date()): string {
  return `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Today, as YYYY-MM-DD. */
function today(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * ISO timestamp for the first instant of the current month in UK time.
 * Observed request uses 23:00:00Z on the previous calendar day (UTC+1 summer).
 */
function monthStartIso(now = new Date()): string {
  const first = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const ukOffsetMs = 1 * 60 * 60 * 1000;
  return new Date(first.getTime() - ukOffsetMs).toISOString();
}

/**
 * ISO timestamp for the last instant of the current month in UK time.
 * Observed request uses 22:59:59.999Z on the final calendar day (UTC+1 summer).
 */
function monthEndIso(now = new Date()): string {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const last = new Date(Date.UTC(now.getFullYear(), now.getMonth(), lastDay, 22, 59, 59, 999));
  return last.toISOString();
}

interface TotalsResponse {
  totals: Array<{
    from: string;
    to: string;
    value: number;
    spending: number;
    income: number;
    currency: string;
    totalBudget: number;
    totalLimit: number;
    spendBreakdown: Array<{ date: string; cumulative: number; daily: number }>;
  }>;
}

/** A row inside a categories or merchants breakdown response. */
interface BreakdownRow {
  displayName: string;
  total: number;
  currency: string;
  transactionsCount?: number;
}

interface CategoriesResponse {
  categories: BreakdownRow[];
  total: number;
  currency: string;
}

interface MerchantsResponse {
  merchants: BreakdownRow[];
  total: number;
  currency: string;
}

/** The `spendBreakdown` array maps to each day; find today's entry. */
function spentToday(breakdown: TotalsResponse['totals'][0]['spendBreakdown']): number {
  const todayStr = today();
  const entry = breakdown.find((d) => d.date === todayStr);
  return entry ? entry.daily : 0;
}

/**
 * Print the monthly summary: income, spending, budget, committed + daily
 * allowance for the current period.
 */
export async function runAnalyticsSummary(api: EmmaApi): Promise<void> {
  const totals = await api.get<TotalsResponse>('/analytics/totals/', {
    withSpendingBreakdown: 'true',
    step: 'month',
    dateFrom: yearAgo(),
    dateTo: today(),
  });

  const current = totals.totals[totals.totals.length - 1];
  if (!current) {
    process.stdout.write('No analytics data.\n');
    return;
  }

  const committed = await api.get<{ committed: number }>('/analytics/committed/', {
    from: monthStartIso(),
    until: monthEndIso(),
    includeInternal: 'true',
  });

  const remaining = current.totalLimit - current.spending;
  const spentTodayVal = spentToday(current.spendBreakdown);
  const daysInMonth = new Date(current.to).getDate();
  const todayNum = new Date().getDate();
  const daysLeft = daysInMonth - todayNum + 1;
  const dailyAllowance = daysLeft > 0 ? remaining / daysLeft : 0;

  table([
    ['Income', money(current.income, current.currency)],
    ['Spending', money(current.spending, current.currency)],
    ['Budget', money(current.totalBudget, current.currency)],
    ['Remaining', money(remaining, current.currency)],
    ['Committed', money(committed.committed, current.currency)],
    ['Spent today', money(spentTodayVal, current.currency)],
    ['Daily allowance', `${money(dailyAllowance, current.currency)} (${daysLeft} days left)`],
  ]);
}

/**
 * Print spending broken down by a dimension for the current month.
 * The percentage shown is each row's share of the period total.
 *
 * @param api API client.
 * @param dimension Either "categories" or "merchants".
 */
export async function runAnalyticsBreakdown(api: EmmaApi, dimension: 'categories' | 'merchants'): Promise<void> {
  const path = dimension === 'categories' ? '/analytics/categories/' : '/analytics/merchants/';
  const data = dimension === 'categories'
    ? await api.get<CategoriesResponse>(path, { dateFrom: monthStart(), dateTo: monthEnd() })
    : await api.get<MerchantsResponse>(path, { dateFrom: monthStart(), dateTo: monthEnd() });

  const rows = dimension === 'categories'
    ? (data as CategoriesResponse).categories
    : (data as MerchantsResponse).merchants;
  const periodTotal = dimension === 'categories'
    ? (data as CategoriesResponse).total
    : (data as MerchantsResponse).total;

  if (rows.length === 0) {
    process.stdout.write(`No ${dimension} data for ${monthStart()}.\n`);
    return;
  }

  const list = rows.map((r) => {
    const pct = periodTotal !== 0 ? Math.round((Math.abs(r.total) / Math.abs(periodTotal)) * 100) : 0;
    const count = r.transactionsCount ? ` (${r.transactionsCount})` : '';
    return [r.displayName + count, `${money(r.total, r.currency)} (${pct}%)`];
  });
  table(list);
}
