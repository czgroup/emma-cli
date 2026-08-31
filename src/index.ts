#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Command } from 'commander';

// Read the version from package.json so `--version` always matches the
// installed release. createRequire resolves relative to this file, which is
// inside the published package, so it works regardless of the cwd.
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
import { EmmaApi } from './api.js';
import { loadCredentials, saveCredentials, DEFAULT_CONFIG_PATH } from './config.js';
import { runBudgets } from './commands/budget.js';
import { runAnalyticsSummary, runAnalyticsBreakdown } from './commands/analytics.js';
import { runTransactionsList, runTransactionsGet } from './commands/transactions.js';
import { runCategories } from './commands/categories.js';
import { runLogin } from './commands/login.js';
import { runSnapshot } from './commands/snapshot.js';

const program = new Command();

program
  .name('emma')
  .description('CLI for the Emma personal finance app')
  .version(pkg.version)
  .option('--config <path>', 'path to credentials file', DEFAULT_CONFIG_PATH);

/**
 * Resolve an authenticated API client from the CLI global options.
 * Exits with a helpful message when no credentials are stored.
 */
function resolveApi(globalOpts: { config: string }): EmmaApi {
  const creds = loadCredentials(globalOpts.config);
  if (!creds) {
    process.stderr.write(
      `No credentials found at ${globalOpts.config}\n` +
        `Run \`emma config set --client-id <id> --access-token <jwt> --refresh-token <jwt>\` first.\n`,
    );
    process.exit(1);
  }
  return new EmmaApi(creds, globalOpts.config);
}

/** Helper so async command handlers propagate errors to the user cleanly. */
function handler(globalOpts: { config: string }, run: (api: EmmaApi) => Promise<void>) {
  return async () => {
    try {
      const api = resolveApi(globalOpts);
      await run(api);
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  };
}

/** Interactive QR-code login using the Emma mobile app. */
program
  .command('login')
  .description('sign in by scanning a QR code with the Emma app')
  .option('--config <path>', 'path to credentials file (overrides global --config)')
  .option('--qr-image <path>', 'write the QR code to a PNG file instead of the terminal')
  .action(async (opts) => {
    try {
      await runLogin(opts.config ?? program.opts().config, opts.qrImage);
    } catch (err) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

/** Set or overwrite the stored credentials. */
program
  .command('config set')
  .description('store credentials for API access')
  .requiredOption('--client-id <id>', 'OAuth client id (matches emma-client-id header)')
  .requiredOption('--access-token <jwt>', 'short-lived access token')
  .requiredOption('--refresh-token <jwt>', 'long-lived refresh token')
  .option('--config <path>', 'path to credentials file (overrides global --config)')
  .action(async (opts) => {
    const creds = {
      client_id: opts.clientId,
      access_token: opts.accessToken,
      refresh_token: opts.refreshToken,
    };
    const configPath = opts.config ?? program.opts().config;
    saveCredentials(creds, configPath);
    process.stdout.write(`Credentials saved to ${configPath}\n`);
  });

program
  .command('budgets')
  .description('show budgets for the current period')
  .action(handler(program.opts(), (api) => runBudgets(api)));

program
  .command('analytics')
  .description('show analytics for the current month')
  .option('-b, --breakdown <categories|merchants>', 'show spending breakdown by dimension')
  .action(async (opts) => {
    await handler(program.opts(), async (api) => {
      if (opts.breakdown === 'categories' || opts.breakdown === 'merchants') {
        await runAnalyticsBreakdown(api, opts.breakdown);
      } else {
        await runAnalyticsSummary(api);
      }
    })();
  });

program
  .command('categories')
  .description('list transaction categories')
  .option('--counts', 'show transaction count per category', false)
  .action(async (opts) => {
    await handler(program.opts(), (api) => runCategories(api, opts.counts))();
  });

program
  .command('transactions')
  .description('list or inspect transactions')
  .option('-p, --page <n>', 'page number', '1')
  .option('-n, --per-page <n>', 'items per page', '50')
  .option('-s, --search <query>', 'filter by keyword')
  .argument('[id]', 'transaction id for full detail')
  .action(async (id, opts) => {
    await handler(program.opts(), (api) =>
      id
        ? runTransactionsGet(api, id)
        : runTransactionsList(api, parseInt(opts.page, 10), parseInt(opts.perPage, 10), opts.search),
    )();
  });

program
  .command('snapshot')
  .description('fetch a read-only JSON snapshot for automation')
  .option('-o, --output <path>', 'atomically write JSON to this path (mode 0600)')
  .option('--transaction-limit <n>', 'number of recent rich transactions to include', '100')
  .action(async (opts) => {
    await handler(program.opts(), (api) => runSnapshot(api, {
      output: opts.output,
      transactionLimit: Number(opts.transactionLimit),
    }))();
  });

program.parseAsync();
