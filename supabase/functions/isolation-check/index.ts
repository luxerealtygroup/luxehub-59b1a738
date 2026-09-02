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

  // The fixture's own throwaway org (its own rows are legitimate, not leaks).
  const { data: fixtureProfile } = await admin
    .from('profiles').select('org_id').eq('id', FIXTURE_USER_ID).maybeSingle();
  const fixtureOrgId = (fixtureProfile?.org_id as string | undefined) ?? null;

  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const t of TABLES) {
    let q = asFixture.from(t).select('id', { count: 'exact', head: true });
    if (fixtureOrgId) q = q.neq('org_id', fixtureOrgId);
    const { count, error } = await q;
    if (error) {
      // A denial is a pass (no rows reachable); record it for the report.
      errors[t] = error.message;
      counts[t] = 0;
    } else {
      counts[t] = count ?? 0;
    }
  }

  // Profiles: no profile from another org may be visible.
  const { data: profileRows } = await asFixture.from('profiles').select('id, org_id');
  const foreignProfiles = (profileRows ?? [])
    .filter((r) => r.id !== FIXTURE_USER_ID && r.org_id !== fixtureOrgId).length;

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
      // Sweep any leftovers from an earlier run before starting.
      const { data: stale } = await admin.storage.from(bucket).list(folder);
      const staleNames = (stale ?? [])
        .filter((o) => o.name.startsWith('isolation-probe-') || o.name.startsWith('fixture-intrusion-'))
        .map((o) => `${folder}/${o.name}`);
      if (staleNames.length) await admin.storage.from(bucket).remove(staleNames);


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

  async function tryTopicAs(token: string, topic: string): Promise<'joined' | 'blocked'> {
    const rt = createClient(url, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    await rt.realtime.setAuth(token);
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
  const tryTopic = (topic: string) => tryTopicAs(session!.session!.access_token, topic);

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

  // ---- Same team, unassigned agent ----
  // Portal access is now limited to the assigned agent (client_accounts.invited_by)
  // or a same-org admin/owner. Prove that an agent in the SAME org who is not
  // assigned to the portal cannot read its files, rows, or realtime topic —
  // with the assigned agent as the positive control.
  const sameTeam: Record<string, string> = {};
  const sameTeamLeaks: string[] = [];
  const sameTeamVacuous: string[] = [];
  const fixtureOrg = fixtureProfile?.org_id as string | undefined;

  async function fixtureAgent(email: string): Promise<{ id: string; token: string } | null> {
    const password = crypto.randomUUID() + crypto.randomUUID();
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = (list?.users ?? []).find((u) => u.email === email) ?? null;
    if (!user) {
      const { data: created } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
      });
      user = created?.user ?? null;
    } else {
      await admin.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    }
    if (!user) return null;
    await admin.from('profiles').upsert(
      { id: user.id, email, full_name: 'Isolation Fixture Agent', org_id: fixtureOrg },
      { onConflict: 'id' },
    );
    await admin.from('user_roles').upsert(
      { user_id: user.id, role: 'agent' }, { onConflict: 'user_id,role' },
    );
    const { data: s } = await anon.auth.signInWithPassword({ email, password });
    if (!s?.session) return null;
    return { id: user.id, token: s.session.access_token };
  }

  if (fixtureOrg) {
    const assigned = await fixtureAgent('isolation-assigned@isolation.invalid');
    const unassigned = await fixtureAgent('isolation-unassigned@isolation.invalid');

    if (!assigned || !unassigned) {
      sameTeamVacuous.push('same-team fixture agents could not be prepared');
    } else {
      // A portal in the fixture org, assigned to `assigned`.
      const { data: existing } = await admin
        .from('client_accounts')
        .select('id')
        .eq('org_id', fixtureOrg)
        .eq('email', 'isolation-portal@isolation.invalid')
        .maybeSingle();
      let portalId = existing?.id as string | undefined;
      if (!portalId) {
        const { data: ins } = await admin
          .from('client_accounts')
          .insert({
            org_id: fixtureOrg,
            email: 'isolation-portal@isolation.invalid',
            full_name: 'Isolation Fixture Client',
            invited_by: assigned.id,
          })
          .select('id')
          .maybeSingle();
        portalId = ins?.id as string | undefined;
      } else {
        await admin.from('client_accounts').update({ invited_by: assigned.id }).eq('id', portalId);
      }

      if (!portalId) {
        sameTeamVacuous.push('same-team fixture portal could not be prepared');
      } else {
        sameTeam['assignment_column'] = 'client_accounts.invited_by';
        const probePath = `${portalId}/isolation-probe-${crypto.randomUUID()}.txt`;
        const blob = new Blob(['same team probe'], { type: 'text/plain' });
        const { error: seedErr } = await admin.storage
          .from('portal-documents').upload(probePath, blob);
        if (seedErr) {
          sameTeamVacuous.push('same-team storage probe seed failed: ' + seedErr.message);
        } else {
          const asAgent = (token: string) =>
            createClient(url, anonKey, {
              auth: { persistSession: false },
              global: { headers: { Authorization: `Bearer ${token}` } },
            });

          const un = asAgent(unassigned.token);
          const as = asAgent(assigned.token);

          const { data: unList } = await un.storage.from('portal-documents').list(portalId);
          sameTeam['unassigned:list'] = String((unList ?? []).length);
          if ((unList ?? []).length > 0) sameTeamLeaks.push('same-team unassigned list');

          const { data: unDl, error: unDlErr } = await un.storage
            .from('portal-documents').download(probePath);
          sameTeam['unassigned:download'] = unDlErr ? `denied (${unDlErr.message})` : 'DOWNLOADED';
          if (!unDlErr && unDl) sameTeamLeaks.push('same-team unassigned download');

          const intrusion = `${portalId}/fixture-intrusion-${crypto.randomUUID()}.txt`;
          const { error: unUpErr } = await un.storage
            .from('portal-documents').upload(intrusion, blob);
          sameTeam['unassigned:upload'] = unUpErr ? `denied (${unUpErr.message})` : 'UPLOADED';
          if (!unUpErr) {
            sameTeamLeaks.push('same-team unassigned upload');
            await admin.storage.from('portal-documents').remove([intrusion]);
          }

          const { data: unDel, error: unDelErr } = await un.storage
            .from('portal-documents').remove([probePath]);
          const unDeleted = !unDelErr && (unDel ?? []).length > 0;
          sameTeam['unassigned:delete'] = unDeleted ? 'DELETED' : 'denied';
          if (unDeleted) sameTeamLeaks.push('same-team unassigned delete');

          // Row-level: the portal itself must be invisible to the unassigned agent.
          const { data: unRow } = await un.from('client_accounts').select('id').eq('id', portalId);
          sameTeam['unassigned:client_accounts_by_id'] = String((unRow ?? []).length);
          if ((unRow ?? []).length > 0) sameTeamLeaks.push('same-team unassigned client_accounts row');

          // Realtime
          sameTeam['unassigned:portal_topic'] = await tryTopicAs(
            unassigned.token, `portal-messages-${portalId}-agent`,
          );
          if (sameTeam['unassigned:portal_topic'] === 'joined') {
            sameTeamLeaks.push('same-team unassigned portal topic');
          }

          // Positive controls: the ASSIGNED agent can do all of it.
          if (unDeleted) {
            await admin.storage.from('portal-documents').upload(probePath, blob);
          }
          const { data: asList } = await as.storage.from('portal-documents').list(portalId);
          sameTeam['assigned:list'] = String((asList ?? []).length);
          if ((asList ?? []).length === 0) sameTeamVacuous.push('assigned agent cannot list portal files');

          const { data: asDl, error: asDlErr } = await as.storage
            .from('portal-documents').download(probePath);
          sameTeam['assigned:download'] = asDlErr ? `DENIED (${asDlErr.message})` : 'ok';
          if (asDlErr || !asDl) sameTeamVacuous.push('assigned agent cannot download portal file');

          sameTeam['assigned:portal_topic'] = await tryTopicAs(
            assigned.token, `portal-messages-${portalId}-agent`,
          );
          if (sameTeam['assigned:portal_topic'] !== 'joined') {
            sameTeamVacuous.push('assigned agent cannot join portal topic');
          }

          // Cleanup any test artifacts.
          const { data: leftovers } = await admin.storage.from('portal-documents').list(portalId);
          const paths = (leftovers ?? [])
            .filter((o) => o.name.startsWith('isolation-probe-') || o.name.startsWith('fixture-intrusion-'))
            .map((o) => `${portalId}/${o.name}`);
          if (paths.length) await admin.storage.from('portal-documents').remove(paths);
        }
      }
    }
  }

  // ---- Privilege escalation: fixture tries to join the Luxe org itself ----
  const escalation: Record<string, string> = {};
  const escalationLeaks: string[] = [];
  if (luxeOrg) {
    const { error: updErr } = await asFixture
      .from('profiles').update({ org_id: luxeOrg }).eq('id', FIXTURE_USER_ID);
    const { data: afterUpd } = await admin
      .from('profiles').select('org_id').eq('id', FIXTURE_USER_ID).maybeSingle();
    const moved = afterUpd?.org_id === luxeOrg;
    escalation['self_update_org_id'] = moved
      ? 'ESCALATED'
      : `denied (${updErr?.message ?? 'no rows changed'})`;
    if (moved) {
      escalationLeaks.push('profiles.org_id self-update to Luxe org');
      // Restore immediately.
      await admin.from('profiles').update({ org_id: fixtureOrgId }).eq('id', FIXTURE_USER_ID);
    }

    const intruderId = crypto.randomUUID();
    const { error: insErr } = await asFixture
      .from('profiles').insert({ id: intruderId, email: 'escalation-probe@example.com', org_id: luxeOrg });
    const { data: insRow } = await admin
      .from('profiles').select('id').eq('id', intruderId).maybeSingle();
    escalation['insert_profile_with_luxe_org'] = insRow
      ? 'ESCALATED'
      : `denied (${insErr?.message ?? 'no row created'})`;
    if (insRow) {
      escalationLeaks.push('profiles insert with Luxe org_id');
      await admin.from('profiles').delete().eq('id', intruderId);
    }

    // Positive control: the service role CAN do it (proves the probe is real).
    const ctlId = crypto.randomUUID();
    const { error: ctlErr } = await admin
      .from('profiles').insert({ id: ctlId, email: 'escalation-control@example.com', org_id: luxeOrg });
    escalation['control_service_role_insert'] = ctlErr ? `FAILED (${ctlErr.message})` : 'ok';
    await admin.from('profiles').delete().eq('id', ctlId);
  }

  await admin.auth.admin.updateUserById(FIXTURE_USER_ID, {
    password: crypto.randomUUID() + crypto.randomUUID(),
  });


  const leaks = [
    ...Object.entries(counts).filter(([, n]) => n > 0).map(([t]) => t),
    ...Object.entries(byId).filter(([, n]) => n > 0).map(([t]) => `${t} (by id)`),
    ...(foreignProfiles > 0 ? ['profiles (other users)'] : []),
    ...storageLeaks,
    ...realtimeLeaks,
    ...sameTeamLeaks,
    ...escalationLeaks,
  ];
  const vacuous = [
    ...Object.entries(controls).filter(([, n]) => n === 0).map(([t]) => t),
    ...Object.entries(storageControls)
      .filter(([k, v]) => (k.endsWith(':seed') ? v !== 'ok' : Number(v) === 0))
      .map(([k]) => `storage ${k}`),
    ...(realtime['own_org_topic'] === 'blocked' ? ['realtime own-org topic'] : []),
    ...sameTeamVacuous,
    ...(escalation['control_service_role_insert'] && escalation['control_service_role_insert'] !== 'ok'
      ? ['escalation probe control']
      : []),
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
    sameTeam,
    escalation,
    denied: errors,
    leaks,
    vacuous,
    pass: leaks.length === 0 && vacuous.length === 0,
  });
});

