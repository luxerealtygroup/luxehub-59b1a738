// TEMPORARY one-off audit endpoint: lists Follow Up Boss deals so attribution
// can be reconciled by address. Protected by a shared secret; deleted after use.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { FUB_BASE_URL, getFubApiKeyForOrg } from '../_shared/fub.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const { data: sec } = await db
    .from('internal_job_secrets')
    .select('value')
    .eq('key', 'DEAL_AUDIT_SECRET')
    .maybeSingle();
  const expected = (sec as { value: string } | null)?.value?.trim();
  if (!expected || body.secret !== expected) return json({ error: 'forbidden' }, 403);

  const { data: org } = await db.from('organizations').select('id').limit(1).maybeSingle();
  const key = await getFubApiKeyForOrg((org as { id: string } | null)?.id ?? null);
  if (!key) return json({ error: 'no key' }, 400);
  const auth = `Basic ${btoa(`${key}:`)}`;

  const deals: any[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const res = await fetch(`${FUB_BASE_URL}/deals?limit=100&offset=${offset}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    if (!res.ok) return json({ error: await res.text() }, 502);
    const page = await res.json();
    const rows = page.deals ?? [];
    deals.push(...rows);
    if (rows.length < 100) break;
  }

  return json({
    count: deals.length,
    deals: deals.map((d) => ({
      id: d.id,
      name: d.name,
      stage: d.stageName,
      status: d.status,
      price: d.price,
      gci: d.commissionValue,
      closed: d.closedDate ?? d.projectedCloseDate ?? null,
      users: (d.users ?? []).map((u: any) => `${u.id}:${u.name}`),
    })),
  });
});
