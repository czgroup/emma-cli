import type { Credentials } from './types.js';
import { isTokenExpiringSoon, saveCredentials } from './config.js';

const TOKEN_ENDPOINT = 'https://api.emma-app.com/oauth/token';

/** Shape returned by the token refresh endpoint. */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Exchange a refresh token for a fresh access token (+ rotated refresh token).
 * The refresh token is rotated on every call, so the caller must persist the
 * new pair immediately.
 *
 * @param clientId OAuth client id from stored credentials.
 * @param refreshToken The current refresh token.
 * @param scope Optional scope; defaults to `offline_access`.
 * @returns The new token pair.
 */
export async function refreshTokens(
  clientId: string,
  refreshToken: string,
  scope = 'offline_access',
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    scope,
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  return (await res.json()) as TokenResponse;
}

/**
 * Return a valid access token, refreshing it first if it is close to expiry.
 * When a refresh happens, the rotated token pair is persisted to disk.
 *
 * @param creds Current credentials (in memory).
 * @param configPath Path used to persist refreshed tokens.
 * @returns A valid access token.
 */
export async function getAccessToken(creds: Credentials, configPath: string): Promise<string> {
  if (!isTokenExpiringSoon(creds.access_token)) {
    return creds.access_token;
  }

  const next = await refreshTokens(creds.client_id, creds.refresh_token);
  const updated: Credentials = {
    client_id: creds.client_id,
    access_token: next.access_token,
    refresh_token: next.refresh_token,
  };
  saveCredentials(updated, configPath);
  // Refresh tokens rotate. Keep the live client in sync as well as disk so a
  // second request cannot retry with the now-invalid previous refresh token.
  Object.assign(creds, updated);
  return next.access_token;
}
