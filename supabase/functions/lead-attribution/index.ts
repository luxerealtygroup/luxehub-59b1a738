// Recomputes the shared 2026 lead-source attribution (read-only on Follow Up Boss) and saves it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireStaff, sharedCorsHeaders as cors } from '../_shared/auth.ts';
import { fubHeadersForUser, FUB_BASE_URL } from '../_shared/fub.ts';
import { getAttribution } from '../_shared/leadAttributionCache.ts';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const guard = await requireStaff(req, { cors, adminOnly: true });
  if (!guard.ok) return guard.response;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: me } = await db.from('profiles').select('org_id').eq('id', guard.caller.userId).maybeSingle();
  if (!me?.org_id) return json({ error: 'Forbidden' }, 403);
  const work = (async () => {
    const h = await fubHeadersForUser(guard.caller.userId);
    const deals: any[] = [];
    for (let off = 0; off < 5000; off += 100) {
      const r = await fetch(`${FUB_BASE_URL}/deals?limit=100&offset=${off}`, { headers: h });
      if (!r.ok) throw new Error(`FUB ${r.status}`);
      const j = await r.json(); deals.push(...(j.deals ?? [])); if ((j.deals ?? []).length < 100) break;
    }
    const { data: md } = await db.from('deal_metadata').select('fub_deal_id, deal_category, personal_transaction, double_end').eq('org_id', me.org_id);
    await getAttribution(db, me.org_id, h, deals, md ?? [], true);
  })().catch(e => console.error('attribution failed', (e as Error).message));
  // @ts-ignore platform global
  EdgeRuntime.waitUntil(work);
  return json({ started: true }, 202);
});
