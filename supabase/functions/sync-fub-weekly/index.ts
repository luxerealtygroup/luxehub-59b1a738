// Weekly Follow Up Boss actuals -> existing weekly_411 rows.
//
// One run a week (Sunday 8pm America/Toronto), plus admin "Run now" for backfills.
// Idempotent: re-running a week overwrites that week's measured columns and never
// touches goals, priorities, reflections or the manual-entry fields.
//
// The API key is the same per-organization key the open house push uses.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { sharedCorsHeaders as corsHeaders, resolveCaller } from '../_shared/auth.ts';
import { FUB_BASE_URL, getFubApiKeyForOrg } from '../_shared/fub.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const db = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

const PAGE_LIMIT = 100;
const MAX_PAGES = 60; // 6,000 records per endpoint per run

// ---------------------------------------------------------------------------
// Dates (America/Toronto)

function torontoParts(d: Date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: String(parts.weekday),
  };
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Most recently completed Monday-Sunday week in Toronto. */
function lastCompletedWeek(now = new Date()) {
  const { date } = torontoParts(now);
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
  const daysSinceMonday = (dow + 6) % 7;
  const thisMonday = addDays(date, -daysSinceMonday);
  const week_start = addDays(thisMonday, -7);
  return { week_start, week_end: addDays(week_start, 6) };
}

// Toronto's offset shifts with daylight saving, so every window test compares
// the record's local Toronto date string rather than a fixed UTC offset.

function inWeek(created: string | null | undefined, week_start: string, week_end: string) {
  if (!created) return false;
  const local = torontoParts(new Date(created)).date;
  return local >= week_start && local <= week_end;
}

function beforeWeek(created: string | null | undefined, week_start: string) {
  if (!created) return false;
  return torontoParts(new Date(created)).date < week_start;
}

// ---------------------------------------------------------------------------
// Follow Up Boss fetching

