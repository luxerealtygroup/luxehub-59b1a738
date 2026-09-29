// Script Boss: AI role-play call practice.
// Actions: start, turn, transcribe, speak, score. All keys stay server-side.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { encode as b64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CLAUDE_MODEL = 'claude-sonnet-4-6';
const GATEWAY = 'https://ai.gateway.lovable.dev';
const STT_MODEL = 'google/gemini-3.5-transcribe';
const TTS_MODEL = 'google/gemini-3.1-flash-tts-preview';

// Cost estimates (USD) used for usage tracking.
const CLAUDE_IN = 3 / 1_000_000;
const CLAUDE_OUT = 15 / 1_000_000;
const STT_PER_SEC = 0.0001;
const TTS_PER_CHAR = 0.00002;

const DEFAULT_INSTRUCTIONS = `You are Script Boss, a real-estate call-practice coach for a team in Waterloo Region, Ontario, Canada.
Coach to Canadian/Ontario norms: CREA and REALTOR.ca, RECO and TRESA rules, Buyer Representation Agreements, Listing Agreements, conditional vs firm offers, land transfer tax, typical Kitchener-Waterloo-Cambridge neighbourhoods and prices in CAD.
Score six skills 0-5: Earn the first 30 seconds, Motivation discovery, Talk less, Objection handling, The ask, Next step locked. Total /30. Grades: A 27+, B 23-26, C 18-22, D 13-17, F below 13.
Magic words to listen for: "Would you be open to...", "What would need to happen...", "Just out of curiosity...", "How would you feel if...", "Most people I talk to...".`;

type Turn = { role: 'agent' | 'client'; text: string; at?: string };

async function logUsage(org: string, user: string, session: string | null, kind: string, units: number, cost: number) {
  await db.from('script_boss_usage').insert({ org_id: org, user_id: user, session_id: session, kind, units, cost_usd: cost });
}

async function claude(system: string, messages: { role: 'user' | 'assistant'; content: string }[], extra: Record<string, unknown> = {}) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('AI is not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 1500, system, messages, ...extra }),
  });
  if (!res.ok) {
    const status = res.status;
    await res.text();
    throw Object.assign(new Error(status === 429 ? 'AI is busy — try again in a moment.' : 'AI request failed'), { status });
  }
  const data = await res.json();
  const cost = (data.usage?.input_tokens ?? 0) * CLAUDE_IN + (data.usage?.output_tokens ?? 0) * CLAUDE_OUT;
  return { data, cost, tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) };
}

const DIFFICULTY: Record<string, string> = {
  Friendly: 'You are warm and fairly open. Offer information when asked well. One mild objection at most.',
  Skeptical: 'You are guarded and doubtful of agents. Give short answers until the agent earns trust. Raise two or three realistic objections.',
  Tough: 'You are busy, blunt and resistant. Try to end the call early. Raise strong objections and only agree to a next step if the agent handles them very well.',
};

function rolePlaySystem(instructions: string, s: { scenario_name: string; custom_situation: string | null; difficulty: string }, scenarioDesc: string) {
  return `${instructions}

--- ROLE-PLAY MODE ---
Right now you are NOT the coach. You are playing the CLIENT on a phone call with a real-estate agent in Waterloo Region, Ontario.
Scenario: ${s.scenario_name}. ${s.custom_situation || scenarioDesc}
Difficulty: ${s.difficulty}. ${DIFFICULTY[s.difficulty] ?? ''}
Invent a believable name, home, neighbourhood and motivation, and stay consistent. Use Canadian spelling and CAD.
Speak naturally like a real person on the phone: 1-3 short sentences per turn, no stage directions, no lists, no coaching, never break character.`;
}

async function loadCtx(userId: string) {
  const { data: profile } = await db.from('profiles').select('org_id').eq('id', userId).maybeSingle();
  const orgId = profile?.org_id as string | undefined;
  if (!orgId) return null;
  const { data: ok } = await db.rpc('can_use_script_boss', { _uid: userId });
  if (!ok) return null;
  return { orgId };
}

