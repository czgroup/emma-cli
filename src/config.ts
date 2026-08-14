import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Credentials } from './types.js';

/** Default location for stored credentials: ~/.config/emma-cli/credentials.json */
export const DEFAULT_CONFIG_PATH = join(homedir(), '.config', 'emma-cli', 'credentials.json');

/**
 * Load credentials from disk.
 *
 * @param path Optional override for the config file location.
 * @returns Parsed credentials, or null when the file is missing/unreadable.
 */
export function loadCredentials(path: string = DEFAULT_CONFIG_PATH): Credentials | null {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    if (!parsed.client_id || !parsed.access_token || !parsed.refresh_token) {
      return null;
    }
    return parsed as Credentials;
  } catch {
    return null;
  }
}

/**
 * Persist credentials to disk with restricted permissions (owner read/write only).
 * The directory is created if it does not exist.
 *
 * @param creds Credentials to write.
 * @param path Optional override for the config file location.
 */
export function saveCredentials(creds: Credentials, path: string = DEFAULT_CONFIG_PATH): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

/**
 * Read a JWT claim without verifying its signature.
 * Only used to inspect the `exp` field for proactive token refresh.
 */
function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

/**
 * Check whether a JWT is close to expiry.
 *
 * @param token JWT string.
 * @param skewSeconds Refresh this many seconds before actual expiry (default 120).
 * @returns True when the token expires within the skew window.
 */
export function isTokenExpiringSoon(token: string, skewSeconds = 120): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  const expiresAtMs = payload.exp * 1000;
  return Date.now() > expiresAtMs - skewSeconds * 1000;
}
