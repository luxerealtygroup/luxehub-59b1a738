// Automatic open house -> Follow Up Boss sweep.
//
// Runs on a schedule. Nobody presses anything:
//   - guests are pushed as they sign in by default (or at the end of the open
//     house if the team chose that), using the stage on their row, then the hosting
//     agent's default stage, then the team default, then the first FUB stage
//   - a guest already sent is never sent again, and a person is never created
//     twice (send is idempotent on fub_sent_at + fub_contact_id)
//   - edits made after a guest was sent post a fresh note, debounced by the
//     database trigger so we do not post on every keystroke
//   - no API key yet? the guests simply wait; nothing is marked failed
//   - failures back off and retry; only a persistent failure is surfaced
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getFubApiKeyForOrg } from '../_shared/fub.ts';
import {
  VISITOR_COLUMNS,
  type Stage,
  type Visitor,
  applyStage,
  getStages,
  postNote,
  sendOne,
} from '../_shared/fubOpenHouse.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const SEND_BATCH = 25;
const NOTE_BATCH = 25;
const MAX_ATTEMPTS = 8;
const LEASE_MINUTES = 5;

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

/** Shared secret: the scheduler reads the same value out of the vault. */
async function expectedSecret(): Promise<string | null> {
  const env = Deno.env.get('OPENHOUSE_SWEEP_SECRET')?.trim();
  const { data } = await db
    .from('internal_job_secrets')
    .select('value')
    .eq('key', 'OPENHOUSE_SWEEP_SECRET')
    .maybeSingle();
  const stored = (data as { value: string } | null)?.value?.trim() ?? '';
  return stored || env || null;
}

function backoffMinutes(attempts: number) {
  return Math.min(60, Math.pow(2, Math.max(1, attempts)));
}

interface HouseRow {
  id: string;
  property_address: string | null;
  org_id: string | null;
  hosting_agent_id: string | null;
  user_id: string | null;
  ends_at: string | null;
  open_house_date: string | null;
}

