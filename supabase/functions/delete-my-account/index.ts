// Self-service account deletion (App Store guideline 5.1.1(v)).
//
// The caller's identity AND role are re-derived from the JWT here. Nothing in
// the request body decides what gets deleted. Data work always runs first; the
// auth user is removed last so a failure never strands someone who cannot sign in.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });

type Mode = 'client' | 'agent' | 'owner';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'UNAUTHORIZED' }, 401);
    const token = authHeader.slice(7).trim();
    if (!token || token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      return json({ error: 'UNAUTHORIZED' }, 401);
    }

    const db = admin();
    const { data: userData, error: userErr } = await db.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ error: 'UNAUTHORIZED' }, 401);

    let body: { confirmation?: unknown; dryRun?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation.trim() : '';
    const dryRun = body.dryRun === true;

    // ---- derive role from the database, never from the request -------------
    const [{ data: roleRows }, { data: profile }, { data: portals }] = await Promise.all([
      db.from('user_roles').select('role').eq('user_id', user.id),
      db.from('profiles').select('id, full_name, email, org_id').eq('id', user.id).maybeSingle(),
      db.from('client_accounts').select('id, org_id, full_name').eq('user_id', user.id),
    ]);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);

    let mode: Mode;
    if (roles.includes('owner')) mode = 'owner';
    else if (profile) mode = 'agent';
    else if ((portals ?? []).length > 0) mode = 'client';
    else mode = 'client';

    const orgId = profile?.org_id ?? portals?.[0]?.org_id ?? null;
    let orgName: string | null = null;
    if (orgId) {
      const { data: org } = await db.from('organizations').select('name').eq('id', orgId).maybeSingle();
      orgName = org?.name ?? null;
    }

    // Who would receive an agent's records.
    let ownerId: string | null = null;
    let ownerName: string | null = null;
    if (mode === 'agent' && orgId) {
      const { data: owners } = await db
        .from('user_roles')
        .select('user_id, profiles!inner(id, full_name, org_id)')
        .eq('role', 'owner');
      const match = (owners ?? []).find((o: any) => o.profiles?.org_id === orgId);
      ownerId = match?.user_id ?? null;
      ownerName = match?.profiles?.full_name ?? null;
    }

    if (dryRun) {
      return json({ mode, orgName, ownerName, portalCount: (portals ?? []).length });
    }

    // ---- confirmation is re-validated server-side --------------------------
    const expected = mode === 'owner' ? (orgName ?? '').trim() : 'DELETE';
    if (!expected || confirmation.toLowerCase() !== expected.toLowerCase()) {
      return json({ error: 'CONFIRMATION_MISMATCH' }, 400);
    }

    if (mode === 'agent' && !ownerId) {
      return json({ error: 'NO_OWNER_TO_RECEIVE_RECORDS' }, 409);
    }

    // ---- audit row first, so the record survives the deletion --------------
    const { error: logErr } = await db.from('account_deletion_log').insert({
      actor_user_id: user.id,
      actor_email: user.email ?? profile?.email ?? null,
      actor_full_name: profile?.full_name ?? portals?.[0]?.full_name ?? null,
      actor_role: mode,
      org_id: orgId,
      org_name: orgName,
      action:
        mode === 'client' ? 'client_login_deleted' : mode === 'agent' ? 'agent_deleted_records_reassigned' : 'hub_deleted',
      details: { roles, reassigned_to: ownerId, reassigned_to_name: ownerName, portals: (portals ?? []).length },
    });
    if (logErr) return json({ error: 'AUDIT_WRITE_FAILED', detail: logErr.message }, 500);

    let summary: Record<string, unknown> = {};

    if (mode === 'client') {
      const { data, error } = await db.rpc('admin_detach_client_login', { _user_id: user.id });
      if (error) return json({ error: 'DELETE_FAILED', detail: error.message }, 500);
      summary = { portals_detached: data };
      const { error: delErr } = await db.auth.admin.deleteUser(user.id);
      if (delErr) return json({ error: 'DELETE_FAILED', detail: delErr.message }, 500);
    }

    if (mode === 'agent') {
      const { data, error } = await db.rpc('admin_reassign_agent_records', { _from: user.id, _to: ownerId });
      if (error) return json({ error: 'DELETE_FAILED', detail: error.message }, 500);
      summary = { reassigned: data, reassigned_to: ownerName };
      const { error: delErr } = await db.auth.admin.deleteUser(user.id);
      if (delErr) return json({ error: 'DELETE_FAILED', detail: delErr.message }, 500);
    }

    if (mode === 'owner') {
      if (!orgId) return json({ error: 'NO_HUB_FOUND' }, 409);

      // Everyone who belongs to this hub, so their logins go with it.
      const { data: orgProfiles } = await db.from('profiles').select('id').eq('org_id', orgId);
      const { data: orgClients } = await db.from('client_accounts').select('user_id').eq('org_id', orgId);
      const ids = new Set<string>();
      (orgProfiles ?? []).forEach((p: { id: string }) => p.id && ids.add(p.id));
      (orgClients ?? []).forEach((c: { user_id: string | null }) => c.user_id && ids.add(c.user_id));
      ids.delete(user.id);

      const { data, error } = await db.rpc('admin_purge_org', { _org_id: orgId });
      if (error) return json({ error: 'DELETE_FAILED', detail: error.message }, 500);

      const failed: string[] = [];
      for (const id of ids) {
        const { error: e } = await db.auth.admin.deleteUser(id);
        if (e) failed.push(id);
      }
      summary = { purged: data, accounts_removed: ids.size, accounts_failed: failed.length };

      const { error: delErr } = await db.auth.admin.deleteUser(user.id);
      if (delErr) return json({ error: 'DELETE_FAILED', detail: delErr.message }, 500);
    }

    await db
      .from('account_deletion_log')
      .update({ details: { result: summary } })
      .eq('actor_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    return json({ ok: true, mode, summary });
  } catch (err) {
    return json({ error: 'DELETE_FAILED', detail: err instanceof Error ? err.message : 'unknown' }, 500);
  }
});
