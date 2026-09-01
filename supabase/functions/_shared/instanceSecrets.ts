/**
 * Instance credential resolution.
 *
 * Order of precedence:
 *   1. Supabase Vault (what a clone's owner types into /setup)
 *   2. The project environment variable (what THIS instance already runs on)
 *
 * The fallback is deliberate: an instance that has never used /setup keeps
 * working on its existing project secrets, unchanged.
 *
 * Nothing here ever logs, returns or embeds a credential value in an error.
 */

export type InstanceSecretKey = 'FUB_API_KEY' | 'SLACK_BOT_TOKEN' | 'SLACK_SIGNING_SECRET';

const ENV_FALLBACKS: Record<InstanceSecretKey, string[]> = {
  FUB_API_KEY: ['FUB_API_KEY', 'FOLLOW_UP_BOSS_API_KEY'],
  SLACK_BOT_TOKEN: ['SLACK_BOT_TOKEN'],
  SLACK_SIGNING_SECRET: ['SLACK_SIGNING_SECRET'],
};

export type SecretSource = 'vault' | 'env' | 'none';

interface Resolved {
  value: string | null;
  source: SecretSource;
}

const CACHE_MS = 30_000;
const cache = new Map<InstanceSecretKey, { at: number; resolved: Resolved }>();

function fromEnv(key: InstanceSecretKey): string | null {
  for (const name of ENV_FALLBACKS[key]) {
    const v = Deno.env.get(name)?.trim();
    if (v) return v;
  }
  return null;
}

async function fromVault(key: InstanceSecretKey): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_instance_secret`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ _key: key }),
    });
    if (!res.ok) return null;
    const raw = await res.text();
    if (!raw || raw === 'null') return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    // Never surface the underlying error object — it could carry the payload.
    return null;
  }
}

export async function resolveInstanceSecret(key: InstanceSecretKey): Promise<Resolved> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.resolved;

  const vaultValue = await fromVault(key);
  const resolved: Resolved = vaultValue
    ? { value: vaultValue, source: 'vault' }
    : (() => {
        const envValue = fromEnv(key);
        return envValue
          ? { value: envValue, source: 'env' as const }
          : { value: null, source: 'none' as const };
      })();

  cache.set(key, { at: Date.now(), resolved });
  return resolved;
}

/** The credential, or null. Callers decide how to fail. */
export async function getInstanceSecret(key: InstanceSecretKey): Promise<string | null> {
  return (await resolveInstanceSecret(key)).value;
}

/** Where a credential comes from, without touching the value. */
export async function getInstanceSecretSource(key: InstanceSecretKey): Promise<SecretSource> {
  return (await resolveInstanceSecret(key)).source;
}

export function clearInstanceSecretCache(key?: InstanceSecretKey) {
  if (key) cache.delete(key);
  else cache.clear();
}

/**
 * Strip a credential out of any string that is about to be logged or returned.
 * Defence in depth for third-party errors that echo request headers back.
 */
export function redact(text: string, ...secrets: (string | null | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 6) continue;
    out = out.split(s).join('[redacted]');
    try {
      out = out.split(btoa(`${s}:`)).join('[redacted]');
    } catch {
      // btoa can throw on non-latin1; nothing to redact in that case.
    }
  }
  return out;
}
