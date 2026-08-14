/** Credentials persisted to disk so the CLI can authenticate without re-login. */
export interface Credentials {
  /** OAuth client id. Also sent as the `emma-client-id` header. */
  client_id: string;
  /** Short-lived JWT (expires ~1 hour). Sent as `Authorization: Bearer`. */
  access_token: string;
  /** Long-lived JWT (~20 months). Used to mint fresh access tokens. */
  refresh_token: string;
}

/** Category object attached to transactions and budgets. */
export interface Category {
  id: string;
  displayName: string;
  color: string;
  emoji: string;
  parentCategoryId: string | null;
  hideFromStats: boolean;
  canSetBudget: boolean;
}

/** Merchant info attached to transactions and subscriptions. */
export interface Merchant {
  id: number;
  displayName: string;
  website: string;
  iconUrl: string;
}

/** A single transaction as returned by the Emma API. */
export interface Transaction {
  id: number;
  userId: number;
  accountId: number;
  provider: string;
  bookingDate: string;
  amount: number;
  currency: string;
  category: Category | null;
  type: string;
  description: string | null;
  counterpartName: string | null;
  realCounterpartName: string | null;
  merchant: Merchant | null;
  notes: string | null;
  isPending: boolean;
  isRecurring: boolean;
  accountType: string;
}

/** A budget for the current period (one overall + one per category). */
export interface Budget {
  key: string;
  displayName: string;
  emoji: string;
  type: 'overall' | 'category';
  limit: number;
  baseLimit: number;
  totalLimit: number;
  rollingAccumulatedLimit: number | null;
  shouldRollover: boolean;
  currentValue: number;
  previousAverage: number;
  previousPeriodAverage: number;
  categoryId?: string;
  currency: string;
}
