/**
 * Writes client portal links onto the matching Follow Up Boss person record.
 *
 * Two custom fields:
 *  - "LUXEhub Portal"          — the INTERNAL, staff-only admin view (login required)
 *  - "LUXEhub Activation Link" — the client's activation URL for the current invite
 *
 * Hard rules:
 *  - Passwords are NEVER written to Follow Up Boss.
 *  - The activation link is bound to the invited email address (enforced in the
 *    database), and is cleared the moment the portal is claimed so no dead link
 *    is left behind.
 *  - A person that cannot be matched by email is skipped and logged; portal
 *    creation must never fail because of this.
 *
 * Body:
 *   { portalId }                      — write the admin link for one portal
 *   { backfill: true }                — write the admin link for the whole org
 *   { portalId, activationUrl }       — also write the activation link
 *   { portalId, clearActivation:true} — blank the activation link (after claim)
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveCaller } from '../_shared/auth.ts';
import { fubAuthHeaderForUser, getFubApiKeyForOrg, FUB_BASE_URL } from '../_shared/fub.ts';
import { tenant } from '../_shared/tenant.ts';

const PORTAL_FIELD = 'LUXEhub Portal';
const ACTIVATION_FIELD = 'LUXEhub Activation Link';

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

/** The staff-only admin view for a portal. Never a client-facing invite URL. */
function portalAdminUrl(portalId: string): string {
  return `${tenant.appUrl}/dashboard/client-portals?portal=${portalId}`;
}

/** Find (or create) a custom field and return the key used on /people. */
async function resolveCustomField(authHeader: string, label: string): Promise<string | null> {
  try {
    const res = await fetch(`${FUB_BASE_URL}/customFields?limit=100`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const fields = (data.customfields || data.customFields || []) as any[];
      const target = normalize(label);
      const hit = fields.find(
        (f) => normalize(f.label || '') === target || normalize(f.name || '') === `custom${target}`,
      );
      if (hit?.name) return hit.name as string;
    }

    const created = await fetch(`${FUB_BASE_URL}/customFields`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ label, type: 'text' }),
    });
    if (!created.ok) {
      console.error(`portal-fub-link: could not create "${label}" (${created.status})`);
      return null;
    }
    const field = await created.json();
    return (field?.name || field?.customfield?.name || null) as string | null;
  } catch (e) {
    console.error(`portal-fub-link: custom field lookup failed for "${label}":`, (e as Error).message);
    return null;
  }
}

async function findPersonIdByEmail(authHeader: string, email: string): Promise<number | null> {
  const url = `${FUB_BASE_URL}/people?email=${encodeURIComponent(email)}&limit=1&fields=id,emails`;
  const res = await fetch(url, { headers: { Authorization: authHeader, Accept: 'application/json' } });
  if (!res.ok) return null;
  const data = await res.json();
  const person = (data.people || [])[0];
  return person?.id ? Number(person.id) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const caller = await resolveCaller(req);
  if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);

  try {
    const { portalId, backfill, activationUrl, clearActivation } = await req
      .json()
      .catch(() => ({}) as any);
    const db = admin();

    // A portal client may only blank their own activation link once claimed.
    if (!caller.isStaff) {
      if (!clearActivation || !portalId) return json({ error: 'FORBIDDEN' }, 403);
      const { data: owned } = await db
        .from('client_accounts')
        .select('id')
        .eq('id', portalId)
        .eq('user_id', caller.userId)
        .maybeSingle();
      if (!owned) return json({ error: 'FORBIDDEN' }, 403);
    }

    let orgId: string | null = null;
    if (caller.kind === 'staff') {
      const { data: profile } = await db
        .from('profiles')
        .select('org_id')
        .eq('id', caller.userId)
        .maybeSingle();
      orgId = profile?.org_id ?? null;
    }

    let query = db.from('client_accounts').select('id,email,fub_person_id,org_id');
    if (orgId) query = query.eq('org_id', orgId);
    if (portalId) query = query.eq('id', portalId);
    else if (!backfill) return json({ error: 'portalId or backfill is required' }, 400);

    const { data: portals, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!portals?.length) return json({ updated: 0, skipped: 0, results: [] });

    // Staff act with their own organization's key; service and client callers
    // use the key of the organization that owns the portal.
    let authHeader: string;
    if (caller.kind === 'staff') {
      authHeader = await fubAuthHeaderForUser(caller.userId);
    } else {
      const ownerOrg = (portals[0] as { org_id: string | null }).org_id;
      const key = await getFubApiKeyForOrg(ownerOrg);
      if (!key) return json({ updated: 0, skipped: portals.length, results: [], reason: 'no_key' });
      authHeader = 'Basic ' + btoa(`${key}:`);
    }

    const portalField = await resolveCustomField(authHeader, PORTAL_FIELD);
    const wantsActivation = Boolean(activationUrl) || clearActivation === true;
    const activationField = wantsActivation
      ? await resolveCustomField(authHeader, ACTIVATION_FIELD)
      : null;

    let updated = 0;
    let skipped = 0;
    const results: { email: string; status: string }[] = [];

    for (const p of portals as { id: string; email: string; fub_person_id: number | null }[]) {
      const email = (p.email || '').trim().toLowerCase();
      const personId = p.fub_person_id ?? (email ? await findPersonIdByEmail(authHeader, email) : null);
      if (!personId) {
        skipped++;
        console.log(`portal-fub-link: no Follow Up Boss match for ${email || p.id} — skipped`);
        results.push({ email, status: 'no_match' });
        continue;
      }

      const payload: Record<string, string> = {};
      // Never overwrite the admin link during a pure clear-activation call.
      if (portalField && !clearActivation) payload[portalField] = portalAdminUrl(p.id);
      if (activationField) {
        payload[activationField] = clearActivation ? '' : String(activationUrl);
      }
      if (!Object.keys(payload).length) {
        skipped++;
        results.push({ email, status: 'no_field' });
        continue;
      }

      const res = await fetch(`${FUB_BASE_URL}/people/${personId}`, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        skipped++;
        const detail = await res.text();
        console.error(`portal-fub-link: update failed for ${email} [${res.status}] ${detail}`);
        results.push({ email, status: `failed_${res.status}` });
        continue;
      }
      updated++;
      results.push({ email, status: clearActivation ? 'cleared' : 'updated' });

      // Remember the match so future writes skip the lookup.
      if (!p.fub_person_id) {
        await db.from('client_accounts').update({ fub_person_id: personId }).eq('id', p.id);
      }
    }

    return json({ updated, skipped, results });
  } catch (err) {
    console.error('portal-fub-link error:', (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});
