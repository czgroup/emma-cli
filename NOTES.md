# Emma Web App — CLI Exploration Notes

Date: 2026-08-14
Source: web.emma-app.com (Emma web app), observed via Chrome DevTools MCP.

## Base URL

- API base: `https://api.emma-app.com`
- All requests are CORS-restricted to origin `https://web.emma-app.com`.
- Body format: JSON (`application/json`).

## Authentication

Credentials are passed via an `Authorization` header:

```
authorization: Bearer <access_token>
```

`access_token` is a JWT (RS256). Decoded payload example:

```json
{
  "jti": "...",
  "sub": "75206",
  "exp": 1786738264,
  "scope": "offline_access",
  "iat": 1786734664
}
```

- `sub` = user ID (e.g. `75206`).
- `scope` = `offline_access`.
- Access token lifetime: 3600s (1 hour).

### Required request headers

Every API call also sends these headers. The backend may not strictly require all of them, but they are present on every observed request:

```
x-request-id: <uuid>
client-date: <ISO-8601 UTC>        e.g. 2026-08-14T19:16:23.479Z
requesttimestamp: <epoch ms>
emma-client-id: <uuid>             == client_id (see below)
space: <spaceId>                   e.g. 310698
platform: web
user-agent: <browser UA>
accept: application/json
```

### Token refresh

The web app stores tokens in `localStorage`:

| Key            | Value                                        |
|----------------|----------------------------------------------|
| `access_token` | JWT, valid ~1 hour                           |
| `refresh_token`| JWT, valid ~608 days (20 months)             |
| `client_id`    | UUID, e.g. `eb1f09c0-87ed-4139-ab43-144c98066474` |

Refresh endpoint (validated working with curl-style POST):

```
POST https://api.emma-app.com/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&client_id=<client_id>&scope=offline_access&refresh_token=<refresh_token>
```

Response:

```json
{
  "access_token": "<new JWT>",
  "refresh_token": "<new JWT>",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

Notes:
- The refresh flow also rotates the refresh token (a new one is returned each time).
- `client_id` equals the `emma-client-id` header value.
- Do not use the same refresh token twice; the old one is invalidated after rotation.

### Recommended credential storage for the CLI

Option A (recommended for now): store credentials in a local config file, e.g.
`~/.config/emma-cli/credentials.json` with mode 0600:

```json
{
  "client_id": "<uuid>",
  "access_token": "<jwt>",
  "refresh_token": "<jwt>"
}
```

The CLI should:
1. Load this file.
2. Send the access token as `Authorization: Bearer <token>`.
3. Before expiry (check JWT `exp`), call `/oauth/token` to refresh.
4. Write the new tokens back to the file.

Passing via CLI:
- Support `--token <access_token>` and `--config <path>` flags for override.
- Default to the config file path above.
- Never print the token in logs or error output.

## API Endpoints Observed

Grouped by purpose. Space-scoped endpoints use `{spaceId}` (e.g. `310698`).

### Account / user

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/me?withWalkthrough=true` | GET | Current user profile, subscription tier, spaces, quests summary. |
| `/me/remember-space` | POST | Remember the last active space. |
| `/me/space-invites?status=PENDING` | GET | Pending space invites. |
| `/me/space-removals` | GET | Removed spaces. |
| `/extra-members` | GET | Extra household members. |
| `/user-additional-info` | GET | Additional user info. |
| `/spaces` | GET | List all spaces. |
| `/spaces/{spaceId}` | GET | Space details, users, accounts. |
| `/spaces/{spaceId}/invites` | GET | Invites for a space. |
| `/referral-programs/active` | GET | Active referral programs. |
| `/referrals/credit` | GET | Referral credit balance. |
| `/quests` | GET | Quests / gamification list. |
| `/feature-flags/?flags[]=...` | GET | Feature flags (huge list, many `flags[]` params). |

