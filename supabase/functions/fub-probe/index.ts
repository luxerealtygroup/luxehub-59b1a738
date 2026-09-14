// Temporary diagnostic: raw Follow Up Boss reads for admins/service callers.
import { sharedCorsHeaders as corsHeaders, resolveCaller } from '../_shared/auth.ts';
import { FUB_BASE_URL, getFubApiKeyForOrg } from '../_shared/fub.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function tor(d: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(d));
}

async function get(key: string, path: string, params: Record<string, string | number> = {}) {
  const url = new URL(`${FUB_BASE_URL}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: 'Basic ' + btoa(`${key}:`),
        'Content-Type': 'application/json',
        'X-System': 'Real Estate Hub',
        'X-System-Key': 'lovable-hub',
      },
    });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      continue;
    }
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body };
  }
  return { status: 429, body: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const caller = await resolveCaller(req);
  if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);
  if (caller.kind !== 'service' && !caller.isAdmin) return json({ error: 'FORBIDDEN' }, 403);

  const b = await req.json().catch(() => ({})) as {
    org_id?: string; op?: string; path?: string; params?: Record<string, string>;
    week_start?: string; week_end?: string;
  };
  if (!b.org_id) return json({ error: 'org_id required' }, 400);
  const key = await getFubApiKeyForOrg(b.org_id);
  if (!key) return json({ error: 'no key' }, 400);

  if (b.op === 'calls_week') {
    const ws = b.week_start!, we = b.week_end!;
    const per = new Map<string, any>();
    const outcomes: Record<string, number> = {};
    let offset = 0, stop = false, pages = 0;
    while (!stop && pages < 40) {
      const r = await get(key, 'calls', { limit: 100, offset, sort: '-created' });
      const rows: any[] = r.body?.calls ?? [];
      if (!rows.length) break;
      for (const c of rows) {
        const d = tor(c.created);
        if (d < ws) { stop = true; continue; }
        if (d > we) continue;
        const k = `${c.userId}:${c.userName}`;
        if (!per.has(k)) per.set(k, { total: 0, dur_gt0: 0, dur_sum: 0, outcome_nonnull: 0, incoming: 0, note_gt0: 0 });
        const t = per.get(k);
        t.total++;
        const dur = Number(c.duration ?? 0);
        if (dur > 0) { t.dur_gt0++; t.dur_sum += dur; }
        if (c.outcome) { t.outcome_nonnull++; outcomes[String(c.outcome)] = (outcomes[String(c.outcome)] ?? 0) + 1; }
        else outcomes['(null)'] = (outcomes['(null)'] ?? 0) + 1;
        if (c.isIncoming) t.incoming++;
      }
      pages++; offset += 100;
    }
    return json({ per: Object.fromEntries(per), outcomes, pages });
  }

  if (b.op === 'calls_hist') {
    const ws = b.week_start!, we = b.week_end!;
    const per = new Map<number, any>();
    let offset = 0, stop = false, pages = 0;
    while (!stop && pages < 40) {
      const r = await get(key, 'calls', { limit: 100, offset, sort: '-created' });
      const rows: any[] = r.body?.calls ?? [];
      if (!rows.length) break;
      for (const c of rows) {
        const d = tor(c.created);
        if (d < ws) { stop = true; continue; }
        if (d > we) continue;
        const u = Number(c.userId);
        if (!per.has(u)) per.set(u, { durations: [], systems: {}, sum: 0 });
        const t = per.get(u);
        const dur = Number(c.duration ?? 0);
        if (dur > 0) { t.durations.push(dur); t.sum += dur; }
        const sk = `${c.systemId}:${dur > 0 ? 'talk' : 'zero'}`;
        t.systems[sk] = (t.systems[sk] ?? 0) + 1;
      }
      pages++; offset += 100;
    }
    const out: any = {};
    for (const [u, t] of per) {
      t.durations.sort((a: number, b2: number) => b2 - a);
      out[u] = {
        sum: t.sum,
        durations: t.durations,
        systems: t.systems,
        ge30: t.durations.filter((d: number) => d >= 30).length,
        ge60: t.durations.filter((d: number) => d >= 60).length,
        ge90: t.durations.filter((d: number) => d >= 90).length,
        ge120: t.durations.filter((d: number) => d >= 120).length,
      };
    }
    return json(out);
  }

  if (b.op === 'calls_dump') {
    const ws = b.week_start!, we = b.week_end!;
    const out: any[] = [];
    let offset = 0, stop = false, pages = 0;
    while (!stop && pages < 40) {
      const r = await get(key, 'calls', { limit: 100, offset, sort: '-created' });
      const rows: any[] = r.body?.calls ?? [];
      if (!rows.length) break;
      for (const c of rows) {
        const d = tor(c.created);
        if (d < ws) { stop = true; continue; }
        if (d > we) continue;
        out.push([c.userId, c.duration, c.ringDuration, c.outcome, c.isIncoming ? 1 : 0, c.systemId, c.personId, String(c.note ?? '').slice(0, 30)]);
      }
      pages++; offset += 100;
    }
    return json({ rows: out });
  }

  if (b.op === 'active_count') {
    const ws = b.week_start!;
    let offset = 0, n = 0, older = false;
    while (!older && offset < 5000) {
      const r = await get(key, 'people', { limit: 100, offset, sort: '-lastActivity', includeUnclaimed: true });
      const rows: any[] = r.body?.people ?? [];
      if (!rows.length) break;
      for (const p of rows) {
        const act = p.lastActivity ?? p.updated;
        if (!act || tor(act) < ws) { older = true; continue; }
        n++;
      }
      offset += 100;
    }
    return json({ active_since: ws, people: n, scanned_to: offset });
  }

  if (b.op === 'texts_scan') {
    const ws = b.week_start!, we = b.week_end!;
    const cap = Number((b.params as any)?.cap ?? 200);
    // people touched during / after the window
    const ids: number[] = [];
    let offset = 0;
    while (ids.length < cap) {
      const r = await get(key, 'people', { limit: 100, offset, sort: '-lastActivity', includeUnclaimed: true });
      const rows: any[] = r.body?.people ?? [];
      if (!rows.length) break;
      let older = false;
      for (const p of rows) {
        const act = p.lastActivity ?? p.updated;
        if (!act || tor(act) < ws) { older = true; continue; }
        ids.push(p.id);
      }
      if (older) break;
      offset += 100;
    }
    const per: Record<string, any> = {};
    let found = 0;
    const chunk = 8;
    for (let i = 0; i < ids.length; i += chunk) {
      await Promise.all(ids.slice(i, i + chunk).map(async (pid) => {
        const r = await get(key, 'textMessages', { personId: pid, limit: 100, sort: '-created' });
        const rows: any[] = r.body?.textmessages ?? r.body?.textMessages ?? [];
        for (const m of rows) {
          const d = tor(m.created);
          if (d < ws || d > we) continue;
          found++;
          const k = `${m.userId}`;
          per[k] = per[k] ?? { sent: 0, received: 0 };
          if (m.isIncoming) per[k].received++; else per[k].sent++;
        }
      }));
    }
    return json({ scanned: ids.length, found, per });
  }

  if (b.op === 'texts_week') {
    const attempts: any[] = [];
    for (const params of [
      { limit: 5 },
      { limit: 5, sort: '-created' },
      { limit: 5, offset: 0, sort: '-created', includeUnclaimed: 'true' },
    ] as any[]) {
      const r = await get(key, 'textMessages', params);
      attempts.push({ params, status: r.status, sample: JSON.stringify(r.body).slice(0, 1500) });
    }
    return json({ attempts });
  }

  const r = await get(key, b.path ?? 'identity', b.params ?? {});
  return json({ status: r.status, body: JSON.stringify(r.body).slice(0, 20000) });
});
