import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { canDisableTeamAccount } from './policy.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !key || !anon) return json({ error: 'Service unavailable' }, 503);
  if (!authorization) return json({ error: 'Unauthorized' }, 401);
  try {
    const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await auth.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);
    const { user_id: targetId } = await req.json();
    if (typeof targetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: 'Invalid account' }, 400);
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const [caller, target, callerRoles, targetRoles] = await Promise.all([
      admin.from('profiles').select('org_id').eq('id', user.id).maybeSingle(),
      admin.from('profiles').select('org_id').eq('id', targetId).maybeSingle(),
      admin.from('user_roles').select('role').eq('user_id', user.id),
      admin.from('user_roles').select('role').eq('user_id', targetId),
    ]);
    if ([caller, target, callerRoles, targetRoles].some(result => result.error)) return json({ error: 'Account check failed' }, 500);
    if (!canDisableTeamAccount(user.id, caller.data?.org_id ?? null, targetId, target.data?.org_id ?? null,
      (callerRoles.data ?? []).map(row => row.role), (targetRoles.data ?? []).map(row => row.role))) {
      return json({ error: 'Forbidden' }, 403);
    }
    // Never return, persist, or log the replacement password. Banning prevents recovery from restoring access.
    const bytes = crypto.getRandomValues(new Uint8Array(48));
    const password = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') + 'Aa1!';
    const { data, error } = await admin.auth.admin.updateUserById(targetId, { password, ban_duration: '876000h' });
    if (error || !data.user?.banned_until) return json({ error: 'Could not disable login' }, 500);
    const { error: profileError } = await admin.from('profiles').update({
      access_expires_at: new Date().toISOString(),
    }).eq('id', targetId);
    return json({ disabled: true, access_expiry_updated: !profileError, banned_until: data.user.banned_until });
  } catch {
    return json({ error: 'Could not disable account' }, 500);
  }
});