### Feed / overview

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/feed` | GET | Feed overview: available balance, net worth, budgets, recent transactions, recurring payments. |
| `/bank-connections` | GET | Linked bank accounts and connection status. |

### Transactions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/transactions?&page=1&perPage=50` | GET | Paginated transactions. Params: `page`, `perPage`, `search`, date filters. |
| `/transactions/{id}` | GET | Single transaction detail. |
| `/categories?withTransactionsCount=false` | GET | Category list (colors, emojis, budget flag). |

Transaction object (key fields): `id`, `userId`, `accountId`, `provider`, `bookingDate`, `amount`, `currency`, `category`, `type` (PURCHASE/DIRECT_DEBIT/TRANSFER...), `counterpartName`, `realCounterpartName`, `merchant`, `subscription`, `labels`, `isPending`, `isRecurring`, `accountType`.

### Analytics & budgeting

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/analytics/totals/?withSpendingBreakdown=true&step=month&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&` | GET | Income/spending totals, budgets, daily spend breakdown. |
| `/analytics/categories/?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&` | GET | Spending breakdown by category. |
| `/analytics/merchants/?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&` | GET | Spending breakdown by merchant. |
| `/analytics/committed/?from=<ISO>&until=<ISO>&includeInternal=true` | GET | Recurring/committed payments in a range. Response: `{ committed, subscriptions[], recurring[] }`. |
| `/spending-groups?withNetBalance=true&withUserIds=true` | GET | Custom spending groups. |

### Budgeting (current period)

Found on page `/budgeting`.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/budgets` | GET | All budgets for the CURRENT period. See structure below. |
| `/incomes` | GET | List of regular income records (empty in observed account). |

`/budgets` response — `{ "budgets": [...] }`. Key fields per budget:

| Field | Meaning |
|-------|---------|
| `key` | Unique key, e.g. `overall.monthly`, `category.groceries`, `category.<uuid>` (custom categories). |
| `type` | `overall` (Total Spending) or `category`. |
| `displayName` | Human label, e.g. "Groceries", "Total Spending". |
| `limit` / `baseLimit` / `totalLimit` | Budget limit (amount). |
| `currentValue` | Current spend in the period (negative number). |
| `previousAverage` / `previousPeriodAverage` | Average spend in previous period. |
| `shouldRollover` | Whether unspent budget rolls over. |
| `categoryId` | Category id (present for `category` type). |
| `emoji`, `color`, `iconUrl` | Display assets. |

Budgeting page shows: total limit (e.g. £3,875.60), spending so far (currentValue), committed spending (from `/analytics/committed`), and daily allowance until month end.

IMPORTANT: `/budgets` ignores `from`/`to` query params — it always returns the CURRENT period's budgets. Good for a CLI "current period" command; no date math needed.

### Subscriptions / recurring

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/subscriptions?includeInactive=true` | GET | All tracked subscriptions (merchant info, price, period). |
| `/subscriptions/{id}` | GET | Single subscription detail. |
| `/automation-rules/` | GET | Automation rules (empty in observed account). |
| `/recurring-payment/add` | - | Add recurring payment (seen in bundle, not exercised). |
| `/recurring-payment/rename` | - | Rename recurring payment (seen in bundle, not exercised). |

### Wealth / Save / Invest

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/wealth/spaces/{spaceId}/pots` | GET | Savings pots with balances, goals, interest type. |
| `/wealth/spaces/{spaceId}/wallet` | GET | Emma wallet balance. |
| `/wealth/spaces/{spaceId}/trading` | GET | Trading accounts. |
| `/wealth/pots?withDeleted=true` | GET | Pots incl. deleted. |
| `/wealth/pots/account` | GET | Emma savings account. |
| `/wealth/pots/products?types[]=BASIC&types[]=INTEREST&types[]=INTEREST_NOTICE` | GET | Available pot products. |
| `/wealth/pots/savings-plan` | GET | Autosave plan config. |
| `/wealth/pots/savings-plan/plan-activity?page=1&perPage=30` | GET | Autosave activity history. |
| `/wealth/trading/accounts` | GET | Trading accounts list. |
| `/wealth/trading/connected-account` | GET | Connected trading account. |
| `/wealth/trading/pending-top-ups` | GET | Pending top-ups. |
| `/wealth/trading/auto-invest` | GET | Auto-invest config. |
| `/wealth/trading/aum-fees` | GET | AUM fee schedule. |
| `/wealth/trading/foreign-exchange/fees` | GET | FX fees. |

