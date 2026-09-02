// Super-admin read-only tenant preview.
//
// This is the ONLY server path that reads another organization's data, and it
// can never write it: every branch below issues SELECTs. Access requires the
// caller's JWT to resolve to a super-admin of the original org (checked with the
// database's own public.is_super_admin), so an org owner is rejected even if
// they forge an org_id. No tenant RLS policy is widened anywhere.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { resolveCaller, sharedCorsHeaders } from '../_shared/auth.ts';

const cors = { ...sharedCorsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

const DATASETS = new Set([
  'branding',
  'dashboard_summary',
  'pipeline',
  'transactions',
  'weekly_411',
  'portal_shell',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const caller = await resolveCaller(req);
  if (!caller || !caller.userId) return json({ error: 'UNAUTHORIZED' }, 401);

  const db = admin();

  // Authoritative gate: the database decides, not the request body.
  const { data: isSuper } = await db.rpc('is_super_admin', { _user_id: caller.userId });
  if (isSuper !== true) return json({ error: 'FORBIDDEN_SUPER_ADMIN_ONLY' }, 403);

  let body: { action?: string; org_id?: string; dataset?: string; session_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_BODY' }, 400);
  }

  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const action = body.action ?? '';

  if (action === 'stop') {
    if (!body.session_id || !uuid.test(body.session_id)) return json({ error: 'INVALID_SESSION' }, 400);
    await db
      .from('org_preview_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', body.session_id)
      .eq('actor_id', caller.userId)
      .is('ended_at', null);
    return json({ ok: true });
  }

  const orgId = body.org_id ?? '';
  if (!uuid.test(orgId)) return json({ error: 'INVALID_ORG_ID' }, 400);

  const { data: org } = await db
    .from('organizations')
    .select(
      'id, slug, name, app_name, short_name, brokerage_name, branding_primary_color, branding_text_color, branding_logo_url, branding_mark_url, seat_limit, tier, is_original_org',
    )
    .eq('id', orgId)
    .maybeSingle();
  if (!org) return json({ error: 'ORG_NOT_FOUND' }, 404);

  const { data: integrations } = await db
    .from('org_integrations')
    .select('key')
    .eq('org_id', orgId);
  const fubEnabled =
    Boolean(org.is_original_org) ||
    (integrations ?? []).some((i: { key: string }) => i.key === 'FUB_API_KEY');

  const brandingPayload = async () => {
    const sign = async (path: string | null) => {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      const { data } = await db.storage.from('org-branding').createSignedUrl(path, 60 * 60 * 6);
      return data?.signedUrl ?? null;
    };
    return {
      orgId: org.id,
      slug: org.slug,
      name: org.name,
      appName: org.app_name ?? org.name,
      shortName: org.short_name ?? (org.name ?? '').split(' ')[0],
      brokerageName: org.brokerage_name ?? org.name,
      primaryColor: org.branding_primary_color,
      textColor: org.branding_text_color ?? org.branding_primary_color,
      logoUrl: await sign(org.branding_logo_url),
      markUrl: await sign(org.branding_mark_url),
      seatLimit: org.seat_limit,
      tier: org.tier,
      fubEnabled,
    };
  };

  if (action === 'start') {
    const { data: session, error } = await db
      .from('org_preview_sessions')
      .insert({ actor_id: caller.userId, org_id: orgId })
      .select('id, started_at, expires_at')
      .single();
    if (error) return json({ error: 'COULD_NOT_START' }, 500);
    return json({ session, branding: await brandingPayload() });
  }

  if (action !== 'read') return json({ error: 'INVALID_ACTION' }, 400);

  const dataset = body.dataset ?? '';
  if (!DATASETS.has(dataset)) return json({ error: 'INVALID_DATASET' }, 400);

  if (dataset === 'branding') return json({ branding: await brandingPayload() });

  if (dataset === 'dashboard_summary') {
    const [members, portals, clients, listings] = await Promise.all([
      db.from('profiles').select('id, full_name', { count: 'exact' }).eq('org_id', orgId),
      db.from('client_accounts').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      db.from('pipeline_clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      db.from('manual_production').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
    ]);
    return json({
      fubEnabled,
      memberCount: members.count ?? 0,
      members: (members.data ?? []).map((m: { id: string; full_name: string | null }) => ({
        id: m.id,
        name: m.full_name,
      })),
      portalCount: portals.count ?? 0,
      pipelineCount: clients.count ?? 0,
      manualProductionCount: listings.count ?? 0,
    });
  }

  if (dataset === 'pipeline') {
    const { data } = await db
      .from('pipeline_clients')
      .select('id, client_name, status, estimated_value, target_date')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50);
    return json({ rows: data ?? [], fubEnabled });
  }

  if (dataset === 'transactions') {
    const [commissions, manual] = await Promise.all([
      db
        .from('commissions')
        .select('id, property_address, sale_price, gross_commission, status, closing_date')
        .eq('org_id', orgId)
        .order('closing_date', { ascending: false })
        .limit(50),
      db
        .from('manual_production')
        .select('id, property_address, sale_price, status, closing_date')
        .eq('org_id', orgId)
        .order('closing_date', { ascending: false })
        .limit(50),
    ]);
    return json({ commissions: commissions.data ?? [], manual: manual.data ?? [], fubEnabled });
  }

  if (dataset === 'weekly_411') {
    const { data } = await db
      .from('weekly_411')
      .select('id, week_start_date, user_id')
      .eq('org_id', orgId)
      .order('week_start_date', { ascending: false })
      .limit(20);
    return json({ rows: data ?? [] });
  }

  // portal_shell
  const { data: portals } = await db
    .from('client_accounts')
    .select('id, full_name, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(20);
  return json({ portals: portals ?? [] });
});
