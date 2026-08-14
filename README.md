# emma-cli

CLI for the [Emma](https://web.emma-app.com) personal finance web app.

## Install

```bash
npm install -g emma-cli
```

Or run without installing:

```bash
npx emma-cli --help
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
```

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
