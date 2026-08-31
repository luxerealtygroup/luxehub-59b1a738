/**
 * Follow Up Boss credentials for THIS instance.
 *
 * Each brokerage runs its own copy of this app against its own CRM, so there is
 * exactly one key: FUB_API_KEY (FOLLOW_UP_BOSS_API_KEY is accepted as a legacy
 * alias for the original instance).
 *
 * There is deliberately no default and no fallback. If the key is absent the
 * caller gets a loud error — silently reaching for "some other key" is exactly
 * how one brokerage would end up reading another brokerage's CRM.
 */

export const FUB_BASE_URL = 'https://api.followupboss.com/v1';

export class FubConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FubConfigError';
  }
}

/** Returns the configured key, or throws FubConfigError. Never returns a default. */
export function getFubApiKey(): string {
  const key =
    Deno.env.get('FUB_API_KEY')?.trim() ||
    Deno.env.get('FOLLOW_UP_BOSS_API_KEY')?.trim() ||
    '';
  if (!key) {
    throw new FubConfigError(
      'FUB_API_KEY is not configured for this instance. Set it in project secrets; ' +
        'requests are refused rather than falling back to another key.',
    );
  }
  return key;
}

/** Basic auth header for the FUB API. Throws if the key is missing. */
export function fubAuthHeader(): string {
  return 'Basic ' + btoa(`${getFubApiKey()}:`);
}

/** Standard headers for every FUB request. */
export function fubHeaders(systemName = 'Real Estate Hub'): Record<string, string> {
  return {
    Authorization: fubAuthHeader(),
    'Content-Type': 'application/json',
    'X-System': systemName,
    'X-System-Key': 'lovable-hub',
  };
}
