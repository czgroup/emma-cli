import { randomUUID } from 'node:crypto';
import type { Credentials } from './types.js';
import { getAccessToken } from './auth.js';

export const API_URL = 'https://api.emma-app.com';

/**
 * Build the custom headers Emma expects on every API call.
 * These mirror what the web app sends. `space` scopes the data to a household.
 */
function buildHeaders(
  accessToken: string,
  clientId: string,
  spaceId?: string,
): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
    'emma-client-id': clientId,
    platform: 'web',
    accept: 'application/json',
    'client-date': new Date().toISOString(),
    requesttimestamp: String(Date.now()),
    'x-request-id': randomUUID(),
    ...(spaceId ? { space: spaceId } : {}),
  };
}

/**
 * Small typed wrapper around fetch for the Emma API.
 *
 * Resolves the active space id via `/me` when one is not supplied, and
 * transparently refreshes the access token before it expires.
 */
export class EmmaApi {
  private creds: Credentials;
  private configPath: string;

  constructor(creds: Credentials, configPath: string) {
    this.creds = creds;
    this.configPath = configPath;
  }

  /** Perform a JSON GET and return the parsed body. */
  async get<T>(path: string, params?: Record<string, string>, spaceId?: string): Promise<T> {
    const token = await getAccessToken(this.creds, this.configPath);
    const search = params ? `?${new URLSearchParams(params)}` : '';
    const res = await fetch(`${API_URL}${path}${search}`, {
      headers: buildHeaders(token, this.creds.client_id, spaceId),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  /** Resolve the current space id from the `/me` payload. */
  async getSpaceId(): Promise<string> {
    const me = await this.get<{ lastUsedSpaceId?: number; defaultSpaceId?: number }>(
      '/me?withWalkthrough=true',
    );
    const id = me.lastUsedSpaceId ?? me.defaultSpaceId;
    if (!id) throw new Error('Could not resolve a space id from /me');
    return String(id);
  }
}
