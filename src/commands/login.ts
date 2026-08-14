import QRCode from 'qrcode';
import type { Credentials } from '../types.js';
import { saveCredentials } from '../config.js';

const API_URL = 'https://api.emma-app.com';

/** Response from creating a QR sign-in session. */
interface SignInSession {
  clientId: string;
  nextStep: string;
  alternativeSteps: string[];
  qrStatus: 'PENDING' | 'AUTHORIZED' | 'DENIED' | 'LOGGED_IN' | string;
}

/** Response from the token exchange after the QR is approved. */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/** Poll interval, matching the web app (2.5s). */
const POLL_INTERVAL_MS = 2500;
/** Session lifetime before expiry (matches web app: ~99 min). */
const SESSION_TIMEOUT_MS = 354 * 10 * 1000;

/**
 * Create a QR sign-in session. Requires no auth.
 */
async function createSession(): Promise<SignInSession> {
  const res = await fetch(`${API_URL}/sign-in`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      platform: 'web',
    },
    body: JSON.stringify({ requestQr: true }),
  });
  if (!res.ok) throw new Error(`Could not start sign-in (${res.status})`);
  return (await res.json()) as SignInSession;
}

/**
 * Poll the session until it is approved (or rejected/expired).
 * Returns the approved session when the QR scan is confirmed.
 */
async function waitForApproval(clientId: string): Promise<SignInSession> {
  const deadline = Date.now() + SESSION_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('Sign-in session expired. Try again.');

    const res = await fetch(`${API_URL}/sign-in?clientId=${encodeURIComponent(clientId)}`, {
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', platform: 'web' },
    });
    if (!res.ok) throw new Error(`Sign-in status check failed (${res.status})`);
    const session = (await res.json()) as SignInSession;

    if (session.qrStatus === 'AUTHORIZED') return session;
    if (session.qrStatus === 'DENIED') throw new Error('Sign-in was denied on your phone.');
    if (session.qrStatus === 'LOGGED_IN') return session;

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

/**
 * Exchange the approved session for API tokens using the multi_step grant.
 */
async function exchangeTokens(clientId: string): Promise<TokenResponse> {
  const res = await fetch(`${API_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'emma-client-id': clientId,
    },
    body: JSON.stringify({
      grant_type: 'multi_step',
      scope: 'offline_access',
      client_id: clientId,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Render the QR code for a sign-in session.
 *
 * The QR encodes the `emma://web-sign-in` deep link the mobile app scans.
 * Two output options are supported:
 *  - terminal: ASCII QR drawn inline (works in most shells).
 *  - image:    PNG written to `qrImagePath` (for GUIs, web UIs, remote hosts).
 */
async function printQr(deepLink: string, qrImagePath?: string): Promise<void> {
  process.stdout.write('\nScan this QR code with the Emma app:\n\n');

  if (qrImagePath) {
    // PNG output is the only mode when an image path is requested; the
    // terminal QR would be unreadable in non-terminal contexts anyway.
    await QRCode.toFile(qrImagePath, deepLink, { width: 400, margin: 2 });
    process.stdout.write(`QR code saved to: ${qrImagePath}\n`);
  } else {
    process.stdout.write(await QRCode.toString(deepLink, { type: 'terminal', small: true }));
  }

  process.stdout.write(`\nDeep link: ${deepLink}\n\n`);
}

/**
 * Run the QR-code login flow: create a session, print a scannable QR,
 * wait for phone approval, then save the received tokens.
 *
 * The user must scan the QR with the Emma mobile app and approve the login.
 *
 * @param configPath Where to persist the received credentials.
 * @param qrImagePath Optional PNG path. When set, the QR is written to the
 *   file instead of the terminal (for non-terminal environments).
 */
export async function runLogin(configPath: string, qrImagePath?: string): Promise<void> {
  process.stdout.write('Starting sign-in...\n');
  const session = await createSession();

  const deepLink = `emma://web-sign-in?clientId=${session.clientId}`;
  await printQr(deepLink, qrImagePath);
  process.stdout.write('Waiting for approval on your phone...\n');

  await waitForApproval(session.clientId);

  process.stdout.write('Approved! Exchanging for tokens...\n');
  const tokens = await exchangeTokens(session.clientId);

  const creds: Credentials = {
    client_id: session.clientId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  };
  saveCredentials(creds, configPath);
  process.stdout.write(`Signed in. Credentials saved to ${configPath}\n`);
}
