// One-off maintenance endpoint: points the demo agent login at the demo address
// and makes the sample client login. No password is ever set here — both
// accounts are claimed through the normal "forgot password" flow.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const DEMO_AGENT_ID = '21f27748-3d1c-4fd2-9d0b-edf75f031841';
const AGENT_EMAIL = 'demo@luxerealtyhub.com';
const CLIENT_EMAIL = 'demo.client@luxerealtyhub.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const { data: secretRow } = await admin
    .from('internal_job_secrets')
    .select('value')
    .eq('key', 'DEMO_SETUP_SECRET')
    .maybeSingle();
  const expected = (secretRow as { value: string } | null)?.value?.trim() ?? '';
  const supplied = req.headers.get('x-demo-secret')?.trim() ?? '';
  if (!expected || supplied !== expected) return json({ error: 'Forbidden' }, 403);

  const out: Record<string, unknown> = {};

  const { error: updErr } = await admin.auth.admin.updateUserById(DEMO_AGENT_ID, {
    email: AGENT_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: 'Demo Agent (Sample)' },
  });
  if (updErr) return json({ step: 'agent', error: updErr.message }, 500);
  out.agent = { id: DEMO_AGENT_ID, email: AGENT_EMAIL };

  // Sample client: reuse the login if it is already there.
  let clientId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === CLIENT_EMAIL);
  if (existing) {
    clientId = existing.id;
  } else {
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: CLIENT_EMAIL,
      email_confirm: true,
      user_metadata: { full_name: 'Jordan Sample' },
    });
    if (createErr) return json({ step: 'client', error: createErr.message }, 500);
    clientId = created.user?.id ?? null;
  }
  out.client = { id: clientId, email: CLIENT_EMAIL };

  return json({ ok: true, ...out });
});
