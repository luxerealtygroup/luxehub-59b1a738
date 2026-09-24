// Compiles a short draft 2026 coaching recap for one agent using Claude via Lovable AI.
// Sources: coaching_sessions (AI notes + transcript excerpts) and weekly_411
// (wins, challenges, next steps, notes, weekly priorities with completion ticks).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { requireStaff, sharedCorsHeaders as cors } from '../_shared/auth.ts';

const MODEL = 'anthropic/claude-sonnet-5';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

async function callClaude(system: string, prompt: string): Promise<{ text?: string; error?: string; status?: number }> {
  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return { error: 'AI is not configured', status: 500 };
  const res = await fetch('https://ai.gateway.lovable.dev/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key, 'anthropic-version': '2023-06-01', 'X-Lovable-AIG-SDK': 'fetch' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, stream: true, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok || !res.body) {
    console.error('gateway', res.status, await res.text().catch(() => ''));
    const error = res.status === 402 ? 'AI credits are used up — add credits in Settings → Plans & credits.'
      : res.status === 429 ? 'AI is busy right now — try again in a minute.' : `AI request failed (${res.status})`;
    return { error, status: [402, 403, 429].includes(res.status) ? res.status : 502 };
  }
  let text = '', buf = '';
  const reader = res.body.getReader(); const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try { const ev = JSON.parse(line.slice(5).trim()); if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text; } catch { /* keep-alive */ }
    }
  }
  return { text };
}

