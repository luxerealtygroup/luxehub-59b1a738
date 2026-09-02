/**
 * Tenant isolation gate — dependency-free (no vitest, no node_modules).
 *
 * Calls the `isolation-check` edge function, which signs in as a fixture
 * account in a throwaway org whose name/email deliberately collide with real
 * Luxe records, then runs the full read / storage / realtime / privilege
 * escalation probe suite under that account's own JWT.
 *
 * Exit codes:
 *   0  isolation verified (and proven non-vacuous by the positive controls)
 *   1  LEAK or vacuous run  -> must block a publish
 *   2  could not run (no token / network / function error) -> unverified
 *
 * Usage: node scripts/isolation-gate.mjs   (requires ISOLATION_TEST_TOKEN)
 */

const PROJECT_ID = process.env.VITE_SUPABASE_PROJECT_ID ?? 'sxpfxmlxegpmfamlmjyg';
const TOKEN = process.env.ISOLATION_TEST_TOKEN;
const URL = `https://${PROJECT_ID}.supabase.co/functions/v1/isolation-check`;

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

function loud(title, lines) {
  const bar = '='.repeat(72);
  console.error(`\n${bar}\n${title}\n${bar}`);
  for (const l of lines) console.error(`  ${l}`);
  console.error(`${bar}\n`);
}

export async function runIsolationGate() {
  if (!TOKEN) return { status: 'unverified', reason: 'ISOLATION_TEST_TOKEN is not set' };

  let r;
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: { 'x-isolation-token': TOKEN, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const text = await res.text();
    if (res.status !== 200) return { status: 'unverified', reason: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    r = JSON.parse(text);
  } catch (e) {
    return { status: 'unverified', reason: String(e) };
  }

  // Cross-org reads
  for (const [t, c] of Object.entries(r.counts ?? {})) check(c === 0, `${t} leaked ${c} rows to another org`);
  check((r.foreignProfiles ?? 0) === 0, 'profiles of other orgs are visible');
  for (const [t, c] of Object.entries(r.byId ?? {})) check(c === 0, `${t} readable by direct id from another org`);
  // Positive controls (non-vacuous)
  for (const [t, c] of Object.entries(r.controls ?? {})) check(c > 0, `positive control failed for ${t} — run would pass vacuously`);

  // Storage
  for (const [k, v] of Object.entries(r.storage ?? {})) {
    if (k.endsWith(':list')) check(Number(v) === 0, `${k} exposed another org's portal objects`);
    else check(/^denied/.test(String(v)), `${k} succeeded against another org's portal files`);
  }
  for (const [k, v] of Object.entries(r.storageControls ?? {})) {
    if (k.endsWith(':seed')) check(v === 'ok', `storage probe could not be seeded (${k})`);
    else check(Number(v) > 0, `storage positive control failed for ${k}`);
  }

  // Realtime
  const rt = r.realtime ?? {};
  check((rt.foreign_portal_topic ?? 'blocked') === 'blocked', 'joined another org portal topic');
  check(rt.foreign_org_topic === 'blocked', 'joined another org realtime topic');
  check(rt.own_org_topic === 'joined', 'realtime positive control failed — run would pass vacuously');

  // Same team, unassigned agent
  const st = r.sameTeam ?? {};
  check(st.assignment_column === 'client_accounts.invited_by', 'same-team fixture did not run');
  check(Number(st['unassigned:list']) === 0, 'unassigned same-team agent listed portal files');
  check(/^denied/.test(String(st['unassigned:download'])), 'unassigned same-team agent downloaded a portal file');
  check(/^denied/.test(String(st['unassigned:upload'])), 'unassigned same-team agent uploaded into a portal');
  check(st['unassigned:delete'] === 'denied', 'unassigned same-team agent deleted a portal file');
  check(Number(st['unassigned:client_accounts_by_id']) === 0, 'unassigned agent read the portal row');
  check(st['unassigned:portal_topic'] === 'blocked', 'unassigned agent joined the portal realtime topic');
  check(Number(st['assigned:list']) > 0, 'assigned agent cannot list — vacuous');
  check(st['assigned:download'] === 'ok', 'assigned agent cannot download — vacuous');
  check(st['assigned:portal_topic'] === 'joined', 'assigned agent cannot subscribe — vacuous');

  // Privilege escalation
  const esc = r.escalation ?? {};
  check(/^denied/.test(String(esc.self_update_org_id)), 'fixture updated its own profiles.org_id to the Luxe org');
  check(/^denied/.test(String(esc.insert_profile_with_luxe_org)), 'fixture inserted a profile with the Luxe org_id');
  check(esc.control_service_role_insert === 'ok', 'escalation probe control failed — run would pass vacuously');

  check((r.leaks ?? []).length === 0, `function reported leaks: ${JSON.stringify(r.leaks)}`);
  check((r.vacuous ?? []).length === 0, `function reported vacuous probes: ${JSON.stringify(r.vacuous)}`);
  check(r.pass === true, 'isolation-check reported pass=false');

  return fail.length ? { status: 'fail', failures: fail, raw: r } : { status: 'pass', raw: r };
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const out = await runIsolationGate();
  if (out.status === 'pass') {
    console.log('TENANT ISOLATION GATE: PASS — zero cross-tenant rows, positive controls returned rows.');
    process.exit(0);
  }
  if (out.status === 'fail') {
    loud('TENANT ISOLATION GATE: FAIL — DO NOT PUBLISH', out.failures);
    process.exit(1);
  }
  loud('TENANT ISOLATION GATE: UNVERIFIED — DO NOT PUBLISH', [out.reason]);
  process.exit(2);
}
