/**
 * Follow Up Boss credentials, resolved PER ORGANIZATION.
 *
 * Resolution order for a signed-in caller:
 *   1. That caller's organization key (Vault, via get_org_secret)
 *   2. Only when the caller belongs to the ORIGINAL org: the instance key
 *      (Vault via /setup, then the FUB_API_KEY project environment variable)
 *   3. Otherwise: a loud error. Never another organization's CRM.
 *
 * A tenant without its own key must NEVER fall through to the instance key —
 * that would show one org's CRM inside another org's hub.
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

const NOT_CONNECTED =
  'Follow Up Boss is not connected for this team. An owner can add the API key on the Setup page.';

interface OrgContext {
  orgId: string | null;
  isOriginalOrg: boolean;
}

const orgCache = new Map<string, { at: number; ctx: OrgContext }>();
const keyCache = new Map<string, { at: number; value: string | null }>();
const CACHE_MS = 30_000;

function serviceEnv() {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return { url, serviceKey, ok: Boolean(url && serviceKey) };
}

async function restGet(path: string): Promise<unknown[] | null> {
  const { url, serviceKey, ok } = serviceEnv();
  if (!ok) return null;
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as unknown[];
  } catch {
    return null;
  }
}

/** The org a user belongs to, and whether that org is the original instance org. */
export async function getUserOrgContext(userId: string): Promise<OrgContext> {
  const hit = orgCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ctx;

  const rows = (await restGet(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=org_id,organizations(is_original_org)`,
  )) as { org_id: string | null; organizations: { is_original_org: boolean } | null }[] | null;

  const row = rows?.[0];
  const ctx: OrgContext = {
    orgId: row?.org_id ?? null,
    isOriginalOrg: Boolean(row?.organizations?.is_original_org),
  };
  orgCache.set(userId, { at: Date.now(), ctx });
  return ctx;
}

async function orgVaultKey(orgId: string): Promise<string | null> {
  const cached = keyCache.get(orgId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const { url, serviceKey, ok } = serviceEnv();
  if (!ok) return null;
  let value: string | null = null;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/get_org_secret`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ _org_id: orgId, _key: 'FUB_API_KEY' }),
    });
    if (res.ok) {
      const raw = (await res.text()).trim();
      if (raw && raw !== 'null') {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'string' && parsed.trim()) value = parsed.trim();
      }
    }
  } catch {
    value = null;
  }
  keyCache.set(orgId, { at: Date.now(), value });
  return value;
}

/** Key for a specific organization. Falls back to the instance key only for the original org. */
export async function getFubApiKeyForOrg(orgId: string | null): Promise<string | null> {
  if (!orgId) return null;
  const orgKey = await orgVaultKey(orgId);
  if (orgKey) return orgKey;

  const rows = (await restGet(
    `organizations?id=eq.${encodeURIComponent(orgId)}&select=is_original_org`,
  )) as { is_original_org: boolean }[] | null;
  if (rows?.[0]?.is_original_org) return await getInstanceSecret('FUB_API_KEY');
  return null;
}

/**
 * Key for a specific caller. `userId === null` means an internal service-role
 * call, which keeps using the instance key.
 */
export async function getFubApiKeyForUser(userId: string | null): Promise<string> {
  if (userId === null) {
    const key = await getInstanceSecret('FUB_API_KEY');
    if (!key) throw new FubConfigError(NOT_CONNECTED);
    return key;
  }


  const { orgId, isOriginalOrg } = await getUserOrgContext(userId);
  if (!orgId) throw new FubConfigError(NOT_CONNECTED);

  const orgKey = await orgVaultKey(orgId);
  if (orgKey) return orgKey;

  if (isOriginalOrg) {
    const key = await getInstanceSecret('FUB_API_KEY');
    if (key) return key;
  }

  throw new FubConfigError(NOT_CONNECTED);
}

/** Basic auth header scoped to the caller's organization. */
export async function fubAuthHeaderForUser(userId: string | null): Promise<string> {
  return 'Basic ' + btoa(`${await getFubApiKeyForUser(userId)}:`);
}

/** Standard headers for every FUB request, scoped to the caller's organization. */
export async function fubHeadersForUser(
  userId: string | null,
  systemName = 'Real Estate Hub',
): Promise<Record<string, string>> {
  return {
    Authorization: await fubAuthHeaderForUser(userId),
    'Content-Type': 'application/json',
    'X-System': systemName,
    'X-System-Key': 'lovable-hub',
  };
}
