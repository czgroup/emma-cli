# emma-app-cli

Command-line interface for the [Emma](https://emma-app.com/) personal
finance app. Read your Emma budgets, transactions, spending analytics, and
categories from the terminal — or hand it to an AI agent so it can pull your
financial data on demand.

- Get **Emma budgets** for the current period (per-category limits, spend,
  remaining, over-budget flags).
- Get **Emma transactions** (list, search by merchant, full detail).
- Get **Emma analytics** (income vs spending, budget remaining, daily
  allowance, spending breakdown by category or merchant).
- **Emma categories** with per-category transaction counts.
- QR-code sign in with the Emma mobile app — no manual token setup.

## Why

The Emma web app and mobile app are great for browsing, but they are not
scriptable. `emma-app-cli` is a thin, typed client for the Emma API that lets
you (or an AI agent) query budgets and transactions from the command line, in
CI, or from any automation that can run a Node.js script.

## Install

```bash
npm install -g emma-app-cli
```

Or run without installing:

```bash
npx emma-app-cli --help
```

Requires Node.js 18+.

## Quick start

1. Sign in by scanning a QR code with the Emma mobile app:

```bash
emma login
```

The QR is printed in the terminal. Scan it with the Emma app's QR scanner
(Account settings) and approve the login. Tokens are saved to
`~/.config/emma-cli/credentials.json` and refreshed automatically.

In non-terminal environments, write the QR to an image:

```bash
emma login --qr-image qr.png
```

2. Explore your finances:

```bash
emma budgets                 # budgets for the current period
emma analytics               # income/spending/budget/allowance
emma analytics -b categories # spend by category
emma analytics -b merchants  # spend by merchant
emma transactions -n 20      # recent transactions
emma transactions -s Tesco   # search transactions
emma transactions <id>       # transaction detail
emma categories --counts     # categories with transaction counts
```

## Using with an AI agent

This CLI is designed to be called by AI agents and automation. It prints
plain text to stdout, takes flags for pagination and filtering, and never
prompts interactively except during `emma login`.

Example commands an agent can run:

```bash
emma budgets                    # "What is my grocery budget this month?"
emma analytics                  # "How much have I spent this month?"
emma analytics -b categories    # "Where is my money going?"
emma transactions -n 20         # "Show my 20 most recent transactions"
emma transactions -s Tesco      # "Show me my Tesco transactions"
emma transactions <id>          # "What is this transaction?"
emma categories                 # "List my categories"
```

Pass a custom credentials file with `--config <path>` if the agent runs under
a different user account.

## Commands

| Command | Description |
|---------|-------------|
| `emma login` | Sign in via QR code scan with the Emma app |
| `emma config set` | Store credentials manually |
| `emma budgets` | Show budgets for the current period |
| `emma analytics` | Show analytics for the current month |
| `emma analytics -b <categories\|merchants>` | Show spending breakdown |
| `emma transactions` | List transactions |
| `emma transactions <id>` | Show transaction detail |
| `emma categories` | List transaction categories |

Global option: `--config <path>` to use a different credentials file.

## How it works

- Reads the Emma private API at `https://api.emma-app.com`.
- Stores credentials in `~/.config/emma-cli/credentials.json` (mode 0600).
- Refreshes the access token automatically before it expires.
- The web login is a QR-code flow: a sign-in session is created, the QR
  (encoding `emma://web-sign-in?clientId=...`) is shown, and tokens are
  exchanged once the scan is approved.

## Development

```bash
npm install
npm run dev -- --help   # run from source
npm run typecheck       # type check
npm run build           # compile to dist/
```

## License

MIT
