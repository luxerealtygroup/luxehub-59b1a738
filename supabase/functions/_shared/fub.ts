/**
 * Follow Up Boss credentials for THIS instance.
 *
 * Resolution order: Supabase Vault (set by the owner on /setup), then the
 * project environment variable (FUB_API_KEY, with FOLLOW_UP_BOSS_API_KEY kept
 * as a legacy alias). There is no cross-instance fallback: if neither exists
 * the caller gets a loud error rather than someone else's CRM.
 *
 * The key value is never logged and never appears in a thrown message.
 */
import { getInstanceSecret } from './instanceSecrets.ts';

export const FUB_BASE_URL = 'https://api.followupboss.com/v1';

export class FubConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FubConfigError';
  }
}

/** Returns the configured key, or throws FubConfigError. Never returns a default. */
export async function getFubApiKey(): Promise<string> {
  const key = await getInstanceSecret('FUB_API_KEY');
  if (!key) {
    throw new FubConfigError(
      'Follow Up Boss is not connected for this instance. The owner can add the API key on the Setup page.',
    );
  }
  return key;
}

/** Basic auth header for the FUB API. Throws if the key is missing. */
export async function fubAuthHeader(): Promise<string> {
  return 'Basic ' + btoa(`${await getFubApiKey()}:`);
}

/** Standard headers for every FUB request. */
export async function fubHeaders(systemName = 'Real Estate Hub'): Promise<Record<string, string>> {
  return {
    Authorization: await fubAuthHeader(),
    'Content-Type': 'application/json',
    'X-System': systemName,
    'X-System-Key': 'lovable-hub',
  };
}
