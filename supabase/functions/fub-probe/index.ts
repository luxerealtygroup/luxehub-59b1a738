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
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: 'Basic ' + btoa(`${key}:`),
      'Content-Type': 'application/json',
      'X-System': 'Real Estate Hub',
      'X-System-Key': 'lovable-hub',
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const caller = await resolveCaller(req);
  if (!caller) return json({ error: 'UNAUTHORIZED' }, 401);
  if (caller.kind !== 'service' && !caller.isAdmin) return json({ error: 'FORBIDDEN' }, 403);

  const b = await req.json().catch(() => ({})) as {
    org_id?: string; op?: string; week_start?: string; week_end?: string; user_id?: number;
    path?: string; params?: Record<string, string>;
  };
  if (!b.org_id) return json({ error: 'org_id required' }, 400);
  const key = await getFubApiKeyForOrg(b.org_id);
  if (!key) return json({ error: 'no key' }, 400);

  if (b.op === 'texts_dump') {
    const ws = b.week_start!, we = b.week_end!;
    const ids: number[] = [];
    let offset = 0, older = false;
    while (!older && ids.length < 800) {
      const r = await get(key, 'people', { limit: 100, offset, sort: '-lastActivity', includeUnclaimed: 'true' });
      const rows: any[] = r.body?.people ?? [];
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
        const r = await get(key, 'textMessages', { personId, limit: 100, sort: '-created' });
        for (const m of (r.body?.textmessages ?? r.body?.textMessages ?? []) as any[]) {
          const d = tor(m.created);
          if (d < ws || d > we) continue;
          if (b.user_id && Number(m.userId) !== b.user_id) continue;
          byId.set(String(m.id), {
            id: m.id, userId: m.userId, isIncoming: m.isIncoming, created: m.created,
            status: m.status, personId: m.personId, participants: m.participants?.length ?? null,
            sharedInboxId: m.sharedInboxId ?? null, threadId: m.threadId ?? null,
            keys: Object.keys(m),
          });
        }
      }));
    }
    const all = [...byId.values()];
    const outbound = all.filter((m) => !m.isIncoming);
    const perUser: Record<string, number> = {};
    for (const m of outbound) perUser[m.userId] = (perUser[m.userId] ?? 0) + 1;
    return json({ people: ids.length, total: all.length, outbound: outbound.length, perUser, sample: outbound.slice(0, 40) });
  }

  const r = await get(key, b.path ?? 'identity', b.params ?? {});
  return json({ status: r.status, body: JSON.stringify(r.body).slice(0, 20000) });
});
