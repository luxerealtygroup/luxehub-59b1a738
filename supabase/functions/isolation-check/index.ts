// Tenant isolation check.
//
// Runs server-side with the service role, signs in as a FIXTURE account that
// belongs to a throwaway org but whose display name and email deliberately
// COLLIDE with real Luxe records, then runs read queries with that account's
// own JWT (so RLS applies exactly as it would in the browser).
//
// Returns per-table row counts. Any non-zero count is a tenant isolation leak.
// A positive control re-runs the same queries with the service role (RLS
// bypassed) to prove the queries are not vacuous.
//
// Guarded by the ISOLATION_TEST_TOKEN secret; never returns record contents.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const FIXTURE_USER_ID = 'a43390e7-dbaa-48a9-b5cc-aac223cb46d7';

const TABLES = [
  'pipeline_clients',
  'client_transactions',
  'commissions',
  'deals',
  'deal_participants',
  'client_documents',
  'portal_documents',
  'portal_photos',
  'portal_messages',
  'client_accounts',
  'weekly_411',
  'sales_activities',
  'sales_metrics',
  'manual_production',
  'important_documents',
  'training_documents',
  'agent_activities',
  'agent_goals',
  'cma_reports',
  'submissions',
  'recruiting_pipeline',
  'launchpad_progress',
  'fub_person_events',
  'fub_deal_events',
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const expected = Deno.env.get('ISOLATION_TEST_TOKEN');
  const provided = req.headers.get('x-isolation-token');
  if (!expected || provided !== expected) return json({ error: 'Forbidden' }, 403);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Fixture account + a one-time password, rotated on every run.
  const { data: userRes, error: userErr } = await admin.auth.admin.getUserById(FIXTURE_USER_ID);
  if (userErr || !userRes?.user?.email) return json({ error: 'Fixture account missing' }, 500);
  const email = userRes.user.email;
  const password = crypto.randomUUID() + crypto.randomUUID();
  const { error: pwErr } = await admin.auth.admin.updateUserById(FIXTURE_USER_ID, {
    password,
    email_confirm: true,
  });
  if (pwErr) return json({ error: 'Could not prepare fixture: ' + pwErr.message }, 500);

  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !session.session) return json({ error: 'Fixture sign-in failed' }, 500);

  const asFixture = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const t of TABLES) {
    const { count, error } = await asFixture.from(t).select('id', { count: 'exact', head: true });
    if (error) {
      // A denial is a pass (no rows reachable); record it for the report.
      errors[t] = error.message;
      counts[t] = 0;
    } else {
      counts[t] = count ?? 0;
    }
  }

  // Profiles: only the fixture's own row may be visible.
  const { data: profileRows } = await asFixture.from('profiles').select('id');
  const foreignProfiles = (profileRows ?? []).filter((r) => r.id !== FIXTURE_USER_ID).length;

  // Direct-by-ID reads of known Luxe records must return nothing.
  const { data: org } = await admin
    .from('organizations').select('id').eq('is_original_org', true).maybeSingle();
  const luxeOrg = org?.id ?? null;

  const byId: Record<string, number> = {};
  const controls: Record<string, number> = {};
  for (const t of ['commissions', 'portal_documents', 'client_accounts', 'weekly_411'] as const) {
    const { data: sample } = await admin
      .from(t).select('id').eq('org_id', luxeOrg).limit(1).maybeSingle();
    if (!sample?.id) continue;
    const { data: got } = await asFixture.from(t).select('id').eq('id', sample.id);
    byId[t] = (got ?? []).length;

    // Positive control: with RLS bypassed the very same lookup DOES return the
    // row, so a zero above means scoping worked, not that the data is absent.
    const { data: ctrl } = await admin.from(t).select('id').eq('id', sample.id);
    controls[t] = (ctrl ?? []).length;
  }

  // ---- Storage: portal-documents / portal-photos must be org-scoped ----
  const storage: Record<string, string> = {};
  const storageControls: Record<string, string> = {};
  const storageLeaks: string[] = [];

  const { data: luxePortal } = await admin
    .from('client_accounts').select('id').eq('org_id', luxeOrg).limit(1).maybeSingle();

  if (luxePortal?.id) {
    const folder = luxePortal.id as string;
    for (const bucket of ['portal-documents', 'portal-photos'] as const) {
      // Probe object written with the service role inside the Luxe portal folder.
      const probePath = `${folder}/isolation-probe-${crypto.randomUUID()}.txt`;
      const probe = new Blob(['isolation probe'], { type: 'text/plain' });
      const { error: seedErr } = await admin.storage.from(bucket).upload(probePath, probe);
      if (seedErr) {
        storageControls[`${bucket}:seed`] = `FAILED: ${seedErr.message}`;
        continue;
      }
      storageControls[`${bucket}:seed`] = 'ok';

      // list
      const { data: listed } = await asFixture.storage.from(bucket).list(folder);
      const listedCount = (listed ?? []).length;
      storage[`${bucket}:list`] = String(listedCount);
      if (listedCount > 0) storageLeaks.push(`${bucket} list`);

      // download
      const { data: dl, error: dlErr } = await asFixture.storage.from(bucket).download(probePath);
      storage[`${bucket}:download`] = dlErr ? `denied (${dlErr.message})` : 'DOWNLOADED';
      if (!dlErr && dl) storageLeaks.push(`${bucket} download`);

      // upload
      const intrusionPath = `${folder}/fixture-intrusion-${crypto.randomUUID()}.txt`;
      const { error: upErr } = await asFixture.storage
        .from(bucket)
        .upload(intrusionPath, probe);
      storage[`${bucket}:upload`] = upErr ? `denied (${upErr.message})` : 'UPLOADED';
      if (!upErr) {
        storageLeaks.push(`${bucket} upload`);
        // Never leave test data inside a real tenant's portal folder.
        await admin.storage.from(bucket).remove([intrusionPath]);
      }


      // delete
      const { data: del, error: delErr } = await asFixture.storage.from(bucket).remove([probePath]);
      const deleted = !delErr && (del ?? []).length > 0;
      storage[`${bucket}:delete`] = deleted ? 'DELETED' : 'denied';
      if (deleted) storageLeaks.push(`${bucket} delete`);

      // Positive control: the service role can still see and remove the probe,
      // proving the path existed and the checks above were not vacuous.
      const { data: ctrlList } = await admin.storage.from(bucket).list(folder, {
        search: probePath.split('/')[1],
      });
      storageControls[`${bucket}:visible_to_service_role`] = String((ctrlList ?? []).length);
      await admin.storage.from(bucket).remove([probePath]);
    }
  }

  // ---- Realtime: private topics must be org-scoped ----
  const { data: fixtureProfile } = await admin
    .from('profiles').select('org_id').eq('id', FIXTURE_USER_ID).maybeSingle();

  async function tryTopic(topic: string): Promise<'joined' | 'blocked'> {
    const rt = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${session!.session!.access_token}` } },
    });
    await rt.realtime.setAuth(session!.session!.access_token);
    const ch = rt.channel(topic, { config: { private: true } });
    const result = await new Promise<'joined' | 'blocked'>((resolve) => {
      const timer = setTimeout(() => resolve('blocked'), 8000);
      ch.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve('joined'); }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(timer); resolve('blocked');
        }
      });
    });
    await rt.removeChannel(ch);
    return result;
  }

  const realtime: Record<string, string> = {};
  const realtimeLeaks: string[] = [];
  if (luxePortal?.id) {
    realtime['foreign_portal_topic'] = await tryTopic(`portal-messages-${luxePortal.id}-agent`);
    if (realtime['foreign_portal_topic'] === 'joined') realtimeLeaks.push('realtime foreign portal topic');
  }
  realtime['foreign_org_topic'] = await tryTopic(`org-${luxeOrg}-updates`);
  if (realtime['foreign_org_topic'] === 'joined') realtimeLeaks.push('realtime foreign org topic');

  // Positive control: a topic inside the fixture's OWN org must still join,
  // otherwise "blocked" above would prove nothing.
  realtime['own_org_topic'] = fixtureProfile?.org_id
    ? await tryTopic(`org-${fixtureProfile.org_id}-updates`)
    : 'skipped';

  await admin.auth.admin.updateUserById(FIXTURE_USER_ID, {
    password: crypto.randomUUID() + crypto.randomUUID(),
  });

  const leaks = [
    ...Object.entries(counts).filter(([, n]) => n > 0).map(([t]) => t),
    ...Object.entries(byId).filter(([, n]) => n > 0).map(([t]) => `${t} (by id)`),
    ...(foreignProfiles > 0 ? ['profiles (other users)'] : []),
    ...storageLeaks,
    ...realtimeLeaks,
  ];
  const vacuous = [
    ...Object.entries(controls).filter(([, n]) => n === 0).map(([t]) => t),
    ...Object.entries(storageControls)
      .filter(([k, v]) => (k.endsWith(':seed') ? v !== 'ok' : Number(v) === 0))
      .map(([k]) => `storage ${k}`),
    ...(realtime['own_org_topic'] === 'blocked' ? ['realtime own-org topic'] : []),
  ];


  return json({
    fixture: { id: FIXTURE_USER_ID, email, displayName: 'Kristen Schulz' },
    counts,
    foreignProfiles,
    byId,
    controls,
    storage,
    storageControls,
    realtime,
    denied: errors,
    leaks,
    vacuous,
    pass: leaks.length === 0 && vacuous.length === 0,
  });
});

