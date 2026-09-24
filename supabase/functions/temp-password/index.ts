// Temporary client passwords.
//   action=issue    (admin/owner JWT)  body { email }        → { temp_password, expires_at } returned once, never logged/stored
//   action=complete (the client's JWT) body { new_password } → sets their own password, clears the flag, claims the portal
//   action=expire   (service-role bearer, hourly cron)       → scrambles unused expired temporary passwords
// NOTE: never log request bodies or passwords in this file.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const TTL_HOURS = 72;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function randomPassword(len = 20) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  const out: string[] = [];
  const buf = new Uint32Array(len * 2);
  while (out.length < len) {
    crypto.getRandomValues(buf);
    for (const n of buf) {
      if (n < Math.floor(0x100000000 / alphabet.length) * alphabet.length) out.push(alphabet[n % alphabet.length]);
      if (out.length === len) break;
    }
  }
  // guarantee each class
  const s = out.join('');
  if (!/[A-Z]/.test(s) || !/[a-z]/.test(s) || !/[0-9]/.test(s) || !/[!@#$%&*?]/.test(s)) return randomPassword(len);
  return s;
}

async function caller(req: Request) {
  const auth = req.headers.get('Authorization');
  if (!auth) return null;
  const c = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data } = await c.auth.getUser();
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const action = new URL(req.url).searchParams.get('action');
  try {
    if (action === 'expire') {
      if (req.headers.get('Authorization') !== `Bearer ${SERVICE}`) return json({ error: 'Unauthorized' }, 401);
      const { data: rows } = await admin.from('temp_password_grants').select('id,user_id')
        .is('used_at', null).is('expired_at', null).lt('expires_at', new Date().toISOString());
      for (const g of rows ?? []) {
        await admin.auth.admin.updateUserById(g.user_id, { password: randomPassword(40) });
        await admin.from('temp_password_grants').update({ expired_at: new Date().toISOString() }).eq('id', g.id);
      }
      return json({ expired: rows?.length ?? 0 });
    }

    const user = await caller(req);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => ({}));

    if (action === 'issue') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!email || email.length > 255) return json({ error: 'email required' }, 400);
      const { data: isAdmin } = await admin.rpc('is_admin_or_owner', { _user_id: user.id });
      if (!isAdmin) return json({ error: 'Forbidden' }, 403);
      const { data: me } = await admin.from('profiles').select('org_id').eq('id', user.id).single();

      // Target must be an existing client-classified account with an open portal invite in the caller's org.
      const { data: portal } = await admin.from('client_accounts').select('id,org_id,email')
        .ilike('email', email).is('user_id', null).not('invite_token', 'is', null)
        .gt('invite_expires_at', new Date().toISOString()).eq('org_id', me?.org_id ?? '').maybeSingle();
      if (!portal) return json({ error: 'No open portal invitation for that email in your brokerage' }, 404);

      let target: { id: string; app_metadata: Record<string, unknown> } | null = null;
      for (let page = 1; page <= 20 && !target; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        target = (data?.users ?? []).find((u) => u.email?.toLowerCase() === email) as any ?? null;
        if (!data || data.users.length < 200) break;
      }
      if (!target) return json({ error: 'No account exists for that email' }, 404);
      const { data: prof } = await admin.from('profiles').select('member_type').eq('id', target.id).single();
      const { count: roleCount } = await admin.from('user_roles').select('id', { count: 'exact', head: true }).eq('user_id', target.id);
      if (prof?.member_type !== 'client' || (roleCount ?? 0) > 0) return json({ error: 'Account is not a client-only account' }, 409);

      const pw = randomPassword(20);
      const expires = new Date(Date.now() + TTL_HOURS * 3600_000).toISOString();
      await admin.from('temp_password_grants').update({ expired_at: new Date().toISOString() })
        .eq('user_id', target.id).is('used_at', null).is('expired_at', null);
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        password: pw,
        app_metadata: { ...target.app_metadata, must_change_password: true, temp_password_expires_at: expires },
      });
      if (error) return json({ error: 'Could not set temporary password' }, 500);
      await admin.from('temp_password_grants').insert({
        user_id: target.id, org_id: portal.org_id, portal_id: portal.id, issued_by: user.id, expires_at: expires,
      });
      return json({ temp_password: pw, expires_at: expires });
    }

    if (action === 'complete') {
      const pw = typeof body.new_password === 'string' ? body.new_password : '';
      if (pw.length < 8 || pw.length > 128) return json({ error: 'Password must be 8–128 characters' }, 400);
      const { data: grant } = await admin.from('temp_password_grants').select('id,expires_at')
        .eq('user_id', user.id).is('used_at', null).is('expired_at', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!grant) return json({ error: 'No temporary password to replace' }, 409);
      if (new Date(grant.expires_at) < new Date()) return json({ error: 'Your temporary password has expired' }, 410);

      const meta = { ...(user.app_metadata ?? {}) } as Record<string, unknown>;
      delete meta.must_change_password; delete meta.temp_password_expires_at;
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: pw, app_metadata: meta });
      if (error) return json({ error: error.message.includes('weak') ? 'Please choose a stronger password' : 'Could not update password' }, 400);
      await admin.from('temp_password_grants').update({ used_at: new Date().toISOString() }).eq('id', grant.id);

      const { data: portalId, error: claimErr } = await admin.rpc('claim_portal_for_user', { _user_id: user.id });
      if (claimErr) return json({ password_changed: true, claimed: false });
      return json({ password_changed: true, claimed: true, portal_id: portalId });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch {
    return json({ error: 'Server error' }, 500);
  }
});