async function fubGet(key: string, path: string, params: Record<string, string | number | boolean>) {
  const url = new URL(`${FUB_BASE_URL}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers = {
    Authorization: 'Basic ' + btoa(`${key}:`),
    'Content-Type': 'application/json',
    'X-System': 'Real Estate Hub',
    'X-System-Key': 'lovable-hub',
  };

  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url.toString(), { headers });
    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? res.headers.get('X-RateLimit-Reset') ?? 0);
      const waitMs = retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** attempt;
      console.warn(`FUB ${path} -> ${res.status}, waiting ${waitMs}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Follow Up Boss ${path} returned ${res.status}: ${detail}`);
    }
    return await res.json();
  }
  throw new Error(`Follow Up Boss ${path} kept rate limiting`);
}

/**
 * Endpoints without a date filter: page newest-first and stop once records
 * predate the window. Returns the records inside the window.
 */
async function pageBackwards(
  key: string,
  path: string,
  collection: string,
  week_start: string,
  week_end: string,
  extra: Record<string, string | number | boolean> = {},
  createdField = 'created',
) {
  const out: Record<string, unknown>[] = [];
  let offset = 0;
  let pages = 0;
  let capped = false;

  while (pages < MAX_PAGES) {
    const data = await fubGet(key, path, { limit: PAGE_LIMIT, offset, ...extra });
    const rows: Record<string, unknown>[] = (data?.[collection] as Record<string, unknown>[]) ?? [];
    if (rows.length === 0) break;

    let reachedOlder = false;
    for (const row of rows) {
      const created = row[createdField] as string | undefined;
      if (inWeek(created, week_start, week_end)) out.push(row);
      else if (beforeWeek(created, week_start)) reachedOlder = true;
    }
    pages++;
    if (reachedOlder || rows.length < PAGE_LIMIT) break;
    offset += PAGE_LIMIT;
    if (pages >= MAX_PAGES) capped = true;
  }
  if (capped) console.warn(`FUB ${path}: hit the ${MAX_PAGES}-page cap for ${week_start}..${week_end}`);
  return { rows: out, capped };
}

// ---------------------------------------------------------------------------

const CANCELLED = /cancel|no.?show/i;

function rentalMarkers(csv: string | null | undefined): string[] {
  const list = (csv ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : ['rent'];
}

function looksRental(person: Record<string, unknown>, markers: string[]) {
  const hay = [
    String(person.source ?? ''),
    String(person.stage ?? ''),
    ...(Array.isArray(person.tags) ? (person.tags as string[]) : []),
  ].join(' ').toLowerCase();
  return markers.some((m) => hay.includes(m));
}

interface Totals {
  new_leads: number;
  leads_claimed_from_pond: number;
  calls_total: number;
  calls_outbound: number;
  calls_connected: number;
  talk_time_seconds: number;
  texts_sent: number;
  texts_received: number;
  appointments_set: number;
  appointments_held: number;
  deals_active: number;
  deals_created: number;
}

const emptyTotals = (): Totals => ({
  new_leads: 0, leads_claimed_from_pond: 0, calls_total: 0, calls_outbound: 0,
  calls_connected: 0, talk_time_seconds: 0, texts_sent: 0, texts_received: 0,
  appointments_set: 0, appointments_held: 0, deals_active: 0, deals_created: 0,
});

async function syncOrg(
  supa: ReturnType<typeof db>,
  orgId: string,
  week_start: string,
  week_end: string,
  triggeredBy: string | null,
) {
  const { data: run } = await supa
    .from('fub_weekly_sync_runs')
    .insert({ org_id: orgId, week_start, week_end, triggered_by: triggeredBy })
    .select('id')
    .maybeSingle();
  const runId = (run as { id: string } | null)?.id ?? null;

  const finish = async (status: string, synced: number, unmatched: number, error?: string) => {
    if (runId) {
      await supa.from('fub_weekly_sync_runs')
        .update({ status, agents_synced: synced, agents_unmatched: unmatched, error: error ?? null, finished_at: new Date().toISOString() })
        .eq('id', runId);
    }
  };

  const { data: profiles } = await supa
    .from('profiles')
    .select('id, full_name, email, fub_user_id, fub_user_email')
    .eq('org_id', orgId);
  const team = (profiles ?? []) as {
    id: string; full_name: string | null; email: string | null;
    fub_user_id: number | null; fub_user_email: string | null;
  }[];

  const key = await getFubApiKeyForOrg(orgId);
  if (!key) {
    for (const p of team) {
      await supa.from('weekly_411').upsert({
        user_id: p.id, org_id: orgId, week_start_date: week_start,
        fub_sync_status: 'not_configured',
        fub_sync_error: 'Follow Up Boss is not connected for this team.',
      }, { onConflict: 'user_id,week_start_date' });
    }
    await finish('not_configured', 0, team.length, 'Follow Up Boss is not connected for this team.');
    return { org_id: orgId, status: 'not_configured', synced: 0, unmatched: team.length };
  }

  // ---- 1. map agents to FUB users by email (never by name) ----------------
  const usersData = await fubGet(key, 'users', { limit: PAGE_LIMIT });
  const fubUsers: { id: number; email?: string; name?: string }[] = usersData?.users ?? [];
  const byEmail = new Map(fubUsers.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u]));

  for (const p of team) {
    if (p.fub_user_id) continue;
    const match = p.email ? byEmail.get(p.email.toLowerCase()) : undefined;
    if (match) {
      p.fub_user_id = match.id;
      p.fub_user_email = match.email ?? null;
      await supa.from('profiles')
        .update({ fub_user_id: match.id, fub_user_email: match.email ?? null })
        .eq('id', p.id);
    }
  }

  const matched = team.filter((p) => p.fub_user_id);
  const unmatched = team.filter((p) => !p.fub_user_id);

  // ---- 2. rental exclusion setting ----------------------------------------
  const { data: setting } = await supa
    .from('app_settings')
    .select('value')
    .eq('org_id', orgId)
    .eq('key', 'fub_rental_markers')
    .maybeSingle();
  const markers = rentalMarkers((setting as { value: string } | null)?.value);

  // ---- 3. account-wide feeds (no date or user filter available) -----------
  const calls = await pageBackwards(key, 'calls', 'calls', week_start, week_end, { sort: '-created' });
  const texts = await pageBackwards(key, 'textMessages', 'textmessages', week_start, week_end);
  const people = await pageBackwards(key, 'people', 'people', week_start, week_end, {
    includeUnclaimed: true,
    sort: '-created',
  });

  const totals = new Map<number, Totals>();
  const get = (id: number | null | undefined) => {
    if (!id) return null;
    if (!totals.has(id)) totals.set(id, emptyTotals());
    return totals.get(id)!;
  };

  for (const c of calls.rows) {
    const t = get(Number(c.userId));
    if (!t) continue;
    t.calls_total++;
    if (c.isIncoming === false) t.calls_outbound++;
    const duration = Number(c.duration ?? 0);
    const outcome = String(c.outcome ?? '').trim();
    if (duration > 0 && outcome && !/no answer|voicemail|busy|failed/i.test(outcome)) {
      t.calls_connected++;
      t.talk_time_seconds += duration;
    }
  }

  for (const m of texts.rows) {
    const t = get(Number(m.userId));
    if (!t) continue;
    if (m.isIncoming) t.texts_received++;
    else t.texts_sent++;
  }

  for (const p of people.rows) {
    if (looksRental(p, markers)) continue;
    const assigned = Number(p.assignedUserId ?? 0);
    const t = get(assigned);
    if (t) t.new_leads++;
  }

  // Pond claims: leads created earlier but assigned during the week.
  const claimed = await pageBackwards(
    key, 'people', 'people', week_start, week_end,
    { includeUnclaimed: true, sort: '-updated' }, 'updated',
  );
  for (const p of claimed.rows) {
    if (looksRental(p, markers)) continue;
    if (inWeek(p.created as string, week_start, week_end)) continue; // already counted as new
    const assigned = Number(p.assignedUserId ?? 0);
    const t = get(assigned);
    if (t) t.leads_claimed_from_pond++;
  }

  // ---- 4. per-agent endpoints that do filter properly ---------------------
  for (const p of matched) {
    const t = get(p.fub_user_id!)!;
    try {
      const appts = await fubGet(key, 'appointments', {
        start: `${week_start}T00:00:00Z`,
        end: `${week_end}T23:59:59Z`,
        userId: p.fub_user_id!,
        limit: PAGE_LIMIT,
      });
      for (const a of (appts?.appointments ?? []) as Record<string, unknown>[]) {
        const outcome = String((a as any).outcome?.name ?? (a as any).outcome ?? (a as any).status ?? '');
        if (!CANCELLED.test(outcome)) t.appointments_held++;
        if (inWeek((a as any).created, week_start, week_end)) t.appointments_set++;
      }
    } catch (e) {
      console.warn(`appointments failed for user ${p.fub_user_id}:`, (e as Error).message);
    }

    try {
      const deals = await fubGet(key, 'deals', { userId: p.fub_user_id!, status: 'Active', limit: PAGE_LIMIT });
      const rows = (deals?.deals ?? []) as Record<string, unknown>[];
      t.deals_active = rows.length;
      t.deals_created = rows.filter((d) => inWeek((d as any).created ?? (d as any).createdAt, week_start, week_end)).length;
    } catch (e) {
      console.warn(`deals failed for user ${p.fub_user_id}:`, (e as Error).message);
    }
  }

  // ---- 5. write the measured columns only ---------------------------------
  const now = new Date().toISOString();
  let synced = 0;
  for (const p of matched) {
    const t = totals.get(p.fub_user_id!) ?? emptyTotals();
    const { error } = await supa.from('weekly_411').upsert({
      user_id: p.id,
      org_id: orgId,
      week_start_date: week_start,
      fub_user_id: p.fub_user_id,
      new_leads: t.new_leads,
      leads_claimed_from_pond: t.leads_claimed_from_pond,
      calls_total: t.calls_total,
      calls_outbound: t.calls_outbound,
      calls_connected: t.calls_connected,
      talk_time_seconds: t.talk_time_seconds,
      talk_time_minutes: Math.round(t.talk_time_seconds / 60),
      texts_sent: t.texts_sent,
      texts_received: t.texts_received,
      appointments_set: t.appointments_set,
      appointments_held: t.appointments_held,
      appointments_actual: t.appointments_held,
      deals_active: t.deals_active,
      deals_created: t.deals_created,
      dials: t.calls_total,
      calls_actual: t.calls_total,
      connects: t.calls_connected,
      leads_received: t.new_leads,
      fub_synced_at: now,
      fub_sync_status: 'ok',
      fub_sync_error: null,
      fub_raw: { ...t, week_start, week_end, pages_capped: calls.capped || texts.capped || people.capped },
    }, { onConflict: 'user_id,week_start_date' });
    if (!error) synced++;
    else console.error('weekly_411 upsert failed', p.id, error.message);
  }

  for (const p of unmatched) {
    await supa.from('weekly_411').upsert({
      user_id: p.id, org_id: orgId, week_start_date: week_start,
      fub_sync_status: 'unmatched',
      fub_sync_error: 'No Follow Up Boss user matched this email address.',
    }, { onConflict: 'user_id,week_start_date' });
  }

  await finish('ok', synced, unmatched.length);
  return { org_id: orgId, status: 'ok', synced, unmatched: unmatched.length };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await resolveCaller(req);
  if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);
  if (caller.kind !== 'service' && !caller.isAdmin) return json({ error: 'FORBIDDEN' }, 403);

  let body: { week_start?: string; week_end?: string; cron?: boolean; org_id?: string } = {};
  try { body = await req.json(); } catch { /* defaults */ }

  // The weekly cron fires twice (00:00 and 01:00 UTC) so 8pm Toronto stays exact
  // across daylight saving. Only the 8pm local run does the work.
  if (body.cron) {
    const { hour } = torontoParts(new Date());
    if (hour !== 20) return json({ skipped: true, reason: `Toronto hour is ${hour}` });
  }

  const fallback = lastCompletedWeek();
  const week_start = body.week_start ?? fallback.week_start;
  const week_end = body.week_end ?? addDays(week_start, 6);

  const supa = db();
  let orgIds: string[] = [];
  if (caller.kind === 'service') {
    if (body.org_id) orgIds = [body.org_id];
    else {
      const { data } = await supa.from('organizations').select('id');
      orgIds = (data ?? []).map((o: { id: string }) => o.id);
    }
  } else {
    const { data } = await supa.from('profiles').select('org_id').eq('id', caller.userId).maybeSingle();
    const orgId = (data as { org_id: string | null } | null)?.org_id;
    if (!orgId) return json({ error: 'No organization on your profile.' }, 400);
    orgIds = [orgId];
  }

  const results: unknown[] = [];
  for (const orgId of orgIds) {
    try {
      results.push(await syncOrg(supa, orgId, week_start, week_end, caller.userId));
    } catch (e) {
      console.error(`sync failed for org ${orgId}:`, (e as Error).message);
      await supa.from('fub_weekly_sync_runs').insert({
        org_id: orgId, week_start, week_end, status: 'error',
        error: (e as Error).message, finished_at: new Date().toISOString(),
        triggered_by: caller.userId,
      });
      results.push({ org_id: orgId, status: 'error', error: (e as Error).message });
    }
  }

  return json({ week_start, week_end, results });
});
