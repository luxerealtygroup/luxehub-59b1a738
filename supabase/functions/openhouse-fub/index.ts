// Open house sign-ins -> Follow Up Boss.
//
// Hard rules:
//  - The API key lives in Vault (per organization) and is only ever read here.
//    It is never returned, never logged, never echoed back in any shape.
//  - Saving a key requires admin or owner; the value is validated live first.
//  - Sending is idempotent: a visitor already marked sent is skipped.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireStaff } from '../_shared/auth.ts';
import { FUB_BASE_URL, getUserOrgContext, getFubApiKeyForUser } from '../_shared/fub.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

const scrub = (text: string, secret: string) =>
  secret ? text.split(secret).join('[redacted]') : text;

function headers(key: string) {
  return {
    Authorization: 'Basic ' + btoa(`${key}:`),
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-System': 'Real Estate Hub',
    'X-System-Key': 'lovable-hub',
  };
}

async function fub(key: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${FUB_BASE_URL}${path}`, { ...init, headers: headers(key) });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: res.ok, status: res.status, body, text };
}

async function testKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fub(key, '/identity');
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Follow Up Boss rejected that key (unauthorized).' };
    }
    if (!res.ok) return { ok: false, message: `Follow Up Boss returned ${res.status}.` };
    const name = res.body?.account?.name || res.body?.name;
    return { ok: true, message: name ? `Connected to ${name}` : 'Connected' };
  } catch (e) {
    return { ok: false, message: scrub(`Could not reach Follow Up Boss: ${(e as Error).message}`, key) };
  }
}

// ---------------------------------------------------------------------------

interface Visitor {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  working_with_agent: boolean | null;
  agent_name: string | null;
  intent: string | null;
  has_home_to_sell: string | null;
  timeline: string | null;
  lender_status: string | null;
  custom_answers: Record<string, string> | null;
  notes: string | null;
  temperature: string | null;
  fub_contact_id: string | null;
  fub_sent_at: string | null;
  signed_in_at: string | null;
  client_captured_at: string | null;
  created_at: string;
}

const VISITOR_COLUMNS =
  'id, first_name, last_name, email, phone, working_with_agent, agent_name, intent, ' +
  'has_home_to_sell, timeline, lender_status, custom_answers, notes, temperature, ' +
  'fub_contact_id, fub_sent_at, signed_in_at, client_captured_at, created_at';

function buildNote(v: Visitor, address: string) {
  const when = v.client_captured_at || v.signed_in_at || v.created_at;
  const date = new Date(when).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' });
  const lines = [
    `Open house sign-in — ${address}`,
    `Signed in: ${date}`,
    '',
    `Buying or selling: ${v.intent ?? 'not asked'}`,
    `Timeline: ${v.timeline ?? 'not asked'}`,
    `Lender: ${v.lender_status ?? 'not asked'}`,
    `Home to sell: ${v.has_home_to_sell ?? 'not asked'}`,
    `Working with an agent: ${
      v.working_with_agent === true
        ? `yes${v.agent_name ? ` (${v.agent_name})` : ''}`
        : v.working_with_agent === false
          ? 'no'
          : 'not asked'
    }`,
  ];
  if (v.temperature) lines.push(`Temperature: ${v.temperature}`);
  const custom = Object.entries(v.custom_answers ?? {});
  if (custom.length) {
    lines.push('');
    for (const [q, a] of custom) lines.push(`${q}: ${a}`);
  }
  if (v.notes) {
    lines.push('', `Agent notes: ${v.notes}`);
  }
  return lines.join('\n');
}

/**
 * One source for everyone ('Open House'); the property lives in a tag so the
 * account does not grow a source label per listing.
 */
function buildTags(v: Visitor, address: string) {
  const tags = ['Open House'];
  if (address) tags.push(`Open House - ${address}`);
  if (v.temperature) tags.push(`Open House ${v.temperature[0].toUpperCase()}${v.temperature.slice(1)}`);
  if (v.has_home_to_sell === 'yes') tags.push('Has Home To Sell');
  else if (v.has_home_to_sell === 'no') tags.push('No Home To Sell');
  return tags;
}

// ---- stages ---------------------------------------------------------------

interface Stage { id: number; name: string }

const stageCache = new Map<string, { at: number; stages: Stage[] }>();
const STAGE_CACHE_MS = 5 * 60 * 1000;

async function getStages(key: string, cacheKey: string): Promise<Stage[]> {
  const hit = stageCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STAGE_CACHE_MS) return hit.stages;
  const res = await fub(key, '/stages?limit=100');
  if (!res.ok) throw new Error(`Could not load the Follow Up Boss stage list (${res.status}).`);
  const stages: Stage[] = (res.body?.stages ?? [])
    .filter((s: any) => s?.name)
    .map((s: any) => ({ id: Number(s.id), name: String(s.name) }));
  stageCache.set(cacheKey, { at: Date.now(), stages });
  return stages;
}

/** Entry stages we are allowed to move someone out of. Anything else is real work. */
const UNWORKED = /^(lead|new lead|new leads?|contact|contacted|inquiry|unworked|new|prospect)$/i;

function isUnworked(current: string | null | undefined, stages: Stage[]) {
  const name = (current || '').trim();
  if (!name) return true;
  if (UNWORKED.test(name)) return true;
  const first = stages[0]?.name;
  return Boolean(first && first.toLowerCase() === name.toLowerCase());
}

/** Find a Follow Up Boss user whose email matches the hosting agent. */
async function findAgent(key: string, email: string | null) {
  if (!email) return null;
  const res = await fub(key, `/users?limit=100`);
  if (!res.ok) return null;
  const users: any[] = res.body?.users ?? [];
  const hit = users.find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());
  return hit ? { id: hit.id as number, name: String(hit.name || '') } : null;
}

async function findPerson(key: string, v: Visitor) {
  const digits = (v.phone || '').replace(/\D/g, '');
  if (digits.length >= 10) {
    const res = await fub(key, `/people?phone=${encodeURIComponent(digits)}&limit=1`);
    const hit = res.body?.people?.[0];
    if (hit?.id) return hit;
  }
  if (v.email) {
    const res = await fub(key, `/people?email=${encodeURIComponent(v.email)}&limit=1`);
    const hit = res.body?.people?.[0];
    if (hit?.id) return hit;
  }
  return null;
}

async function sendOne(
  key: string,
  v: Visitor,
  house: { property_address: string; hosting_email: string | null },
): Promise<{ ok: boolean; personId?: string; error?: string }> {
  if (v.fub_sent_at && v.fub_contact_id) {
    return { ok: true, personId: v.fub_contact_id };
  }
  if (!v.phone && !v.email) {
    return { ok: false, error: 'No phone or email on this guest — Follow Up Boss needs one of them.' };
  }

  const address = house.property_address || 'Open House';
  const agent = await findAgent(key, house.hosting_email);
  const tags = buildTags(v);

  let personId: string | null = null;
  const existing = await findPerson(key, v);

  if (existing) {
    personId = String(existing.id);
    const merged = Array.from(new Set([...(existing.tags ?? []), ...tags]));
    const upd = await fub(key, `/people/${personId}`, {
      method: 'PUT',
      body: JSON.stringify({ tags: merged }),
    });
    if (!upd.ok) return { ok: false, error: scrub(`Follow Up Boss ${upd.status}: ${upd.text}`, key).slice(0, 500) };
  } else {
    const body: Record<string, unknown> = {
      firstName: v.first_name,
      lastName: v.last_name || '',
      source: `Open House - ${address}`,
      tags,
    };
    if (v.email) body.emails = [{ value: v.email }];
    if (v.phone) body.phones = [{ value: v.phone }];
    if (agent) {
      body.assignedUserId = agent.id;
      if (agent.name) body.assignedTo = agent.name;
    }
    const created = await fub(key, '/people?deduplicate=true', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!created.ok || !created.body?.id) {
      return { ok: false, error: scrub(`Follow Up Boss ${created.status}: ${created.text}`, key).slice(0, 500) };
    }
    personId = String(created.body.id);
  }

  const note = await fub(key, '/notes', {
    method: 'POST',
    body: JSON.stringify({
      personId: Number(personId),
      subject: `Open House — ${address}`,
      body: buildNote(v, address),
      isHtml: false,
    }),
  });
  if (!note.ok) {
    return { ok: false, error: scrub(`Note failed (${note.status}): ${note.text}`, key).slice(0, 500) };
  }

  return { ok: true, personId: personId! };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = await requireStaff(req, { cors: corsHeaders });
  if (!guard.ok) return guard.response;
  const caller = guard.caller;

  let body: { action?: string; value?: string; visitorId?: string; openHouseId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  const action = body.action ?? 'status';
  const db = admin();

  try {
    // ---- key management (admin/owner only) --------------------------------
    if (action === 'status' || action === 'save_key' || action === 'test') {
      if (!caller.isAdmin) return json({ error: 'FORBIDDEN' }, 403);

      if (action === 'save_key') {
        const value = (body.value ?? '').trim();
        body.value = '';
        if (!value) return json({ error: 'Enter a key before saving.' }, 400);
        if (value.length > 500) return json({ error: 'That value is too long to be valid.' }, 400);

        const check = await testKey(value);
        if (!check.ok) return json({ error: check.message, configured: false }, 400);

        const { orgId } = await getUserOrgContext(caller.userId!);
        if (!orgId) return json({ error: 'No organization on your profile.' }, 400);
        const { error } = await db.rpc('set_org_secret', {
          _org_id: orgId,
          _key: 'FUB_API_KEY',
          _value: value,
          _actor: caller.userId,
        });
        if (error) return json({ error: 'Could not store the key.' }, 500);
        return json({ configured: true, live: { ok: true, message: check.message } });
      }

      let key: string | null = null;
      try {
        key = await getFubApiKeyForUser(caller.userId);
      } catch {
        key = null;
      }
      if (!key) return json({ configured: false, live: { ok: false, message: 'Not connected' } });
      if (action === 'test') return json({ configured: true, live: await testKey(key) });
      return json({ configured: true, live: null });
    }

    // ---- sending ----------------------------------------------------------
    if (action !== 'push' && action !== 'push_all') return json({ error: 'Unknown action' }, 400);

    const key = await getFubApiKeyForUser(caller.userId).catch(() => null);
    if (!key) {
      return json({ error: 'Follow Up Boss is not connected for this team yet.' }, 400);
    }

    let openHouseId = body.openHouseId ?? null;
    let visitors: Visitor[] = [];

    if (action === 'push') {
      if (!body.visitorId) return json({ error: 'visitorId is required' }, 400);
      const { data, error } = await db
        .from('open_house_visitors')
        .select(`${VISITOR_COLUMNS}, open_house_id`)
        .eq('id', body.visitorId)
        .maybeSingle();
      if (error || !data) return json({ error: 'Guest not found' }, 404);
      openHouseId = (data as any).open_house_id;
      visitors = [data as unknown as Visitor];
    } else {
      if (!openHouseId) return json({ error: 'openHouseId is required' }, 400);
      const { data, error } = await db
        .from('open_house_visitors')
        .select(VISITOR_COLUMNS)
        .eq('open_house_id', openHouseId)
        .is('fub_sent_at', null);
      if (error) return json({ error: 'Could not load the guest list' }, 500);
      visitors = (data ?? []) as unknown as Visitor[];
    }

    const { data: house } = await db
      .from('open_houses')
      .select('property_address, hosting_agent_id, user_id, org_id')
      .eq('id', openHouseId)
      .maybeSingle();
    if (!house) return json({ error: 'Open house not found' }, 404);

    // Never cross an organization boundary.
    const { orgId } = await getUserOrgContext(caller.userId!);
    if (caller.userId && house.org_id && house.org_id !== orgId) {
      return json({ error: 'FORBIDDEN' }, 403);
    }

    const hostId = (house as any).hosting_agent_id || (house as any).user_id;
    let hostingEmail: string | null = null;
    if (hostId) {
      const { data: prof } = await db.from('profiles').select('email').eq('id', hostId).maybeSingle();
      hostingEmail = (prof as any)?.email ?? null;
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const v of visitors) {
      const out = await sendOne(key, v, {
        property_address: (house as any).property_address,
        hosting_email: hostingEmail,
      });
      if (out.ok) {
        await db
          .from('open_house_visitors')
          .update({
            fub_contact_id: out.personId ?? null,
            fub_linked: true,
            fub_sent_at: new Date().toISOString(),
            fub_sync_error: null,
          })
          .eq('id', v.id);
      } else {
        await db
          .from('open_house_visitors')
          .update({ fub_sync_error: out.error ?? 'Unknown error', fub_sent_at: null })
          .eq('id', v.id);
      }
      results.push({ id: v.id, ok: out.ok, error: out.error });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;
    return json({
      sent,
      failed,
      results,
      error: action === 'push' && failed ? results[0]?.error : undefined,
    }, action === 'push' && failed ? 400 : 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
