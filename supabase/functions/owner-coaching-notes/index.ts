// Owner-only "Coaching Notes for Kristen": compiles 2026 facts server-side
// (Follow Up Boss deals/contacts, 4-1-1, coaching sessions, appointment log,
// goals, company plan) and asks Claude for a cited draft. Runs in the
// background and writes to owner_coaching_notes; the page polls for it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireStaff, sharedCorsHeaders as cors } from '../_shared/auth.ts';
import { fubHeadersForUser, FUB_BASE_URL } from '../_shared/fub.ts';

const MODEL = 'anthropic/claude-sonnet-5';
const YEAR = '2026';
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const clip = (s: unknown, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
const r0 = (n: number) => Math.round(n);
const r1 = (n: number) => Math.round(n * 10) / 10;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function claude(system: string, prompt: string): Promise<{ text?: string; error?: string }> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return { error: 'AI is not configured' };
  const res = await fetch('https://ai.gateway.lovable.dev/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key, 'anthropic-version': '2023-06-01', 'X-Lovable-AIG-SDK': 'fetch' },
    body: JSON.stringify({ model: MODEL, max_tokens: 6000, stream: true, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok || !res.body) {
    console.error('gateway', res.status, (await res.text().catch(() => '')).slice(0, 300));
    return { error: res.status === 402 ? 'AI credits are used up — add credits in Settings → Plans & credits.' : res.status === 429 ? 'AI is busy — try Regenerate in a minute.' : `AI request failed (${res.status})` };
  }
  let text = '', buf = '';
  const rd = res.body.getReader(); const dec = new TextDecoder();
  while (true) {
    const { done, value } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try { const ev = JSON.parse(line.slice(5).trim()); if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text; } catch { /* keep-alive */ }
    }
  }
  return { text };
}
const parse = (t?: string) => { const m = t?.match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

async function fubGet(h: Record<string, string>, path: string) {
  const r = await fetch(`${FUB_BASE_URL}${path}`, { headers: h });
  if (!r.ok) throw new Error(`FUB ${r.status}`);
  return r.json();
}

const bucket = (s: string) => {
  const x = (s || '').toLowerCase();
  if (/realtor\.ca|realtor ca|rew|zillow|point2/.test(x)) return 'Realtor.ca / portals';
  if (/sphere|referr|friend|family|agent referral/.test(x)) return 'Sphere / referrals';
  if (/past client|repeat/.test(x)) return 'Past clients';
  if (/open house|oh /.test(x)) return 'Open houses';
  if (/facebook|instagram|social|meta|google|ads|ppc|tiktok|youtube/.test(x)) return 'Social / paid ads';
  return 'Other / unspecified';
};
const dealDate = (d: any) => String(d.closeDate || d.closedDate || d.projectedCloseDate || d.enteredStageAt || '').slice(0, 10);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !/^\d+$/.test(w)).sort().join(' ');

async function compile(db: any, orgId: string, callerId: string) {
  const { data: st } = await db.from('planning_settings').select('selling_agent_ids').eq('org_id', orgId).eq('plan_year', 2027).maybeSingle();
  const selling: string[] = st?.selling_agent_ids ?? [];
  const { data: plan } = await db.from('company_plans').select('*').eq('org_id', orgId).maybeSingle();
  const { data: profs } = await db.from('profiles').select('id, full_name, email, fub_user_id').eq('org_id', orgId);
  const { data: roles } = await db.from('user_roles').select('user_id, role');
  const P = new Map<string, any>((profs ?? []).map((p: any) => [p.id, p]));
  const producing = new Set<string>([...selling, ...(plan?.allowed_user_ids ?? []),
    ...(roles ?? []).filter((r: any) => r.role === 'owner' && P.has(r.user_id)).map((r: any) => r.user_id)]);
  const byFub = new Map<number, string>();
  for (const p of profs ?? []) if (p.fub_user_id && producing.has(p.id)) byFub.set(Number(p.fub_user_id), p.id);

  // ── Follow Up Boss deals ──
  const h = await fubHeadersForUser(callerId);
  const deals: any[] = [];
  for (let off = 0; off < 5000; off += 100) {
    const j = await fubGet(h, `/deals?limit=100&offset=${off}`);
    deals.push(...(j.deals ?? [])); if ((j.deals ?? []).length < 100) break;
  }
  const today = new Date().toISOString().slice(0, 10);
  const closed = deals.filter(d => String(d.stageName).toLowerCase() === 'closed' && dealDate(d).startsWith(YEAR) && dealDate(d) <= today);
  const pending = deals.filter(d => /pending|firm|conditional|under contract|sold/i.test(String(d.stageName)) && String(d.stageName).toLowerCase() !== 'closed');
  type Agg = { gci: number; homes: number; leases: number; volume: number; leaseGci: number; pending: number; pendingGci: number; byMonth: number[] };
  const A: Record<string, Agg> = {};
  const agg = (id: string) => (A[id] ??= { gci: 0, homes: 0, leases: 0, volume: 0, leaseGci: 0, pending: 0, pendingGci: 0, byMonth: Array(12).fill(0) });
  const owners = (d: any) => { const ids = (d.users ?? []).map((u: any) => byFub.get(Number(u.id))).filter(Boolean) as string[]; return ids.length ? [...new Set(ids)] : ['unassigned']; };
  let team = { gci: 0, homes: 0, leases: 0, volume: 0 };
  for (const d of closed) {
    const o = owners(d), f = 1 / o.length, g = Number(d.commissionValue || 0), price = Number(d.price || 0), lease = price < 10000;
    team.gci += g; team.volume += price; lease ? team.leases++ : team.homes++;
    for (const id of o) { const a = agg(id); if (lease) { a.leases += f; a.leaseGci += g * f; } else { a.homes += f; a.gci += g * f; a.volume += price * f; a.byMonth[Number(dealDate(d).slice(5, 7)) - 1] += f; } }
  }
  for (const d of pending) for (const id of owners(d)) { const a = agg(id); a.pending += 1 / owners(d).length; a.pendingGci += Number(d.commissionValue || 0) / owners(d).length; }

  // Audit: $0 commission, missing dates, duplicates.
  const zero = closed.filter(d => !Number(d.commissionValue)).map(d => `${d.name} (${dealDate(d)}, $${r0(Number(d.price || 0)).toLocaleString()})`);
  const noDate = deals.filter(d => String(d.stageName).toLowerCase() === 'closed' && !(d.closeDate || d.closedDate || d.projectedCloseDate)).map(d => d.name);
  const dups: string[] = [];
  for (let i = 0; i < closed.length; i++) for (let j = i + 1; j < closed.length; j++) {
    const a = closed[i], b = closed[j], na = norm(a.name), nb = norm(b.name);
    const sameName = na && na === nb, sameComm = Number(a.commissionValue) === Number(b.commissionValue) && Number(a.commissionValue) > 0;
    const overlap = na && nb && (na.split(' ').some((w: string) => nb.split(' ').includes(w)));
    if (sameName || (sameComm && overlap)) dups.push(`"${a.name}" and "${b.name}" — both $${r0(Number(a.commissionValue || 0)).toLocaleString()} commission`);
  }

  // ── FUB contacts created 2026: sources + uncontacted ──
  const people: any[] = [];
  for (let off = 0; off < 10000; off += 100) {
    const j = await fubGet(h, `/people?limit=100&offset=${off}&sort=-created&fields=id,created,source,stage,contacted,assignedUserId`);
    const pp = j.people ?? []; const inY = pp.filter((p: any) => String(p.created).startsWith(YEAR));
    people.push(...inY); if (inY.length < pp.length || pp.length < 100) break;
  }
  const srcOf = new Map<number, string>(people.map(p => [Number(p.id), p.source ?? '']));
  const missing = [...new Set(closed.map(d => Number(d.people?.[0]?.id)).filter(id => id && !srcOf.has(id)))];
  for (let i = 0; i < missing.length; i += 10) await Promise.all(missing.slice(i, i + 10).map(async id => { try { const p = await fubGet(h, `/people/${id}?fields=id,source`); srcOf.set(id, p.source ?? ''); } catch { srcOf.set(id, ''); } }));
  const S: Record<string, { leads: number; closings: number; gci: number }> = {};
  for (const p of people) (S[bucket(p.source)] ??= { leads: 0, closings: 0, gci: 0 }).leads++;
  for (const d of closed) { if (Number(d.price || 0) < 10000) continue; const b = bucket(srcOf.get(Number(d.people?.[0]?.id)) ?? ''); const s = (S[b] ??= { leads: 0, closings: 0, gci: 0 }); s.closings++; s.gci += Number(d.commissionValue || 0); }
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
  const uncontacted = people.filter(p => String(p.contacted) === '0' || p.contacted === false);
  const stuckLead = people.filter(p => p.stage === 'Lead' && p.created < new Date(Date.now() - 90 * 864e5).toISOString()).length;

  // ── Weekly accountability ──
  const ids = selling;
  const [w411, coach, appts, pg, ag] = await Promise.all([
    db.from('weekly_411').select('user_id, week_start_date, conversations, pipeline_additions, appointments_actual, appointments_held, speed_to_first_touch_minutes, contacts_unstaged, wins, challenges, next_steps, notes, priority_1, priority_1_completed, priority_2, priority_2_completed, priority_3, priority_3_completed, priority_4, priority_4_completed').in('user_id', ids).gte('week_start_date', '2026-01-01').order('week_start_date'),
    db.from('coaching_sessions').select('agent_id, week_of, generated_notes').in('agent_id', ids).gte('week_of', '2026-01-01').order('week_of'),
    db.from('appointment_records').select('user_id, outcome, appointment_date').in('user_id', ids).gte('appointment_date', '2026-01-01'),
    db.from('production_goals').select('user_id, annual_units_goal, annual_gci_goal, annual_volume_goal').in('user_id', ids).eq('year', 2026),
    db.from('agent_goals').select('user_id, goal_type, target_value').in('user_id', ids).eq('period', 'yearly').gte('start_date', '2026-01-01').lte('start_date', '2026-12-31'),
  ]);
  const weeksElapsed = Math.floor((Date.now() - new Date('2026-01-05').getTime()) / (7 * 864e5)) + 1;
  const dupNames = Object.entries((profs ?? []).reduce((m: Record<string, number>, p: any) => { const n = (p.full_name || '').trim().toLowerCase(); if (n) m[n] = (m[n] ?? 0) + 1; return m; }, {})).filter(([, c]) => (c as number) > 1).map(([n]) => n);

  const agents = ids.map(id => {
    const p = P.get(id); const a = A[id] ?? agg(id);
    const ws = (w411.data ?? []).filter((w: any) => w.user_id === id);
    let pri = 0, done = 0, carried = 0; let prev: string[] = [];
    const notes: string[] = [];
    for (const w of ws) {
      const cur: string[] = [];
      for (const i of [1, 2, 3, 4]) { const t = (w as any)[`priority_${i}`]; if (!t) continue; pri++; if ((w as any)[`priority_${i}_completed`]) done++; const k = norm(t); cur.push(k); if (prev.includes(k)) carried++; }
      prev = cur;
      const bits = [w.wins && `W: ${clip(w.wins, 220)}`, w.challenges && `C: ${clip(w.challenges, 220)}`, w.next_steps && `N: ${clip(w.next_steps, 160)}`, w.notes && `Notes: ${clip(w.notes, 220)}`,
        [1, 2, 3, 4].map(i => (w as any)[`priority_${i}`] ? `${clip((w as any)[`priority_${i}`], 80)}[${(w as any)[`priority_${i}_completed`] ? 'done' : 'not done'}]` : '').filter(Boolean).join('; ')].filter(Boolean);
      if (bits.length) notes.push(`${w.week_start_date}: ${bits.join(' | ')}`);
    }
    const sum = (k: string) => ws.reduce((t: number, w: any) => t + Number(w[k] || 0), 0);
    const speed = ws.map((w: any) => w.speed_to_first_touch_minutes).filter((v: any) => v != null);
    const ar = (appts.data ?? []).filter((x: any) => x.user_id === id);
    const pgr = (pg.data ?? []).find((x: any) => x.user_id === id); const agr = (ag.data ?? []).filter((x: any) => x.user_id === id);
    const goal = pgr && (pgr.annual_gci_goal || pgr.annual_units_goal)
      ? { gci: pgr.annual_gci_goal, deals: pgr.annual_units_goal, source: 'production goals' }
      : { gci: agr.find((x: any) => x.goal_type === 'revenue')?.target_value ?? null, deals: agr.find((x: any) => x.goal_type === 'deals_closed')?.target_value ?? null, source: 'agent goals' };
    const best = a.byMonth.reduce((b, v, i) => (v > a.byMonth[b] ? i : b), 0);
    const coachNotes = (coach.data ?? []).filter((c: any) => c.agent_id === id).map((c: any) => `${c.week_of}: ${clip(c.generated_notes, 1500)}`);
    return {
      id, name: p?.full_name ?? 'Agent',
      numbers: {
        gci: r0(a.gci + a.leaseGci), sales_gci: r0(a.gci), lease_gci: r0(a.leaseGci), homes: r1(a.homes), leases: r1(a.leases), volume: r0(a.volume),
        avg_gci_per_home: a.homes ? r0(a.gci / a.homes) : null, pending: r1(a.pending), pending_gci: r0(a.pendingGci),
        best_month: a.byMonth[best] ? `${MONTHS[best]} 2026 (${r1(a.byMonth[best])} homes)` : null,
        goal_gci: goal.gci, goal_deals: goal.deals, goal_source: goal.source,
      },
      activity: {
        weeks_logged: ws.length, weeks_elapsed: weeksElapsed, conversations: sum('conversations'), pipeline_adds: sum('pipeline_additions'),
        appts_411: sum('appointments_actual'), appts_fub_synced: sum('appointments_held'),
        appt_log: { total: ar.length, held_or_signed: ar.filter((x: any) => /held|signed/i.test(x.outcome ?? '')).length },
        priorities: pri, priorities_done: done, priorities_carried_over: carried,
        avg_speed_to_first_touch_min: speed.length ? r0(speed.reduce((t: number, v: number) => t + Number(v), 0) / speed.length) : null,
        coaching_sessions: coachNotes.length,
      },
      evidence: { weekly: notes.slice(-40), coaching: coachNotes },
    };
  });

  const tiers = (plan?.profit_tiers ?? []).map((p: number) => {
    const tx = plan?.luxe_revenue_per_deal ? Math.ceil((Number(plan.operating_costs) + Number(plan.debt_total) + p) / Number(plan.luxe_revenue_per_deal)) : null;
    const pace = Math.round(closed.length / ((Date.now() - new Date('2026-01-01').getTime()) / (365 * 864e5)));
    return { profit: p, transactions: tx, pace, gap: tx != null ? tx - pace : null, new_agents: tx != null ? Math.ceil(Math.max(0, tx - pace) / Number(plan.deals_per_agent || 10)) : null };
  });

  const facts = {
    as_of: today,
    team: { gci: r0(team.gci), closed: closed.length, homes: team.homes, leases: team.leases, volume: r0(team.volume), pending: pending.length },
    by_agent_production: Object.entries(A).map(([id, a]) => ({ name: id === 'unassigned' ? 'Unassigned' : P.get(id)?.full_name ?? id, gci: r0(a.gci + a.leaseGci), homes: r1(a.homes), leases: r1(a.leases), volume: r0(a.volume), pending: r1(a.pending) })).sort((x, y) => y.gci - x.gci),
    audit: {
      zero_commission: zero, missing_close_date: noDate, possible_duplicates: dups,
      uncontacted_2026_leads: uncontacted.length, uncontacted_older_than_7_days: uncontacted.filter(p => p.created < cutoff).length,
      leads_stuck_in_lead_stage_90d: stuckLead, duplicate_profiles: dupNames,
      shared_deals_split: 'Shared deals split evenly between the producing agents on the deal; support staff excluded.',
    },
    lead_sources: Object.entries(S).map(([k, v]) => ({ source: k, leads: v.leads, closings: v.closings, gci: r0(v.gci), lead_to_close_pct: v.leads ? r1(v.closings / v.leads * 100) : null })).sort((a, b) => b.gci - a.gci),
    lead_source_note: 'Leads = FUB contacts created in 2026. Closings = 2026 home sales by the buyer/seller contact\'s source (contact may predate 2026), so lead→close is approximate. Appointments are not tracked by source.',
    recruiting: { tracked: false, candidates_in_app: 0, note: 'The app has a recruiting table but it holds no candidates, conversations or stages.', plan_tiers: tiers, deals_per_agent: plan?.deals_per_agent ?? 10 },
    agents: agents.map(({ evidence, ...rest }) => rest),
  };

  const RULES = `Rules: every claim cites its source in brackets, e.g. [FUB, Jul 2026], [4-1-1, 22 of 38 weeks], [Coaching notes, Mar 2026], [Appointment log]. If data is thin or unreliable, say so plainly instead of guessing. NEVER mention health, illness, family, pregnancy, bereavement, relationships or other personal circumstances; where they affected work write only "personal capacity was limited in [months]". Tone: direct, supportive, specific; no generic advice. Use the exact numbers provided; never invent numbers, clients or events. Return ONLY JSON.`;

  const teamPrompt = `FACTS (JSON):\n${JSON.stringify(facts).slice(0, 60000)}`;
  const teamSys = `You write private coaching notes for Kristen, the owner of a Canadian real estate team, ahead of the Oct 14 2026 planning session. ${RULES}
Schema: {"takeaways":[5 strings, each tied to a number],"working":[{"point":"","evidence":""}],"not_working":[{"point":"","evidence":""}],"hygiene":[{"issue":"","evidence":"","fix":"","owner":""}],"lead_sources":{"scale":[""],"cut":[""],"test":[""]},"recruiting":"need vs what is in motion vs gap, 2-4 sentences","talking_points":[5 strings]}. Owners for hygiene fixes should be roles or named people from the facts (e.g. "Each agent", "Kristen", "Marie (admin)").`;
  const agentSys = `You write a private coaching card about one agent for Kristen, the team owner. ${RULES}
Schema: {"strengths":[{"point":"","evidence":""}],"patterns":{"stuck":[""],"carried_over":[""],"activity_gaps":[""]},"coach_2027":[2-3 strings],"questions":[3 strings],"suggested_range":{"deals_low":0,"deals_high":0,"gci_low":0,"gci_high":0,"rationale":""}}. Base the suggested range on 2026 annualised actuals (homes, GCI) and trend; it is a suggestion only.`;

  const [teamOut, ...agentOuts] = await Promise.all([
    claude(teamSys, teamPrompt),
    ...agents.map(a => claude(agentSys, `TEAM CONTEXT: team GCI ${facts.team.gci}, ${facts.team.homes} homes, as of ${today}.\nAGENT FACTS: ${JSON.stringify({ name: a.name, numbers: a.numbers, activity: a.activity })}\nCOACHING SESSION NOTES:\n${a.evidence.coaching.join('\n').slice(0, 20000) || 'none'}\nWEEKLY 4-1-1 ENTRIES (W=wins C=challenges N=next steps):\n${a.evidence.weekly.join('\n').slice(0, 25000) || 'none'}`)),
  ]);
  const errors = [teamOut, ...agentOuts].map(o => o.error).filter(Boolean);
  const draft = {
    team: parse(teamOut.text),
    agents: Object.fromEntries(agents.map((a, i) => [a.id, parse(agentOuts[i].text)])),
    errors,
  };
  await db.from('owner_coaching_notes').upsert({
    org_id: orgId, plan_year: 2027, draft, facts, model: MODEL, generated_by: callerId, generated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,plan_year' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const guard = await requireStaff(req, { cors });
  if (!guard.ok) return guard.response;
  const caller = guard.caller;
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: me } = await db.from('profiles').select('org_id').eq('id', caller.userId).maybeSingle();
  if (!me?.org_id) return json({ error: 'Forbidden' }, 403);
  const { data: plan } = await db.from('company_plans').select('allowed_user_ids').eq('org_id', me.org_id).maybeSingle();
  if (!plan || !(plan.allowed_user_ids ?? []).includes(caller.userId)) return json({ error: 'Owner only' }, 403);

  // Mark as generating so the page can show progress, then work in the background.
  await db.from('owner_coaching_notes').upsert({ org_id: me.org_id, plan_year: 2027, draft: { generating: true, started_at: new Date().toISOString() } }, { onConflict: 'org_id,plan_year', ignoreDuplicates: false });
  const work = compile(db, me.org_id, caller.userId).catch(async e => {
    console.error('compile failed', (e as Error).message);
    await db.from('owner_coaching_notes').update({ draft: { errors: [`Could not compile: ${(e as Error).message}`] } }).eq('org_id', me.org_id).eq('plan_year', 2027);
  });
  // @ts-ignore EdgeRuntime is provided by the platform
  EdgeRuntime.waitUntil(work);
  return json({ started: true }, 202);
});
