/**
 * Writes each client portal's INTERNAL admin URL onto the matching Follow Up
 * Boss person record, in a custom field called "LUXEhub Portal".
 *
 * Hard rules:
 *  - The value is always the staff-only admin view (login required). Invite
 *    tokens, magic links and passwords are NEVER written to Follow Up Boss.
 *  - A person that cannot be matched by email is skipped and logged; portal
 *    creation must never fail because of this.
 *
 * Body: { portalId: string }  — single portal
 *       { backfill: true }    — every portal in the caller's organization
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { requireStaff } from '../_shared/auth.ts';
import { fubAuthHeaderForUser, FUB_BASE_URL } from '../_shared/fub.ts';
import { tenant } from '../_shared/tenant.ts';

const FIELD_LABEL = 'LUXEhub Portal';

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

/** Find (or create) the custom field and return the key used on /people. */
async function resolveCustomField(authHeader: string): Promise<string> {
  const res = await fetch(`${FUB_BASE_URL}/customFields?limit=100`, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });
  if (res.ok) {
    const data = await res.json();
    const fields = (data.customfields || data.customFields || []) as any[];
    const target = normalize(FIELD_LABEL);
    const hit = fields.find(
      (f) => normalize(f.label || '') === target || normalize(f.name || '') === `custom${target}`,
    );
    if (hit?.name) return hit.name as string;
  }

  const created = await fetch(`${FUB_BASE_URL}/customFields`, {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ label: FIELD_LABEL, type: 'text' }),
  });
  if (!created.ok) {
    throw new Error(`Could not create the "${FIELD_LABEL}" field in Follow Up Boss (${created.status})`);
  }
  const field = await created.json();
  const name = field?.name || field?.customfield?.name;
  if (!name) throw new Error('Follow Up Boss did not return the custom field name');
  return name as string;
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

  const guard = await requireStaff(req, { cors: corsHeaders });
  if (!guard.ok) return guard.response;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const { portalId, backfill } = await req.json().catch(() => ({}) as any);
    const db = admin();

    // Callers only ever touch portals inside their own organization.
    const { data: profile } = await db
      .from('profiles')
      .select('org_id')
      .eq('id', guard.caller.userId)
      .maybeSingle();
    const orgId = profile?.org_id ?? null;

    let query = db.from('client_accounts').select('id,email,fub_person_id,org_id');
    if (orgId) query = query.eq('org_id', orgId);
    if (portalId) query = query.eq('id', portalId);
    else if (!backfill) return json({ error: 'portalId or backfill is required' }, 400);

    const { data: portals, error } = await query;
    if (error) return json({ error: error.message }, 500);
    if (!portals?.length) return json({ updated: 0, skipped: 0, results: [] });

    const authHeader = await fubAuthHeaderForUser(guard.caller.userId);
    const fieldKey = await resolveCustomField(authHeader);

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

      const res = await fetch(`${FUB_BASE_URL}/people/${personId}`, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ [fieldKey]: portalAdminUrl(p.id) }),
      });
      if (!res.ok) {
        skipped++;
        const detail = await res.text();
        console.error(`portal-fub-link: update failed for ${email} [${res.status}] ${detail}`);
        results.push({ email, status: `failed_${res.status}` });
        continue;
      }
      updated++;
      results.push({ email, status: 'updated' });

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
