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
import { getUserOrgContext, getFubApiKeyForUser, getFubApiKeyForOrg } from '../_shared/fub.ts';
import {
  VISITOR_COLUMNS,
  type Visitor,
  getStages,
  applyStage,
  postNote,
  sendOne,
  testKey,
} from '../_shared/fubOpenHouse.ts';

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

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const guard = await requireStaff(req, { cors: corsHeaders });
  if (!guard.ok) return guard.response;
  const caller = guard.caller;

  let body: {
    action?: string;
    value?: string;
    visitorId?: string;
    openHouseId?: string;
    stage?: string;
    visitorIds?: string[];
    orgId?: string;
  };
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
    if (
      action !== 'push' && action !== 'push_all' && action !== 'stages' &&
      action !== 'update_note' && action !== 'restage' && action !== 'texts_dump'
    ) {
      return json({ error: 'Unknown action' }, 400);
    }


    // Server-to-server callers name the organization; people are resolved from
    // their own profile.
    const callerOrgId = caller.userId
      ? (await getUserOrgContext(caller.userId)).orgId
      : body.orgId ?? null;

    const key = caller.userId
      ? await getFubApiKeyForUser(caller.userId).catch(() => null)
      : callerOrgId
        ? await getFubApiKeyForOrg(callerOrgId).catch(() => null)
        : null;
    if (!key) {
      return json({ error: 'Follow Up Boss is not connected for this team yet.' }, 400);
    }

    const stages = await getStages(key, callerOrgId ?? 'instance');

    if (action === 'stages') return json({ stages: stages.map((s) => s.name) });

    // temporary diagnostic: raw text-message shape for one week
    if (action === 'texts_dump') {
      const ws = (body as any).week_start as string, we = (body as any).week_end as string;
      const tor = (d: string) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(d));
      const api = async (path: string, params: Record<string, string | number>) => {
        const url = new URL(`https://api.followupboss.com/v1/${path}`);
        for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
        const r = await fetch(url.toString(), {
          headers: {
            Authorization: 'Basic ' + btoa(`${key}:`),
            'Content-Type': 'application/json',
            'X-System': 'Real Estate Hub',
            'X-System-Key': 'lovable-hub',
          },
        });
        return await r.json().catch(() => null) as any;
      };
      const ids: number[] = [];
      let offset = 0, older = false;
      while (!older && ids.length < 800) {
        const r = await api('people', { limit: 100, offset, sort: '-lastActivity', includeUnclaimed: 'true' });
        const rows: any[] = r?.people ?? [];
        if (!rows.length) break;
        for (const p of rows) {
          const act = p.lastActivity ?? p.updated;
          if (!act || tor(act) < ws) { older = true; continue; }
          ids.push(Number(p.id));
        }
        offset += 100;
      }
      const byId = new Map<string, any>();
      for (let i = 0; i < ids.length; i += 10) {
        await Promise.all(ids.slice(i, i + 10).map(async (personId) => {
          const r = await api('textMessages', { personId, limit: 100, sort: '-created' });
          for (const m of (r?.textmessages ?? r?.textMessages ?? []) as any[]) {
            const d = tor(m.created);
            if (d < ws || d > we) continue;
            byId.set(String(m.id), m);
          }
        }));
      }
      const all = [...byId.values()];
      const outbound = all.filter((m) => !m.isIncoming);
      const perUser: Record<string, number> = {};
      const perUserStatus: Record<string, number> = {};
      for (const m of outbound) {
        perUser[m.userId] = (perUser[m.userId] ?? 0) + 1;
        perUserStatus[`${m.userId}:${m.status ?? 'none'}`] = (perUserStatus[`${m.userId}:${m.status ?? 'none'}`] ?? 0) + 1;
      }
      return json({
        people: ids.length, total: all.length, outbound: outbound.length, perUser, perUserStatus,
        keys: Object.keys(all[0] ?? {}),
        sample: outbound.slice(0, 12).map((m) => ({
          id: m.id, userId: m.userId, status: m.status, created: m.created,
          personId: m.personId, sharedInboxId: m.sharedInboxId ?? null, threadId: m.threadId ?? null,
          participants: Array.isArray(m.participants) ? m.participants.length : null,
        })),
      });
    }


    const matchStage = (name: string | null | undefined) =>
      stages.find((s) => s.name.toLowerCase() === (name ?? '').trim().toLowerCase())?.name ?? null;

    // ---- clean-up: move open house guests to a correct stage ---------------
    // Only guests we sent (source is the open house) and only if Follow Up Boss
    // still has them in an entry stage — anyone being worked is left alone.
    if (action === 'restage') {
      if (!caller.isAdmin) return json({ error: 'FORBIDDEN' }, 403);
      const target = matchStage(body.stage ?? 'Lead');
      if (!target) return json({ error: 'That stage does not exist in Follow Up Boss.' }, 400);

      let q = db
        .from('open_house_visitors')
        .select('id, first_name, last_name, fub_contact_id, open_house_id')
        .not('fub_contact_id', 'is', null);
      if (body.visitorIds?.length) q = q.in('id', body.visitorIds);
      const { data: rows, error: rowsErr } = await q;
      if (rowsErr) return json({ error: 'Could not load the guest list' }, 500);

      const moved: string[] = [];
      const skipped: { name: string; reason: string }[] = [];
      for (const r of (rows ?? []) as any[]) {
        const { data: oh } = await db
          .from('open_houses')
          .select('org_id')
          .eq('id', r.open_house_id)
          .maybeSingle();
        if (!oh || ((oh as any).org_id && (oh as any).org_id !== callerOrgId)) continue;
        const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
        const out = await applyStage(key, String(r.fub_contact_id), target, stages);
        if (!out.ok) {
          skipped.push({ name, reason: out.error ?? 'Unknown error' });
          continue;
        }
        if ((out.stageResult ?? '').includes('already being worked')) {
          skipped.push({ name, reason: out.stageResult! });
          continue;
        }
        await db
          .from('open_house_visitors')
          .update({ fub_stage: target, fub_stage_result: out.stageResult ?? null })
          .eq('id', r.id);
        moved.push(name);
      }
      return json({ moved, skipped, stage: target });
    }

    // ---- refresh a note on someone already in Follow Up Boss ---------------
    if (action === 'update_note') {
      if (!body.visitorId) return json({ error: 'visitorId is required' }, 400);
      const { data, error } = await db
        .from('open_house_visitors')
        .select(`${VISITOR_COLUMNS}, open_house_id`)
        .eq('id', body.visitorId)
        .maybeSingle();
      if (error || !data) return json({ error: 'Guest not found' }, 404);
      const v = data as unknown as Visitor;
      if (!v.fub_contact_id) {
        return json({ error: 'This guest has not been sent to Follow Up Boss yet.' }, 400);
      }
      const { data: oh } = await db
        .from('open_houses')
        .select('property_address, org_id')
        .eq('id', (data as any).open_house_id)
        .maybeSingle();
      if (!oh) return json({ error: 'Open house not found' }, 404);
      if (caller.userId && (oh as any).org_id && (oh as any).org_id !== callerOrgId) {
        return json({ error: 'FORBIDDEN' }, 403);
      }
      const out = await postNote(key, v.fub_contact_id, v, (oh as any).property_address || 'Open House', true);
      if (!out.ok) {
        await db.from('open_house_visitors').update({ fub_sync_error: out.error ?? 'Unknown error' }).eq('id', v.id);
        return json({ error: out.error }, 400);
      }
      await db
        .from('open_house_visitors')
        .update({
          fub_note_updated_at: new Date().toISOString(),
          fub_sync_error: null,
          fub_note_due_at: null,
        })
        .eq('id', v.id);
      return json({ ok: true });
    }

    const batchStage = matchStage(body.stage);
    if (!batchStage && action === 'push') {
      return json({ error: 'Pick a stage before sending this guest to Follow Up Boss.' }, 400);
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
    if (caller.userId && house.org_id && house.org_id !== callerOrgId) {
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
      // A stage chosen on the guest's own row always wins over the batch choice.
      const stage = matchStage((v as any).fub_stage) ?? batchStage;
      if (!stage) {
        const error = 'No stage picked for this guest.';
        await db.from('open_house_visitors').update({ fub_sync_error: error }).eq('id', v.id);
        results.push({ id: v.id, ok: false, error });
        continue;
      }
      const out = await sendOne(key, v, {
        property_address: (house as any).property_address,
        hosting_email: hostingEmail,
      }, stage, stages);
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