Note: the web app currently shows "Save" and "Invest" as COMING SOON. Data still exists via these endpoints.

### Credit score (TransUnion)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/credit-score/transunion/score` | GET | Score, band, next update date, bands table. |
| `/credit-score/transunion/factors` | GET | Credit health factors (red/yellow/green). |
| `/credit-score/transunion/registration` | GET | Registration status. |
| `/payments/credit-and-debt` | GET | Credit and debt totals + breakdown. |
| `/data-breaches?&page=1&perPage=20` | GET | Data breach monitoring. |
| `/data-breaches/monitored-accounts` | GET | Monitored accounts for breaches. |

### Offers / misc

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/promotions?withNativeOffers=true` | GET | Offers/promotions. |
| `/pop-ups` | GET | Pop-up content. |
| `/in-app` | GET | In-app content. |
| `/rent-reporting?withTenancyAddress=true&...` | GET | Rent reporting status. |
| `/vrp-consents` | GET | Variable recurring payment consents. |
| `/nordvpn/status` | GET | NordVPN status. |
| `/labels` | GET | Transaction labels. |

## Analytics date param pattern

- `dateFrom=YYYY-MM-DD` / `dateTo=YYYY-MM-DD` for month views.
- `from=<ISO-8601>` / `until=<ISO-8601>` for committed (range) view.
- `step=month` for totals granularity.

## QR-code login flow (web, automatable)

Discovered 2026-08-14 from the logged-out web app. All endpoints require NO auth token. The only manual step is scanning the QR with the Emma mobile app and approving.

1. Create a session:
   `POST /sign-in` with body `{"requestQr": true}`
   → `{ "clientId": "<uuid>", "qrStatus": "PENDING", "nextStep": "qr_code", "loginContext": {...} }`

2. QR encodes: `emma://web-sign-in?clientId=<clientId>`
   User scans with the Emma app's QR scanner (Account settings) and approves.

3. Poll for approval:
   `GET /sign-in?clientId=<clientId>`
   → `qrStatus`: `PENDING` → `AUTHORIZED` (or `DENIED` / `LOGGED_IN`).
   Web app polls every 2.5s; session expires ~99 minutes.

4. Exchange for tokens:
   `POST /oauth/token` with JSON body
   `{ "grant_type": "multi_step", "scope": "offline_access", "client_id": "<clientId>" }`
   and header `emma-client-id: <clientId>`
   → `{ access_token, refresh_token, expires_in, token_type }`

Notes:
- While `qrStatus` is still `PENDING`, the exchange returns 403 `invalid_grant` / "Invalid pin or otp" — expected.
- The sign-in session `clientId` becomes the account's `client_id` afterwards.
- Implemented as `emma login` in the CLI (renders QR in terminal via the `qrcode` package).
- `emma login --qr-image <path>` writes the QR to a 400x400 PNG instead of the
  terminal, for GUIs, web UIs, or remote hosts without a usable terminal.

## Gotchas

- The `space` header is required for space-scoped data (set to last used space, e.g. `310698`).
- Space ID comes from `/me` → `lastUsedSpaceId` or `defaultSpaceId`.
- Pagination is `?page=N&perPage=N`.
- Search on transactions uses `search=<query>`.
- The `client-date` and `requesttimestamp` headers are JS-computed; backend appears tolerant but include them to match app behaviour.