async function teamThemes(_req: Request, caller: any) {
  if (!caller.isAdmin || caller.kind !== 'staff') return json({ error: 'Admins only' }, 403);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: me } = await db.from('profiles').select('org_id').eq('id', caller.userId).maybeSingle();
  const { data: st } = await db.from('planning_settings').select('selling_agent_ids').eq('org_id', me?.org_id).eq('plan_year', 2027).maybeSingle();
  const ids: string[] = st?.selling_agent_ids ?? [];
  if (!ids.length) return json({ themes: null });
  const [pw, rc, pf] = await Promise.all([
    db.from('planning_prework').select('agent_id, wins_2026, challenges_2026, top_lead_sources, lead_source_focus').in('agent_id', ids).eq('plan_year', 2027),
    db.from('planning_recaps').select('agent_id, wins, challenges, lead_sources').in('agent_id', ids).eq('plan_year', 2027),
    db.from('profiles').select('id, full_name').in('id', ids),
  ]);
  const name = new Map((pf.data ?? []).map((p: any) => [p.id, p.full_name]));
  const blocks = ids.map(id => {
    const p: any = (pw.data ?? []).find((x: any) => x.agent_id === id) ?? {};
    const r: any = (rc.data ?? []).find((x: any) => x.agent_id === id) ?? {};
    const wins = p.wins_2026 || r.wins, ch = p.challenges_2026 || r.challenges, ls = p.top_lead_sources || r.lead_sources;
    const focus = (p.lead_source_focus ?? []).map((f: any) => `${f.source} ${f.pct ?? ''}%`).join(', ');
    if (!wins && !ch && !ls) return null;
    return `## ${name.get(id) ?? 'Agent'}\nWins: ${clip(wins, 1500)}\nChallenges: ${clip(ch, 1500)}\nLead sources: ${clip(ls, 800)} ${focus ? '| 2027 focus: ' + focus : ''}`;
  }).filter(Boolean);
  if (!blocks.length) return json({ themes: null, agents: 0 });
  const out = await callClaude(
    'You summarise a real-estate team\'s 2026 year-end reflections for a leadership planning session. Find what is COMMON across agents, not individual detail. Return ONLY JSON with string keys wins, challenges, lead_sources. Each: 3-5 lines starting with "- ", each line naming the theme and how many agents mention it, e.g. "- Open houses as a lead source (4 agents)". Never invent.',
    blocks.join('\n\n'));
  if (out.error) return json({ error: out.error }, out.status);
  const m = out.text!.match(/\{[\s\S]*\}/);
  try { return json({ themes: JSON.parse(m![0]), agents: blocks.length }); } catch { return json({ error: 'The AI returned an unreadable summary. Try again.' }, 502); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const guard = await requireStaff(req, { cors });
  if (!guard.ok) return guard.response;
  const caller = guard.caller;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (body?.team === true) return teamThemes(req, caller);
  const agentId = String(body?.agent_id ?? '');
  const force = body?.force === true;
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return json({ error: 'agent_id required' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: agent } = await db.from('profiles').select('id, full_name, org_id').eq('id', agentId).maybeSingle();
  if (!agent) return json({ error: 'Agent not found' }, 404);

  // Access: an agent may compile their own first draft; only admins in the same org may regenerate or compile for others.
  if (caller.kind === 'staff') {
    const self = caller.userId === agentId;
    if (!self || force) {
      if (!caller.isAdmin) return json({ error: 'Only admins can regenerate' }, 403);
      const { data: me } = await db.from('profiles').select('org_id').eq('id', caller.userId).maybeSingle();
      if (!me || me.org_id !== agent.org_id) return json({ error: 'Forbidden' }, 403);
    }
  }

  const { data: existing } = await db.from('planning_recaps').select('*').eq('agent_id', agentId).eq('plan_year', 2027).maybeSingle();
  if (existing && !force) return json({ recap: existing });

  const [coach, weeks] = await Promise.all([
    db.from('coaching_sessions').select('week_of, generated_notes, transcript_text')
      .eq('agent_id', agentId).gte('week_of', '2026-01-01').order('week_of'),
    db.from('weekly_411').select('week_start_date, wins, challenges, next_steps, notes, priority_1, priority_1_completed, priority_2, priority_2_completed, priority_3, priority_3_completed, priority_4, priority_4_completed')
      .eq('user_id', agentId).gte('week_start_date', '2026-01-01').lte('week_start_date', '2026-12-31').order('week_start_date'),
  ]);

  const lines: string[] = [];
  for (const c of coach.data ?? []) {
    lines.push(`## Coaching session ${c.week_of}\n${clip(c.generated_notes, 3000)}${c.transcript_text && !c.generated_notes ? '\nTranscript excerpt: ' + clip(c.transcript_text, 2000) : ''}`);
  }
  let weekCount = 0;
  for (const w of weeks.data ?? []) {
    const pr = [1, 2, 3, 4].map(i => (w as any)[`priority_${i}`] ? `${(w as any)[`priority_${i}`]} [${(w as any)[`priority_${i}_completed`] ? 'done' : 'not done'}]` : null).filter(Boolean);
    const parts = [
      w.wins && `Wins: ${clip(w.wins, 400)}`,
      w.challenges && `Challenges: ${clip(w.challenges, 400)}`,
      w.next_steps && `Next steps: ${clip(w.next_steps, 300)}`,
      w.notes && `Notes: ${clip(w.notes, 400)}`,
      pr.length && `Priorities: ${pr.join('; ')}`,
    ].filter(Boolean);
    if (parts.length) { weekCount++; lines.push(`## Week of ${w.week_start_date}\n${parts.join('\n')}`); }
  }
  const counts = { coaching_sessions: coach.data?.length ?? 0, weekly_entries: weekCount };

  if (!lines.length) {
    const empty = { wins: '', challenges: '', commitments: '', lead_sources: '' };
    const { data } = await db.from('planning_recaps').upsert({
      agent_id: agentId, org_id: agent.org_id, plan_year: 2027, ...empty, source_counts: counts,
      model: null, generated_by: caller.userId, generated_at: new Date().toISOString(),
    }, { onConflict: 'agent_id,plan_year' }).select().single();
    return json({ recap: data });
  }

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return json({ error: 'AI is not configured' }, 500);

  const system = `You write a short, plain-English 2026 year-in-review draft for a real estate agent, compiled only from their weekly coaching records. Write in second person ("you"). Be specific: name deals, habits and themes that appear in the records. Never invent facts, numbers or clients. If a section has no evidence, write "Not enough in your coaching notes yet." Each section: 3-5 short bullet lines starting with "- ". Return ONLY a JSON object with string keys: wins, challenges, commitments, lead_sources. "commitments" lists commitments made in coaching and whether they stuck (use the done / not done ticks and later notes as evidence).`;
  const prompt = `Agent: ${agent.full_name ?? 'Agent'}\n\n${lines.join('\n\n').slice(0, 60000)}`;

  const res = await fetch('https://ai.gateway.lovable.dev/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'Lovable-API-Key': key,
      'anthropic-version': '2023-06-01', 'X-Lovable-AIG-SDK': 'fetch',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, stream: true, system, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    console.error('gateway', res.status, t);
    const msg = res.status === 402 ? 'AI credits are used up — add credits in Settings → Plans & credits.'
      : res.status === 429 ? 'AI is busy right now — try again in a minute.'
      : `AI request failed (${res.status})`;
    return json({ error: msg }, res.status === 402 || res.status === 429 || res.status === 403 ? res.status : 502);
  }

  // Accumulate the streamed text.
  let text = '';
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(line.slice(5).trim());
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') text += ev.delta.text;
        else if (ev.type === 'error') console.error('ai stream error', JSON.stringify(ev).slice(0, 300));
      } catch { /* ignore keep-alives */ }
    }
  }

  const m = text.match(/\{[\s\S]*\}/);
  let out: Record<string, string> = {};
  try { out = m ? JSON.parse(m[0]) : {}; } catch { out = {}; }
  const pick = (k: string) => (typeof out[k] === 'string' ? out[k] : Array.isArray(out[k]) ? (out[k] as any).map((x: string) => `- ${x}`).join('\n') : '');
  if (!pick('wins') && !pick('challenges')) return json({ error: 'The AI returned an empty recap. Try Regenerate.' }, 502);

  const { data, error } = await db.from('planning_recaps').upsert({
    agent_id: agentId, org_id: agent.org_id, plan_year: 2027,
    wins: pick('wins'), challenges: pick('challenges'), commitments: pick('commitments'), lead_sources: pick('lead_sources'),
    source_counts: counts, model: MODEL, generated_by: caller.userId, generated_at: new Date().toISOString(),
  }, { onConflict: 'agent_id,plan_year' }).select().single();
  if (error) return json({ error: error.message }, 500);
  return json({ recap: data });
});