/** Has this open house finished? Legacy rows without times end at the end of their day. */
function hasEnded(h: HouseRow, now: Date) {
  if (h.ends_at) return new Date(h.ends_at).getTime() <= now.getTime();
  if (h.open_house_date) {
    const end = new Date(`${h.open_house_date}T23:59:59`);
    return end.getTime() <= now.getTime();
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = await expectedSecret();
  const supplied = req.headers.get('x-sweep-secret')?.trim() ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const authorized = (secret && supplied && supplied === secret) || (serviceKey && bearer === serviceKey);
  if (!authorized) return json({ error: 'FORBIDDEN' }, 403);

  // ---- single flight: a second run exits rather than doubling up -----------
  const nowIso = new Date().toISOString();
  const until = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
  const { data: lease } = await db
    .from('fub_sweep_lease')
    .update({ locked_until: until, updated_at: nowIso })
    .eq('id', 'openhouse-fub')
    .lt('locked_until', nowIso)
    .select('id');
  if (!lease || lease.length === 0) return json({ skipped: 'another sweep is running' });

  const summary = { sent: 0, failed: 0, held: 0, notes: 0, stages: 0 };

  try {
    const now = new Date();

    // ---- team settings ----------------------------------------------------
    const { data: settingRows } = await db
      .from('app_settings')
      .select('org_id, key, value')
      .in('key', ['open_house_fub_send_timing', 'open_house_fub_default_stage']);
    const timingByOrg = new Map<string, string>();
    const orgStageByOrg = new Map<string, string>();
    for (const r of settingRows ?? []) {
      const row = r as { org_id: string; key: string; value: string | null };
      if (!row.value) continue;
      if (row.key === 'open_house_fub_send_timing') timingByOrg.set(row.org_id, row.value);
      else orgStageByOrg.set(row.org_id, row.value);
    }

    const { data: prefRows } = await db.from('agent_fub_prefs').select('user_id, default_stage');
    const stageByAgent = new Map<string, string>();
    for (const p of prefRows ?? []) {
      const row = p as { user_id: string; default_stage: string | null };
      if (row.default_stage) stageByAgent.set(row.user_id, row.default_stage);
    }

    // Per-org key and stage list, resolved once per run.
    const keys = new Map<string, string | null>();
    const stageLists = new Map<string, Stage[]>();
    const hostEmails = new Map<string, string | null>();

    const keyFor = async (orgId: string) => {
      if (!keys.has(orgId)) keys.set(orgId, await getFubApiKeyForOrg(orgId));
      return keys.get(orgId) ?? null;
    };
    const stagesFor = async (orgId: string, key: string) => {
      if (!stageLists.has(orgId)) stageLists.set(orgId, await getStages(key, orgId));
      return stageLists.get(orgId) ?? [];
    };
    const hostEmailFor = async (userId: string | null) => {
      if (!userId) return null;
      if (!hostEmails.has(userId)) {
        const { data } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
        hostEmails.set(userId, (data as { email: string | null } | null)?.email ?? null);
      }
      return hostEmails.get(userId) ?? null;
    };

    // ---- guests waiting to be pushed --------------------------------------
    const { data: pending } = await db
      .from('open_house_visitors')
      .select(
        `${VISITOR_COLUMNS}, fub_attempts, open_house_id, ` +
          'open_houses!inner(id, property_address, org_id, hosting_agent_id, user_id, ends_at, open_house_date)',
      )
      .is('fub_sent_at', null)
      // No phone and no email means Follow Up Boss has nothing to match on.
      // Those guests simply wait until someone adds a way to reach them.
      .or('phone.not.is.null,email.not.is.null')
      .lt('fub_attempts', MAX_ATTEMPTS)
      .or(`fub_next_attempt_at.is.null,fub_next_attempt_at.lte.${now.toISOString()}`)
      .order('created_at', { ascending: true })
      .limit(SEND_BATCH);

    for (const row of (pending ?? []) as any[]) {
      const house = row.open_houses as HouseRow;
      const orgId = house?.org_id;
      if (!orgId) continue;

      // Speed is the point: unless the team asked for end-of-open-house,
      // a guest goes over as soon as they sign in.
      const timing = timingByOrg.get(orgId) ?? 'signin';
      if (timing !== 'signin' && !hasEnded(house, now)) continue;

      const key = await keyFor(orgId);
      if (!key) {
        // No key yet: hold quietly. These push themselves once one is saved.
        summary.held += 1;
        continue;
      }

      let stages: Stage[];
      try {
        stages = await stagesFor(orgId, key);
      } catch {
        summary.held += 1;
        continue;
      }

      const hostId = house.hosting_agent_id || house.user_id;
      const match = (name: string | null | undefined) =>
        stages.find((s) => s.name.toLowerCase() === (name ?? '').trim().toLowerCase())?.name ?? null;
      // Automatic sends never wait for a human: at sign-in nobody has had the
      // chance to choose, so the hosting agent's usual stage is what we use.
      // A stage already sitting on the row (an agent did choose) still wins.
      const stage =
        match(row.fub_stage) ??
        match(hostId ? stageByAgent.get(hostId) : null) ??
        match(orgStageByOrg.get(orgId)) ??
        stages[0]?.name ??
        null;
      if (!stage) {
        summary.held += 1;
        continue;
      }

      const visitor = row as unknown as Visitor;
      const out = await sendOne(
        key,
        visitor,
        {
          property_address: house.property_address || 'Open House',
          hosting_email: await hostEmailFor(hostId),
        },
        stage,
        stages,
      );

      if (out.ok) {
        await db
          .from('open_house_visitors')
          .update({
            fub_contact_id: out.personId ?? null,
            fub_linked: true,
            fub_sent_at: new Date().toISOString(),
            fub_note_updated_at: new Date().toISOString(),
            fub_sync_error: null,
            fub_attempts: 0,
            fub_next_attempt_at: null,
            fub_note_due_at: null,
            fub_stage: stage,
            fub_stage_result: out.stageResult ?? null,
          })
          .eq('id', visitor.id);
        summary.sent += 1;
      } else {
        const attempts = Number(row.fub_attempts ?? 0) + 1;
        await db
          .from('open_house_visitors')
          .update({
            fub_attempts: attempts,
            fub_next_attempt_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
            fub_sync_error: out.error ?? 'Unknown error',
          })
          .eq('id', visitor.id);
        summary.failed += 1;
      }
    }

    // ---- stage changes made after the guest went over -----------------------
    // The agent picked a different stage on the row. Move the same person in
    // Follow Up Boss, unless they are already in a real working stage.
    const { data: dueStages } = await db
      .from('open_house_visitors')
      .select('id, fub_contact_id, fub_stage, open_houses!inner(org_id)')
      .not('fub_contact_id', 'is', null)
      .not('fub_stage', 'is', null)
      .not('fub_stage_due_at', 'is', null)
      .lte('fub_stage_due_at', now.toISOString())
      .limit(NOTE_BATCH);

    for (const row of (dueStages ?? []) as any[]) {
      const orgId = row.open_houses?.org_id as string | undefined;
      if (!orgId) continue;
      const key = await keyFor(orgId);
      if (!key) continue;
      let stages: Stage[];
      try {
        stages = await stagesFor(orgId, key);
      } catch {
        continue;
      }
      const out = await applyStage(key, String(row.fub_contact_id), String(row.fub_stage), stages);
      if (out.ok) {
        await db
          .from('open_house_visitors')
          .update({
            fub_stage_due_at: null,
            fub_stage_result: out.stageResult ?? null,
            fub_sync_error: null,
          })
          .eq('id', row.id);
        summary.stages += 1;
      } else {
        await db
          .from('open_house_visitors')
          .update({
            fub_stage_due_at: new Date(Date.now() + 10 * 60_000).toISOString(),
            fub_sync_error: out.error ?? 'Unknown error',
          })
          .eq('id', row.id);
        summary.failed += 1;
      }
    }

    // ---- fresh notes for guests already in Follow Up Boss -------------------
    const { data: dueNotes } = await db
      .from('open_house_visitors')
      .select(
        `${VISITOR_COLUMNS}, fub_attempts, open_house_id, ` +
          'open_houses!inner(id, property_address, org_id)',
      )
      .not('fub_contact_id', 'is', null)
      .not('fub_note_due_at', 'is', null)
      .lte('fub_note_due_at', now.toISOString())
      .limit(NOTE_BATCH);

    for (const row of (dueNotes ?? []) as any[]) {
      const orgId = row.open_houses?.org_id as string | undefined;
      if (!orgId) continue;
      const key = await keyFor(orgId);
      if (!key) continue;
      const visitor = row as unknown as Visitor;
      const out = await postNote(
        key,
        visitor.fub_contact_id!,
        visitor,
        row.open_houses?.property_address || 'Open House',
        true,
      );
      if (out.ok) {
        await db
          .from('open_house_visitors')
          .update({
            fub_note_updated_at: new Date().toISOString(),
            fub_note_due_at: null,
            fub_sync_error: null,
          })
          .eq('id', visitor.id);
        summary.notes += 1;
      } else {
        await db
          .from('open_house_visitors')
          .update({
            fub_note_due_at: new Date(Date.now() + 10 * 60_000).toISOString(),
            fub_sync_error: out.error ?? 'Unknown error',
          })
          .eq('id', visitor.id);
        summary.failed += 1;
      }
    }

    return json({ ok: true, ...summary });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  } finally {
    // Release early so the next scheduled run is not stuck behind the lease.
    await db
      .from('fub_sweep_lease')
      .update({ locked_until: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', 'openhouse-fub');
  }
});