async function capReached(orgId: string, userId: string) {
  const { data: t } = await db.from('script_boss_trainees').select('monthly_cap_usd').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  const cap = t?.monthly_cap_usd == null ? null : Number(t.monthly_cap_usd);
  if (cap == null) return false;
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from('script_boss_usage').select('cost_usd').eq('org_id', orgId).eq('user_id', userId).gte('created_at', start.toISOString());
  const spent = (data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0);
  return spent >= cap;
}

async function latestInstructions(orgId: string) {
  const { data } = await db.from('script_boss_instructions').select('version, content').eq('org_id', orgId).order('version', { ascending: false }).limit(1).maybeSingle();
  return data ? { version: data.version as number, content: data.content as string } : { version: 0, content: DEFAULT_INSTRUCTIONS };
}

function toMessages(t: Turn[]) {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: '[The phone rings and you answer.]' }];
  for (const turn of t) {
    const role = turn.role === 'agent' ? 'user' : 'assistant';
    const last = msgs[msgs.length - 1];
    if (last.role === role) last.content += `\n${turn.text}`;
    else msgs.push({ role, content: turn.text });
  }
  return msgs;
}

async function clientReply(orgId: string, userId: string, session: any) {
  const inst = await latestInstructions(orgId);
  const { data: sc } = session.scenario_id
    ? await db.from('script_boss_scenarios').select('description').eq('id', session.scenario_id).maybeSingle()
    : { data: null };
  const { data, cost, tokens } = await claude(rolePlaySystem(inst.content, session, sc?.description ?? ''), toMessages(session.transcript));
  await logUsage(orgId, userId, session.id, 'claude', tokens, cost);
  return (data.content?.[0]?.text ?? '').trim() || '...';
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const { data: u } = await db.auth.getUser(token);
    const userId = u?.user?.id;
    if (!userId) return json({ error: 'Please sign in again.' }, 401);
    const ctx = await loadCtx(userId);
    if (!ctx) return json({ error: "You don't have access to Script Boss." }, 403);
    const { orgId } = ctx;

    // Audio upload (multipart) → transcript
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const sessionId = String(form.get('session_id') ?? '');
      const seconds = Number(form.get('seconds') ?? 0);
      if (!(file instanceof File) || !file.size || file.size > 14_000_000) return json({ error: 'Recording is empty or too long.' }, 400);
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      const out = new FormData();
      out.append('model', STT_MODEL);
      out.append('file', new File([await file.arrayBuffer()], 'speech.webm', { type: file.type.startsWith('audio/') ? file.type.split(';')[0] : 'audio/webm' }));
      out.append('response_format', 'json');
      out.append('language', 'en');
      const res = await fetch(`${GATEWAY}/v1/audio/transcriptions`, {
        method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}` }, body: out,
      });
      if (!res.ok) { const t = await res.text(); console.error('stt', res.status, t.slice(0, 300)); return json({ error: res.status === 402 ? 'AI credits are used up.' : "Couldn't hear that — try again." }, res.status === 402 ? 402 : 502); }
      const data = await res.json();
      await logUsage(orgId, userId, sessionId || null, 'stt', seconds, seconds * STT_PER_SEC);
      return json({ text: (data.text ?? '').trim() });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === 'start') {
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      const { data: sc } = body.scenario_id
        ? await db.from('script_boss_scenarios').select('id, name, is_custom, active, org_id').eq('id', body.scenario_id).maybeSingle()
        : { data: null };
      if (!sc || sc.org_id !== orgId || !sc.active) return json({ error: 'Pick a scenario.' }, 400);
      const custom = String(body.custom_situation ?? '').slice(0, 1500).trim();
      if (sc.is_custom && !custom) return json({ error: 'Describe the situation for a custom scenario.' }, 400);
      const difficulty = ['Friendly', 'Skeptical', 'Tough'].includes(body.difficulty) ? body.difficulty : 'Skeptical';
      const inst = await latestInstructions(orgId);
      const { data: session, error } = await db.from('script_boss_sessions').insert({
        org_id: orgId, user_id: userId, scenario_id: sc.id, scenario_name: sc.name, custom_situation: custom || null,
        difficulty, mode: body.mode === 'text' ? 'text' : 'voice', instructions_version: inst.version,
      }).select('*').single();
      if (error) throw error;
      const reply = await clientReply(orgId, userId, session);
      const transcript: Turn[] = [{ role: 'client', text: reply, at: new Date().toISOString() }];
      await db.from('script_boss_sessions').update({ transcript, updated_at: new Date().toISOString() }).eq('id', session.id);
      return json({ session_id: session.id, reply, transcript });
    }

    const { data: session } = await db.from('script_boss_sessions').select('*').eq('id', body.session_id).maybeSingle();
    if (!session || session.user_id !== userId) return json({ error: 'Session not found.' }, 404);

    if (action === 'turn') {
      if (session.status !== 'active') return json({ error: 'This session has ended.' }, 400);
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      const text = String(body.text ?? '').slice(0, 3000).trim();
      if (!text) return json({ error: 'Say something first.' }, 400);
      session.transcript = [...(session.transcript as Turn[]), { role: 'agent', text, at: new Date().toISOString() }];
      const reply = await clientReply(orgId, userId, session);
      session.transcript.push({ role: 'client', text: reply, at: new Date().toISOString() });
      await db.from('script_boss_sessions').update({ transcript: session.transcript, updated_at: new Date().toISOString() }).eq('id', session.id);
      return json({ reply, transcript: session.transcript });
    }

    if (action === 'speak') {
      const text = String(body.text ?? '').slice(0, 1200).trim();
      if (!text) return json({ error: 'Nothing to say.' }, 400);
      const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: TTS_MODEL,
          contents: [{ role: 'user', parts: [{ text: `Say naturally, like a homeowner on a phone call: ${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
          stream_format: 'audio',
        }),
      });
      if (!res.ok) { const t = await res.text(); console.error('tts', res.status, t.slice(0, 300)); return json({ error: 'Voice unavailable.' }, res.status === 402 ? 402 : 502); }
      const buf = new Uint8Array(await res.arrayBuffer());
      await logUsage(orgId, userId, session.id, 'tts', text.length, text.length * TTS_PER_CHAR);
      return json({ audio: b64(buf), mime: res.headers.get('content-type') || 'audio/wav' });
    }

    if (action === 'score') {
      if (session.status === 'scored') return json({ practice_session_id: session.practice_session_id });
      const t = session.transcript as Turn[];
      const agentTurns = t.filter((x) => x.role === 'agent');
      if (agentTurns.length < 2) return json({ error: 'Have at least two exchanges before scoring.' }, 400);
      const aw = agentTurns.reduce((a, x) => a + words(x.text), 0);
      const cw = t.filter((x) => x.role === 'client').reduce((a, x) => a + words(x.text), 0);
      const agentPct = Math.round((aw / Math.max(1, aw + cw)) * 100);
      const inst = await latestInstructions(orgId);
      const transcriptText = t.map((x) => `${x.role === 'agent' ? 'AGENT' : 'CLIENT'}: ${x.text}`).join('\n');
      const n = { type: 'integer', minimum: 0, maximum: 5 };
      const s = { type: 'string' };
      const tool = {
        name: 'score_call',
        description: 'Record the Script Boss score report for this practice call.',
        input_schema: {
          type: 'object',
          properties: {
            earn_30_seconds: n, motivation_discovery: n, talk_less_ratio: n, objection_handling: n, the_ask: n, next_step_locked: n,
            grade: s, appointment_set: { type: 'boolean' }, strongest_moment: s, costliest_moment: s, structure_covered: s,
            magic_words_used: s, magic_words_missed: s, one_thing_to_change: s, drill_again: s, coach_note: s,
          },
          required: ['earn_30_seconds', 'motivation_discovery', 'talk_less_ratio', 'objection_handling', 'the_ask', 'next_step_locked', 'grade', 'appointment_set', 'strongest_moment', 'costliest_moment', 'magic_words_used', 'magic_words_missed', 'one_thing_to_change', 'drill_again', 'coach_note'],
        },
      };
      const { data, cost, tokens } = await claude(
        `${inst.content}\n\n--- SCORING MODE ---\nYou are the coach. Score the agent's practice call strictly using the rubric above. Quote the agent's actual words in strongest/costliest moments. Measured agent talk share: ${agentPct}% of words (aim for under 40%); weigh this heavily for "Talk less". Be specific, honest and brief.`,
        [{ role: 'user', content: `Scenario: ${session.scenario_name}${session.custom_situation ? ` — ${session.custom_situation}` : ''}\nDifficulty: ${session.difficulty}\n\nTRANSCRIPT:\n${transcriptText}` }],
        { tools: [tool], tool_choice: { type: 'tool', name: 'score_call' } },
      );
      await logUsage(orgId, userId, session.id, 'claude', tokens, cost);
      const r = data.content?.find((c: any) => c.type === 'tool_use')?.input;
      if (!r) return json({ error: 'Scoring failed — try again.' }, 502);
      const clamp = (v: unknown) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));
      const scores = {
        earn_30_seconds: clamp(r.earn_30_seconds), motivation_discovery: clamp(r.motivation_discovery), talk_less_ratio: clamp(r.talk_less_ratio),
        objection_handling: clamp(r.objection_handling), the_ask: clamp(r.the_ask), next_step_locked: clamp(r.next_step_locked),
      };
      const total = Object.values(scores).reduce((a, b) => a + b, 0);
      const ended = new Date();
      const duration = Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 1000);
      const report = [
        `Scenario: ${session.scenario_name} (${session.difficulty})`, `Mode: Live – ${session.mode}`, `Exchanges: ${agentTurns.length}`,
        ...Object.entries(scores).map(([k, v]) => `${k}: ${v}/5`), `Total: ${total}/30`, `Grade: ${r.grade}`,
        `Appointment set: ${r.appointment_set ? 'Yes' : 'No'}`, `Agent talk share: ${agentPct}%`,
        `Strongest moment: ${r.strongest_moment}`, `Costliest moment: ${r.costliest_moment}`,
        `Magic words used: ${r.magic_words_used}`, `Magic words missed: ${r.magic_words_missed}`,
        `One thing to change: ${r.one_thing_to_change}`, `Drill again: ${r.drill_again}`, `Coach note: ${r.coach_note}`,
      ].join('\n');
      const { data: ps, error } = await db.from('practice_sessions').insert({
        user_id: userId, org_id: orgId, scenario: `${session.scenario_name} (${session.difficulty})`, mode: `Live – ${session.mode}`,
        exchanges: agentTurns.length, ...scores, total, grade: String(r.grade).slice(0, 3), appointment_set: !!r.appointment_set,
        strongest_moment: r.strongest_moment, costliest_moment: r.costliest_moment, structure_covered: r.structure_covered ?? null,
        magic_words_used: r.magic_words_used, magic_words_missed: r.magic_words_missed, one_thing_to_change: r.one_thing_to_change,
        drill_again: r.drill_again, coach_note: r.coach_note, raw_report: report, source: `script_boss_${session.mode}`,
        transcript: t, agent_talk_pct: agentPct, duration_seconds: duration, script_boss_session_id: session.id,
      }).select('id').single();
      if (error) throw error;
      await db.from('script_boss_sessions').update({ status: 'scored', practice_session_id: ps.id, ended_at: ended.toISOString(), updated_at: ended.toISOString() }).eq('id', session.id);
      return json({ practice_session_id: ps.id });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status;
    console.error('script-boss error', e instanceof Error ? e.message : 'unknown');
    return json({ error: e instanceof Error ? e.message : 'Something went wrong' }, status === 429 ? 429 : 500);
  }
});
