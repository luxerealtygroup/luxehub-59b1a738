// Script Boss: AI role-play call practice.
// The owner's instructions (latest saved version) are the base system prompt.
// APP_LAYER is a separate, app-level prompt layered on top; it never edits them.
// Actions: start, turn, rewind, speak, score, review, (multipart) transcribe.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CLAUDE_MODEL = 'claude-sonnet-4-6'; // scoring + clinic
const ROLEPLAY_MODEL = 'claude-haiku-4-5'; // in-character drill lines: faster replies
const GATEWAY = 'https://ai.gateway.lovable.dev';
const STT_MODEL = 'google/gemini-3.5-transcribe';
const TTS_MODEL = 'google/gemini-3.1-flash-tts-preview';

const CLAUDE_IN = 3 / 1_000_000;
const CLAUDE_OUT = 15 / 1_000_000;
const STT_PER_SEC = 0.0001;
const TTS_PER_CHAR = 0.00002;
// Haiku 4.5 list prices (per token) incl. prompt-cache reads/writes.
const HAIKU = { in: 1e-6, out: 5e-6, cacheRead: 0.1e-6, cacheWrite: 1.25e-6 };
// Deepgram Nova-3 streaming, regular (non-promo) price per minute.
const DG_STT_PER_MIN = 0.0077;

const DEFAULT_INSTRUCTIONS = `You are Script Boss, a real-estate call-practice coach for a team in Waterloo Region, Ontario. Grade six skills 1-5: Earn the 30 seconds, Motivation discovery, Talk-less ratio, Objection handling, The ask, Next step locked.`;

const CHANNELS: Record<string, string> = {
  phone: 'Phone call. Speak like a real person on the phone; answer the way someone answers an unknown number.',
  text: 'Text thread. Write like a real person texting: short, casual, sometimes lowercase, occasionally slow or one-word.',
  face: 'Face to face (e.g. at the open house or a meeting). Speak naturally in person.',
};

/** App-level rules layered on top of the owner's instructions. */
function appLayer(opts: { mode: string; scenario?: string; channel?: string; custom?: string | null; agentName: string }) {
  const base = `--- LUXEHUB APP LAYER (rules for how this app runs; the coaching instructions above still govern coaching and grading) ---
You are running inside LUXEhub's Script Boss screen. The agent (${opts.agentName}) has already chosen the mode, scenario and channel on the start screen, so do NOT ask which mode, and do NOT send a confirmation message — start immediately.
 The app speaks your replies out loud and transcribes the agent's speech, so the drill is already being run out loud. As the client, sound like a normal, polite Ontario homeowner or buyer: friendly but busy — never curt, rude or dismissive. Usually 1–3 sentences, no monologues, markdown, lists or headings. When the agent asks a good open question, share real, usable detail (motivation, timeline, family or work situation, what you liked or didn't like, price expectations). Reveal more as rapport builds; give less when the agent pitches or talks too much. Objections stay realistic and the coaching instructions' difficulty still applies, but default to warm and cooperative unless the scenario is a Hard mode one.
When you play the client, speak dialogue ONLY: never write stage directions, actions, tone or sound cues — nothing in [brackets], (parentheses) or *asterisks* (no "*sighs*", "(pauses)", "[laughs]"). Show hesitation or mood through the words themselves.
PAUSE, REWIND and END are handled by the app with buttons and spoken commands. A message beginning with "[PAUSE]" is the agent stepping out of the roleplay: answer as the coach, briefly, then stop. The next message without "[PAUSE]" means step back into character exactly where you left off.
Never build a scenario around renters or a rental transaction.
Difficulty is realistic and escalating, exactly as the instructions describe; there is no separate difficulty setting.`;
  if (opts.mode === 'clinic') {
    return `${base}\nMODE: CLINIC — no roleplay. Build language with the agent for the situation they bring, in their own words, then drill it. You may use short paragraphs here.`;
  }
  return `${base}
MODE: DRILL. You are the lead. Invent a specific person (name, situation, reason to be guarded) and stay consistent. Never narrate or set the scene. Your first line is the lead's first line.
Scenario: ${opts.scenario}${opts.custom ? ` — ${opts.custom}` : ''}
Channel: ${CHANNELS[opts.channel ?? 'phone'] ?? CHANNELS.phone}`;
}

type Turn = { role: 'agent' | 'client' | 'coach'; text: string; at?: string; paused?: boolean };
type Timing = { turn: number; seconds: number; words: number; wpm: number; trailing_silence_ms: number | null; question: boolean };

async function logUsage(org: string, user: string, session: string | null, kind: string, units: number, cost: number) {
  await db.from('script_boss_usage').insert({ org_id: org, user_id: user, session_id: session, kind, units, cost_usd: cost });
}

const VOICES = ['Kore', 'Aoede', 'Leda', 'Zephyr', 'Puck', 'Charon', 'Orus', 'Fenrir'];
const PACES: Record<string, string> = {
  relaxed: 'at a relaxed, unhurried pace',
  natural: 'at a natural conversational pace',
  brisk: 'at a brisk, slightly quick pace',
};

/** Streams 24 kHz PCM speech as SSE from the gateway (first audio in ~0.6-0.7s). */
async function ttsStream(text: string, opts: { voice?: string; pace?: string; style?: string; coach?: boolean }) {
  const clean = text.replace(/\*[^*]+\*/g, '').replace(/[#_`>]/g, '').slice(0, 1500).trim();
  const voice = VOICES.includes(opts.voice ?? '') ? opts.voice! : 'Charon';
  const pace = PACES[opts.pace ?? ''] ?? PACES.brisk;
  const style = opts.coach
    ? `In a neutral Canadian English accent, say warmly and directly like a coach, ${pace}`
    : opts.style === 'expressive'
      ? `In a neutral Canadian English accent, say naturally and conversationally like a person on a call, ${pace}`
      : `In a neutral Canadian English accent, speak in a plain, steady, matter-of-fact voice like a busy Ontario homeowner on the phone, ${pace}. Low expressiveness, even delivery, no acting, dramatic sighs, stretched words, or long pauses`;
  const res = await fetch(`${GATEWAY}/v1/audio/speech`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TTS_MODEL,
      contents: [{ role: 'user', parts: [{ text: `${style}: ${clean || '...'}` }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      stream_format: 'sse',
    }),
  });
  return { res, chars: clean.length, rate: TTS_PER_CHAR };
}

/** SSE response: one app event first (reply + transcript), then the gateway's audio events piped through. */
function sseReply(first: Record<string, unknown> | null, text: string | null, opts: { voice?: string; pace?: string; style?: string; coach?: boolean }, onChars: (n: number, rate?: number) => void) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      if (first) send({ type: 'reply', ...first });
      if (!text) { send({ type: 'speech.audio.done' }); c.close(); return; }
      try {
        const t0 = Date.now();
        const { res, chars } = await ttsStream(text, opts);
        if (!res.ok || !res.body) {
          const t = await res.text();
          console.error('tts', res.status, t.slice(0, 300));
          send({ type: 'error', status: res.status, message: res.status === 402 ? 'AI credits are used up.' : 'Voice unavailable.' });
        } else {
          send({ type: 'tts_start', ms: Date.now() - t0 });
          const reader = res.body.getReader();
          while (true) { const n = await reader.read(); if (n.done) break; c.enqueue(n.value); }
          onChars(chars);
        }
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Voice unavailable.' });
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

async function claude(system: string, messages: { role: 'user' | 'assistant'; content: string }[], extra: Record<string, unknown> = {}) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('AI is not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    // Cache the long instructions so each turn starts faster and costs less.
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2000, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages, ...extra }),
  });
  if (!res.ok) {
    const status = res.status;
    await res.text();
    throw Object.assign(new Error(status === 429 ? 'AI is busy — try again in a moment.' : 'AI request failed'), { status });
  }
  const data = await res.json();
  const f = extra.model === ROLEPLAY_MODEL ? 1 / 3 : 1; // Haiku is ~1/3 of Sonnet's price
  const cost = ((data.usage?.input_tokens ?? 0) * CLAUDE_IN + (data.usage?.output_tokens ?? 0) * CLAUDE_OUT) * f;
  return { data, cost, tokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) };
}

// Short per-instance cache so repeat drill turns skip lookups that don't change mid-drill.
const memo = new Map<string, { at: number; v: Promise<unknown> }>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v as Promise<T>;
  const v = fn(); memo.set(key, { at: Date.now(), v });
  v.catch(() => memo.delete(key));
  if (memo.size > 500) for (const [k, e] of memo) if (Date.now() - e.at > 120000) memo.delete(k);
  return v;
}

async function loadCtx(userId: string) {
  const [{ data: profile }, { data: ok }] = await Promise.all([
    db.from('profiles').select('org_id, full_name').eq('id', userId).maybeSingle(),
    db.rpc('can_use_script_boss', { _uid: userId }),
  ]);
  const orgId = profile?.org_id as string | undefined;
  if (!orgId || !ok) return null;
  return { orgId, name: (profile?.full_name as string) || 'Agent' };
}

async function capReached(orgId: string, userId: string) {
  const { data: t } = await db.from('script_boss_trainees').select('monthly_cap_usd').eq('org_id', orgId).eq('user_id', userId).maybeSingle();
  const cap = t?.monthly_cap_usd == null ? null : Number(t.monthly_cap_usd);
  if (cap == null) return false;
  const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const { data } = await db.from('script_boss_usage').select('cost_usd').eq('org_id', orgId).eq('user_id', userId).gte('created_at', start.toISOString());
  return (data ?? []).reduce((a, r) => a + Number(r.cost_usd), 0) >= cap;
}

async function latestInstructions(orgId: string) {
  const { data } = await db.from('script_boss_instructions').select('version, content').eq('org_id', orgId).order('version', { ascending: false }).limit(1).maybeSingle();
  return data ? { version: data.version as number, content: data.content as string } : { version: 0, content: DEFAULT_INSTRUCTIONS };
}

function toMessages(t: Turn[], opener: string) {
  const msgs: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'user', content: opener }];
  for (const turn of t) {
    const role = turn.role === 'agent' ? 'user' : 'assistant';
    const text = turn.role === 'agent' && turn.paused ? `[PAUSE] ${turn.text}` : turn.role === 'coach' ? `(coach, out of character) ${turn.text}` : turn.text;
    const last = msgs[msgs.length - 1];
    if (last.role === role) last.content += `\n${text}`;
    else msgs.push({ role, content: text });
  }
  if (msgs[msgs.length - 1].role === 'assistant') msgs.push({ role: 'user', content: '[continue]' });
  return msgs;
}

async function sessionSystem(orgId: string, session: any, agentName: string) {
  const [inst, scRes, lvRes] = await Promise.all([
    latestInstructions(orgId),
    session.scenario_id ? db.from('script_boss_scenarios').select('number, name, description, category').eq('id', session.scenario_id).maybeSingle() : Promise.resolve({ data: null }),
    session.level ? db.from('script_levels').select('level, name, persona_prompt').eq('org_id', orgId).eq('level', session.level).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let scenario = session.scenario_name;
  const sc = scRes.data as any;
  if (sc && sc.number && sc.number < 99) scenario = `#${sc.number} (${sc.category}) ${sc.name}: ${sc.description}`;
  const lv = lvRes.data as any;
  // The level sets the lead's warmth or hostility; it overrides the default "warm and cooperative" tone above.
  const levelLayer = session.practice_mode !== 'clinic' && lv?.persona_prompt
    ? `\nLEAD TEMPERATURE — this overrides the default tone above: ${lv.persona_prompt}` : '';
  return `${inst.content}\n\n${appLayer({ mode: session.practice_mode, scenario, channel: session.channel, custom: session.custom_situation, agentName })}${levelLayer}`;
}

function openerFor(session: any) {
  return session.practice_mode === 'clinic'
    ? '[The agent opened a CLINIC session. Greet them in one line and ask what situation they keep fumbling.]'
    : session.channel === 'text' ? '[The agent is about to text you. Wait — reply only to what they send.]' : session.channel === 'face'
      ? '[The agent approaches you. React as the lead would in person.]' : '[Your phone rings from an unknown number and you answer.]';
}

async function modelReply(orgId: string, userId: string, session: any, agentName: string) {
  const fast = session.practice_mode === 'drill' && !session.transcript.at(-1)?.paused;
  const { data, cost, tokens } = await claude(await sessionSystem(orgId, session, agentName), toMessages(session.transcript, openerFor(session)), fast ? { model: ROLEPLAY_MODEL, max_tokens: 400 } : {});
  await logUsage(orgId, userId, session.id, 'claude', tokens, cost);
  return (data.content?.[0]?.text ?? '').trim() || '...';
}

/** Streams Haiku's in-character reply token by token (instructions prompt-cached). */
async function claudeStream(system: string, messages: { role: 'user' | 'assistant'; content: string }[], onText: (t: string) => void) {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new Error('AI is not configured');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: ROLEPLAY_MODEL, max_tokens: 400, stream: true, system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages }),
  });
  if (!res.ok || !res.body) {
    const status = res.status; const errText = await res.text().catch(() => '');
    console.error('claude stream', status, errText.slice(0, 300));
    throw Object.assign(new Error(status === 429 ? 'AI is busy — try again in a moment.' : 'AI request failed'), { status });
  }
  const u = { input: 0, output: 0, cr: 0, cw: 0 };
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  while (true) {
    const n = await reader.read();
    if (n.done) break;
    buf += n.value;
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = block.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev: any; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === 'message_start') {
        const m = ev.message?.usage ?? {};
        u.input = m.input_tokens ?? 0; u.cr = m.cache_read_input_tokens ?? 0; u.cw = m.cache_creation_input_tokens ?? 0; u.output = m.output_tokens ?? 0;
      } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') onText(ev.delta.text);
      else if (ev.type === 'message_delta' && ev.usage) u.output = ev.usage.output_tokens ?? u.output;
      else if (ev.type === 'error') { console.error('claude stream event', JSON.stringify(ev.error ?? ev).slice(0, 300)); throw new Error('AI request failed'); }
    }
  }
  const cost = u.input * HAIKU.in + u.cr * HAIKU.cacheRead + u.cw * HAIKU.cacheWrite + u.output * HAIKU.out;
  return { cost, tokens: u.input + u.cr + u.cw + u.output, cacheRead: u.cr };
}

/** Stage directions — [..], (..), *..* — are never spoken or shown. */
function stripStage(s: string, final: boolean) {
  let out = s.replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ').replace(/\*[^*]*\*/g, ' ');
  if (final) out = out.replace(/[[(][^\])]*$/, ' ').replace(/\*[^*]*$/, ' ');
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?…])/g, '$1').replace(/^\s*[.,]\s*/, '').trimStart().replace(final ? /\s+$/ : /$^/, '');
}
function hasOpenStage(s: string) {
  return (s.match(/\[/g)?.length ?? 0) > (s.match(/\]/g)?.length ?? 0)
    || (s.match(/\(/g)?.length ?? 0) > (s.match(/\)/g)?.length ?? 0)
    || (s.match(/\*/g)?.length ?? 0) % 2 === 1;
}


/**
 * Live reply: Claude streams text; each finished sentence is sent to the voice
 * immediately (in parallel), and audio is piped back in order. Line text is
 * sent right before its audio, so the transcript appears as it's spoken.
 */
function streamSpokenReply(opts: {
  system: string; messages: { role: 'user' | 'assistant'; content: string }[];
  voice?: string; pace?: string; style?: string; first?: Record<string, unknown>;
  finish: (reply: string, timing: Record<string, number>) => Promise<Record<string, unknown>>;
  onClaude: (tokens: number, cost: number) => void; onChars: (n: number) => void;
}) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      if (opts.first) send({ type: 'reply', ...opts.first });
      const t0 = Date.now();
      let firstTokenMs = 0, firstSentenceMs = 0, firstAudioMs = 0;
      let pending = '', full = '', ttsError = false;
      let chain: Promise<void> = Promise.resolve();
      const speakSentence = (s: string) => {
        const text = s.trim(); if (!text) return;
        if (!firstSentenceMs) firstSentenceMs = Date.now() - t0;
        const tts = ttsStream(text, { voice: opts.voice, pace: opts.pace, style: opts.style }).catch(() => null); // starts now, in parallel
        chain = chain.then(async () => {
          send({ type: 'line', text });
          const r = await tts;
          if (!r || !r.res.ok || !r.res.body) {
            if (r) console.error('tts', r.res.status);
            if (!ttsError) { ttsError = true; send({ type: 'error', status: r?.res.status, message: r?.res.status === 402 ? 'AI credits are used up.' : 'Voice unavailable.' }); }
            return;
          }
          if (!firstAudioMs) firstAudioMs = Date.now() - t0;
          // Re-emit whole SSE events so our own events never split an audio event.
          const reader = r.res.body.pipeThrough(new TextDecoderStream()).getReader();
          let b = '';
          while (true) {
            const n = await reader.read(); if (n.done) break;
            b += n.value;
            let i; while ((i = b.indexOf('\n\n')) >= 0) {
              const ev = b.slice(0, i); b = b.slice(i + 2);
              if (ev.includes('speech.audio.delta')) c.enqueue(enc.encode(`${ev}\n\n`));
            }
          }
          opts.onChars(r.chars);
        });
      };
      // First chunk may be short so the voice starts quickly; later ones wait for a full sentence.
      const flush = (force: boolean) => {
        // Never split inside an unfinished [..], (..) or *..* — wait until it closes, then drop it.
        if (!force && hasOpenStage(pending)) return;
        pending = stripStage(pending, false);
        while (true) {
          let m = pending.match(/^([\s\S]*?[.!?…]+["'”’]*)(\s+)/);
          // Before any audio has started, speak the first clause (comma/dash) so the voice begins sooner.
          if (!firstSentenceMs) {
            const c = pending.match(/^([\s\S]{12,}?[,;:—–]+)(\s+)/);
            if (c && (!m || c[0].length < m[0].length)) m = c;
          }
          if (!m) break;
          if (m[1].trim().length < (firstSentenceMs ? 25 : 6) && pending.length < 200) {
            // keep merging tiny sentences with the next one
            const next = pending.slice(m[0].length).match(/^([\s\S]*?[.!?…]+["'”’]*)(\s+)/);
            if (!next) break;
            const merged = m[0] + next[0];
            speakSentence(merged); pending = pending.slice(merged.length); continue;
          }
          speakSentence(m[1]); pending = pending.slice(m[0].length);
        }
        if (force) { pending = stripStage(pending, true); if (pending.trim()) speakSentence(pending); pending = ''; }
      };
      try {
        const { cost, tokens } = await claudeStream(opts.system, opts.messages, (t) => {
          if (!firstTokenMs) firstTokenMs = Date.now() - t0;
          full += t; pending += t; flush(false);
        });
        flush(true);
        opts.onClaude(tokens, cost);
        await chain;
        const reply = stripStage(full, true) || '...';
        const payload = await opts.finish(reply, { first_token_ms: firstTokenMs, first_sentence_ms: firstSentenceMs, first_audio_ms: firstAudioMs, total_ms: Date.now() - t0 });
        send({ type: 'reply', ...payload });
      } catch (e) {
        await chain.catch(() => {});
        send({ type: 'error', message: e instanceof Error ? e.message : 'AI request failed' });
      }
      c.close();
    },
  });
  return new Response(stream, { headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const gradeFor = (t: number) => (t >= 27 ? 'A' : t >= 23 ? 'B' : t >= 18 ? 'C' : t >= 13 ? 'D' : 'F');
const SKILLS = ['earn_30_seconds', 'motivation_discovery', 'talk_less_ratio', 'objection_handling', 'the_ask', 'next_step_locked'] as const;
const SKILL_LABEL: Record<string, string> = {
  earn_30_seconds: 'Earn the 30 seconds', motivation_discovery: 'Motivation discovery', talk_less_ratio: 'Talk-less ratio',
  objection_handling: 'Objection handling', the_ask: 'The ask', next_step_locked: 'Next step locked',
};

/** Enforce the hard rule: no specific appointment asked → total ≤ 17. Lowers the highest scores first. */
function applyHardRule(scores: Record<string, number>, askedForAppointment: boolean) {
  const out = { ...scores };
  if (askedForAppointment) return out;
  let total = SKILLS.reduce((a, k) => a + out[k], 0);
  while (total > 17) {
    const k = [...SKILLS].sort((a, b) => out[b] - out[a])[0];
    if (out[k] <= 1) break;
    out[k] -= 1; total -= 1;
  }
  return out;
}

async function cadence(userId: string) {
  const since = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const { data } = await db.from('practice_sessions').select('session_date').eq('user_id', userId).gte('session_date', since);
  const weeks = [0, 0, 0, 0];
  for (const r of data ?? []) {
    const days = Math.floor((Date.now() - new Date(r.session_date as string).getTime()) / 86400000);
    const w = Math.min(3, Math.floor(days / 7));
    weeks[w]++;
  }
  const days = new Set((data ?? []).map((r) => r.session_date)).size;
  return `Practice cadence (from LUXEhub, including this session not yet saved): ${weeks[0]} sessions in the last 7 days; previous weeks ${weeks[1]}, ${weeks[2]}, ${weeks[3]}; practised on ${days} different days in the last 28.`;
}

function deliverySummary(transcript: Turn[], timing: Timing[]) {
  const rp = transcript.filter((t) => !t.paused && t.role !== 'coach');
  const aw = rp.filter((t) => t.role === 'agent').reduce((a, t) => a + words(t.text), 0);
  const cw = rp.filter((t) => t.role === 'client').reduce((a, t) => a + words(t.text), 0);
  const agentPct = Math.round((aw / Math.max(1, aw + cw)) * 100);
  const spoken = timing.filter((t) => t.seconds > 0);
  const wpm = spoken.length ? Math.round(spoken.reduce((a, t) => a + t.words, 0) / (spoken.reduce((a, t) => a + t.seconds, 0) / 60)) : null;
  const qs = spoken.filter((t) => t.question && t.trailing_silence_ms != null);
  const pause = qs.length ? Math.round(qs.reduce((a, t) => a + (t.trailing_silence_ms ?? 0), 0) / qs.length) : null;
  return { agent_talk_pct: agentPct, agent_words: aw, client_words: cw, wpm, avg_pause_after_question_ms: pause, spoken_turns: spoken.length };
}

function reportText(r: any, meta: { agent: string; date: string; scenario: string; mode: string; exchanges: number; levelLine?: string | null }) {
  const line = (label: string, v: number) => `${label.padEnd(24)}${v}/5`;
  return [
    'LUXE PRACTICE REPORT', `Agent: ${meta.agent}`, `Date: ${meta.date}`, `Scenario: ${meta.scenario}`, `Mode: ${meta.mode}`, `Exchanges: ${meta.exchanges}`,
    ...(meta.levelLine ? [meta.levelLine] : []), '',
    ...SKILLS.map((k) => line(SKILL_LABEL[k], r[k])), `${'TOTAL'.padEnd(24)}${r.total}/30`, `GRADE: ${r.grade}`, '',
    `Would this call have produced an appointment?  ${r.appointment_set ? 'Yes' : 'No'}`, '',
    `Strongest moment:  ${r.strongest_moment}`, `Costliest moment:  ${r.costliest_moment}`, `Structure covered:  ${r.structure_covered}`,
    `Magic words used: ${r.magic_words_used}`, `Magic words missed: ${r.magic_words_missed}`, `One thing to change next time: ${r.one_thing_to_change}`,
    `Drill this again: ${r.drill_again}`, `Coach's note to Kristen: ${r.coach_note}`,
  ].join('\n');
}

// ---------------- Levels ----------------
type LevelCfg = { level: number; name: string; pass_pct: number; passes_required: number; persona_prompt: string; grading_notes: string };
const DEFAULT_LEVEL_NAMES = ['Warm', 'Lukewarm', 'Real objections', 'Price and tough negotiation', 'Brutal'];
async function levelCfg(orgId: string, level: number): Promise<LevelCfg> {
  const { data } = await db.from('script_levels').select('level, name, pass_pct, passes_required, persona_prompt, grading_notes').eq('org_id', orgId).eq('level', level).maybeSingle();
  return (data as LevelCfg) ?? { level, name: DEFAULT_LEVEL_NAMES[level - 1], pass_pct: 80, passes_required: 3, persona_prompt: '', grading_notes: '' };
}
async function currentLevel(userId: string) {
  const { data } = await db.from('level_unlocks').select('level').eq('agent_id', userId).order('level', { ascending: false }).limit(1).maybeSingle();
  return Math.max(1, Number(data?.level ?? 1));
}
/** Unlock the next level after enough graded passing drills at the agent's current level. Counts are derived, never stored. */
async function maybeUnlock(orgId: string, userId: string, level: number) {
  const cur = await currentLevel(userId);
  if (level !== cur || cur >= 5) return null;
  const cfg = await levelCfg(orgId, cur);
  const { count } = await db.from('practice_sessions').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('level', cur).eq('passed', true).eq('practice_mode', 'drill');
  if ((count ?? 0) < cfg.passes_required) return null;
  const { error } = await db.from('level_unlocks').insert({ org_id: orgId, agent_id: userId, level: cur + 1, unlocked_by: 'system' });
  if (error && !String(error.message).includes('duplicate')) throw error;
  const next = await levelCfg(orgId, cur + 1);
  return { level: cur + 1, name: next.name };
}

async function gradeAndSave(ctx: { orgId: string; name: string }, userId: string, opts: {
  transcriptText: string; transcript: Turn[] | null; scenario: string; mode: string; channel: string | null; practiceMode: string;
  exchanges: number; delivery: Record<string, unknown> | null; sessionId: string | null; durationSeconds: number | null; source: string;
  level?: number | null;
}) {
  const inst = await latestInstructions(ctx.orgId);
  const lv = opts.level ? await levelCfg(ctx.orgId, opts.level) : null;
  const n = { type: 'integer', minimum: 1, maximum: 5 };
  const s = { type: 'string' };
  const tool = {
    name: 'luxe_practice_report',
    description: 'Record the LUXE PRACTICE REPORT, field by field, exactly as the instructions define it.',
    input_schema: {
      type: 'object',
      properties: {
        ...Object.fromEntries(SKILLS.map((k) => [k, n])),
        asked_for_specific_appointment: { type: 'boolean', description: 'Did the agent ask, out loud, for a specific appointment with a day/time?' },
        appointment_set: { type: 'boolean', description: 'Would this call have produced an appointment?' },
        strongest_moment: { type: 'string', description: 'Quote what the agent said, in double quotes, then why.' },
        costliest_moment: { type: 'string', description: 'Quote what the agent said, in double quotes, then why.' },
        structure_covered: { type: 'string', description: 'A L P T M A M A with missed letters marked, e.g. "A L P T M A M A — covered: A, L, M; missed: P, T, A (agency), M (mortgage), A (ask again)". For sellers use the provisional seller sequence and say so.' },
        magic_words_used: s, magic_words_missed: s,
        one_thing_to_change: s, drill_again: s,
        coach_note: { type: 'string', description: "Coach's note to Kristen: exactly ONE honest sentence (max ~30 words), no greeting — what she should know that the scores don't show." },
        word_patterns_note: { type: 'string', description: 'The unscored line: word-choice pattern used well, and one sitting there unused.' },
      },
      required: [...SKILLS, 'asked_for_specific_appointment', 'appointment_set', 'strongest_moment', 'costliest_moment', 'structure_covered', 'magic_words_used', 'magic_words_missed', 'one_thing_to_change', 'drill_again', 'coach_note', 'word_patterns_note'],
    },
  };
  const d = opts.delivery;
  const deliveryText = d
    ? `Delivery data measured by the app: agent ${d.agent_talk_pct}% of words vs lead ${100 - Number(d.agent_talk_pct)}% (${d.agent_words} vs ${d.client_words} words).${d.wpm ? ` Speaking pace ≈ ${d.wpm} words per minute across ${d.spoken_turns} spoken turns.` : ' No spoken audio timing (typed or pasted).'}${d.avg_pause_after_question_ms != null ? ` Average silence held after asking a question ≈ ${(Number(d.avg_pause_after_question_ms) / 1000).toFixed(1)}s.` : ''} Tone and inflection are partly inferred from the transcript and these numbers — say so if you comment on them.`
    : '';
  const levelText = lv ? `\nLEVEL ${lv.level} (${lv.name}) — stricter expectations for this level, on top of the six standards: ${lv.grading_notes}` : '';
  const { data, cost, tokens } = await claude(
    `${inst.content}\n\n--- LUXEHUB APP LAYER: SCORING ---\nThe session has ENDED. Grade it now using the six standards, 1-5 each, strictly, and fill in the LUXE PRACTICE REPORT fields with the luxe_practice_report tool. The app computes the total, the grade bands, and enforces the hard rule (no specific appointment asked → max 17/30). Lines marked [PAUSE] or (coach) are out-of-character and are not part of the call.${levelText}\n${deliveryText}\n${await cadence(userId)} Comment on cadence in the one thing to change or coach's note if it matters.`,
    [{ role: 'user', content: `Mode: ${opts.mode}\nScenario: ${opts.scenario}\nChannel: ${opts.channel ?? 'unknown'}\n\nTRANSCRIPT:\n${opts.transcriptText}` }],
    { tools: [tool], tool_choice: { type: 'tool', name: 'luxe_practice_report' } },
  );
  await logUsage(ctx.orgId, userId, opts.sessionId, 'claude', tokens, cost);
  const r = data.content?.find((c: any) => c.type === 'tool_use')?.input;
  if (!r) throw Object.assign(new Error('Scoring failed — try again.'), { status: 502 });
  const clamp = (v: unknown) => Math.max(1, Math.min(5, Math.round(Number(v) || 1)));
  const raw = Object.fromEntries(SKILLS.map((k) => [k, clamp(r[k])])) as Record<string, number>;
  const asked = !!r.asked_for_specific_appointment;
  const scores = applyHardRule(raw, asked);
  const total = SKILLS.reduce((a, k) => a + scores[k], 0);
  const grade = gradeFor(total);
  const appointment = asked ? !!r.appointment_set : false;
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const scorePct = Math.round((total / 30) * 100);
  // Levels: only graded live drills count. The no-appointment cap (17/30 = 57%) already applies to the score.
  const passed = lv && opts.practiceMode === 'drill' ? scorePct >= lv.pass_pct : null;
  const levelLine = lv ? `Level: ${lv.level} — ${lv.name} · ${scorePct}% · ${passed ? `Counted as a pass (${lv.pass_pct}%+)` : `Not a pass (needs ${lv.pass_pct}%+)`}` : null;
  const full = { ...r, ...scores, total, grade, appointment_set: appointment,
    one_thing_to_change: `${r.one_thing_to_change}${r.word_patterns_note ? ` (Word choice: ${r.word_patterns_note})` : ''}` };
  const report = reportText(full, { agent: ctx.name, date, scenario: opts.scenario, mode: opts.mode, exchanges: opts.exchanges, levelLine });
  const { data: ps, error } = await db.from('practice_sessions').insert({
    user_id: userId, org_id: ctx.orgId, session_date: date, scenario: opts.scenario, mode: opts.mode, exchanges: opts.exchanges,
    ...scores, total, grade, appointment_set: appointment,
    strongest_moment: r.strongest_moment, costliest_moment: r.costliest_moment, structure_covered: r.structure_covered,
    magic_words_used: r.magic_words_used, magic_words_missed: r.magic_words_missed, one_thing_to_change: full.one_thing_to_change,
    drill_again: r.drill_again, coach_note: r.coach_note, raw_report: report, source: opts.source,
    transcript: opts.transcript ?? [{ role: 'agent', text: opts.transcriptText }], agent_talk_pct: d?.agent_talk_pct ?? null,
    duration_seconds: opts.durationSeconds, script_boss_session_id: opts.sessionId, practice_mode: opts.practiceMode,
    channel: opts.channel, delivery: { ...(d ?? {}), hard_rule_applied: !asked && SKILLS.reduce((a, k) => a + raw[k], 0) > 17 },
    level: lv ? lv.level : null, score_pct: lv ? scorePct : null, passed,
  }).select('id').single();
  if (error) throw error;
  return ps.id as string;
}

const DG_LISTEN = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=en&encoding=linear16&sample_rate=16000&channels=1'
  + '&interim_results=true&smart_format=true&punctuate=true&endpointing=200&utterance_end_ms=1000&vad_events=true';

/** Live transcription relay: browser ⇄ this function ⇄ Deepgram. The key stays here. */
async function liveRelay(req: Request) {
  const url = new URL(req.url);
  const { data: u } = await db.auth.getUser(url.searchParams.get('access_token') ?? '');
  const userId = u?.user?.id;
  if (!userId) return new Response('unauthorized', { status: 401 });
  const ctx = await loadCtx(userId);
  if (!ctx) return new Response('forbidden', { status: 403 });
  if (await capReached(ctx.orgId, userId)) return new Response('limit', { status: 402 });
  const key = Deno.env.get('DEEPGRAM_API_KEY');
  if (!key) return new Response('not configured', { status: 503 });
  const { socket, response } = Deno.upgradeWebSocket(req);
  const up = new WebSocket(DG_LISTEN, ['token', key]);
  up.binaryType = 'arraybuffer';
  const queue: (string | ArrayBuffer)[] = [];
  socket.onmessage = (e) => { if (up.readyState === WebSocket.OPEN) up.send(e.data); else if (up.readyState === WebSocket.CONNECTING) queue.push(e.data); };
  up.onopen = () => { for (const m of queue.splice(0)) up.send(m); };
  up.onmessage = (e) => { if (socket.readyState === WebSocket.OPEN) socket.send(e.data); };
  up.onclose = (e) => { if (e.code !== 1000) console.error('deepgram live closed', e.code, e.reason?.slice(0, 120)); try { socket.close(); } catch { /* gone */ } };
  up.onerror = () => { /* onclose follows */ };
  socket.onclose = () => { try { up.close(); } catch { /* gone */ } };
  return response;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if ((req.headers.get('upgrade') ?? '').toLowerCase() === 'websocket') return liveRelay(req);
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const userId = await cached(`u:${token}`, 60000, async () => { const { data: u } = await db.auth.getUser(token); if (!u?.user?.id) throw new Error('no user'); return u.user.id; }).catch(() => null);
    if (!userId) return json({ error: 'Please sign in again.' }, 401);
    const ctx = await cached(`c:${userId}`, 60000, () => loadCtx(userId));
    if (!ctx) return json({ error: "You don't have access to Script Boss." }, 403);
    const { orgId } = ctx;
    const logTts = (sid: string | null) => (n: number) => { logUsage(orgId, userId, sid, 'tts', n, n * TTS_PER_CHAR).catch(() => {}); };

    // Audio upload (multipart) → transcript. Used for spoken turns and REVIEW recordings.
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const sessionId = String(form.get('session_id') ?? '') || null;
      const seconds = Number(form.get('seconds') ?? 0);
      if (!(file instanceof File) || !file.size || file.size > 14_000_000) return json({ error: 'Recording is empty or larger than 14 MB.' }, 400);
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      const mime = file.type.startsWith('audio/') ? file.type.split(';')[0] : (file.type.startsWith('video/') ? file.type.replace('video/', 'audio/').split(';')[0] : 'audio/webm');
      const out = new FormData();
      out.append('model', STT_MODEL);
      out.append('file', new File([await file.arrayBuffer()], file.name || 'speech.webm', { type: mime }));
      out.append('response_format', 'json');
      const res = await fetch(`${GATEWAY}/v1/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('LOVABLE_API_KEY')}` }, body: out });
      if (!res.ok) { const t = await res.text(); console.error('stt', res.status, t.slice(0, 300)); return json({ error: res.status === 402 ? 'AI credits are used up.' : "Couldn't transcribe that audio." }, res.status === 402 ? 402 : 502); }
      const data = await res.json();
      await logUsage(orgId, userId, sessionId, 'stt', seconds, seconds * STT_PER_SEC);
      return json({ text: (data.text ?? '').trim() });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === 'start') {
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      const practiceMode = body.practice_mode === 'clinic' ? 'clinic' : 'drill';
      const channel = ['phone', 'text', 'face'].includes(body.channel) ? body.channel : 'phone';
      let sc: any = null;
      let level: number | null = null;
      if (practiceMode === 'drill') {
        const r = await db.from('script_boss_scenarios').select('id, name, number, is_custom, active, org_id, level').eq('id', body.scenario_id ?? '').maybeSingle();
        sc = r.data;
        if (!sc || sc.org_id !== orgId || !sc.active) return json({ error: 'Pick a scenario.' }, 400);
        const cur = await currentLevel(userId);
        level = sc.level ? Number(sc.level) : Math.min(cur, Math.max(1, Math.round(Number(body.level) || cur)));
        if (level > cur) return json({ error: `Level ${level} is locked. Pass Level ${cur} first.` }, 403);
      }
      const custom = String(body.custom_situation ?? '').slice(0, 1500).trim();
      if (sc?.is_custom && !custom) return json({ error: 'Describe the situation for a custom scenario.' }, 400);
      if (sc?.is_custom && /\b(rent(er|al|ing)?|tenant|lease)\b/i.test(custom)) {
        return json({ error: 'Rental scenarios aren\'t drilled. Describe a buyer or seller situation (a renter who could buy in 6–12 months is fine to frame as a future buyer).' }, 400);
      }
      const inst = await latestInstructions(orgId);
      const scenarioName = practiceMode === 'clinic' ? 'Clinic' : sc.number && sc.number < 99 ? `${sc.number}. ${sc.name}` : 'Custom';
      const { data: session, error } = await db.from('script_boss_sessions').insert({
        org_id: orgId, user_id: userId, scenario_id: sc?.id ?? null, scenario_name: scenarioName, custom_situation: custom || null,
        difficulty: 'Realistic', mode: body.mode === 'text' ? 'text' : 'voice', instructions_version: inst.version, practice_mode: practiceMode, channel, level,
      }).select('*').single();
      if (error) throw error;
      // Text-thread drills: the agent sends the first message.
      if (practiceMode === 'drill' && channel === 'text') return json({ session_id: session.id, reply: null, transcript: [] });
      if (body.speak && body.stream && practiceMode === 'drill') {
        session.transcript = [];
        return streamSpokenReply({
          system: await sessionSystem(orgId, session, ctx.name), messages: toMessages([], openerFor(session)),
           voice: body.speak.voice, pace: body.speak.pace, style: body.speak.style, first: { session_id: session.id, transcript: [] },
          onClaude: (tk, cost) => { logUsage(orgId, userId, session.id, 'claude', tk, cost).catch(() => {}); },
          onChars: logTts(session.id),
          finish: async (reply, timing) => {
            const transcript: Turn[] = [{ role: 'client', text: reply, at: new Date().toISOString() }];
            await db.from('script_boss_sessions').update({ transcript, updated_at: new Date().toISOString() }).eq('id', session.id);
            return { session_id: session.id, reply, transcript, live: timing };
          },
        });
      }
      const rawReply = await modelReply(orgId, userId, session, ctx.name);
      const reply = practiceMode === 'clinic' ? rawReply : (stripStage(rawReply, true) || '...');
      const transcript: Turn[] = [{ role: practiceMode === 'clinic' ? 'coach' : 'client', text: reply, at: new Date().toISOString() }];
      await db.from('script_boss_sessions').update({ transcript, updated_at: new Date().toISOString() }).eq('id', session.id);
      const payload = { session_id: session.id, reply, transcript };
      if (body.speak && practiceMode === 'drill') {
         return sseReply(payload, reply, { voice: body.speak.voice, pace: body.speak.pace, style: body.speak.style }, logTts(session.id));
      }
      return json(payload);
    }

    if (action === 'review') {
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      const text = String(body.text ?? '').slice(0, 60000).trim();
      if (words(text) < 15) return json({ error: 'Paste or upload the full conversation first.' }, 400);
      const context = String(body.context ?? '').slice(0, 500).trim();
      const id = await gradeAndSave(ctx, userId, {
        transcriptText: text, transcript: null, scenario: context || 'Real conversation', mode: 'REVIEW', channel: body.channel ?? null,
        practiceMode: 'review', exchanges: text.split('\n').filter((l) => l.trim()).length, delivery: null, sessionId: null,
        durationSeconds: body.seconds ? Math.round(Number(body.seconds)) : null, source: body.from_recording ? 'script_boss_review_recording' : 'script_boss_review',
      });
      return json({ practice_session_id: id });
    }

    const { data: session } = await db.from('script_boss_sessions').select('*').eq('id', body.session_id).maybeSingle();
    if (!session || session.user_id !== userId) return json({ error: 'Session not found.' }, 404);

    if (action === 'turn') {
      if (session.status !== 'active') return json({ error: 'This session has ended.' }, 400);
      // Build the prompt while the cap is checked, to save a round trip.
      const systemP = cached(`s:${session.id}`, 600000, () => sessionSystem(orgId, session, ctx.name));
      systemP.catch(() => {});
      if (await cached(`cap:${userId}`, 30000, () => capReached(orgId, userId))) return json({ error: 'Monthly practice limit reached.' }, 402);
      const text = String(body.text ?? '').slice(0, 3000).trim();
      if (!text) return json({ error: 'Say something first.' }, 400);
      const sttSecs = Math.min(600, Math.max(0, Number(body.stt_seconds) || 0));
      if (sttSecs > 0) logUsage(orgId, userId, session.id, 'stt_live', Math.round(sttSecs), (sttSecs / 60) * DG_STT_PER_MIN).catch(() => {});
      const paused = !!body.paused;
      session.transcript = [...(session.transcript as Turn[]), { role: 'agent', text, paused, at: new Date().toISOString() }];
      const t = body.timing;
      if (!paused && t && Number(t.seconds) > 0) {
        const w = words(text);
        const timing = [...(session.timing as Timing[]), {
          turn: session.transcript.length - 1, seconds: Number(t.seconds), words: w, wpm: Math.round(w / (Number(t.seconds) / 60)),
          trailing_silence_ms: t.trailing_silence_ms == null ? null : Math.round(Number(t.trailing_silence_ms)), question: /\?\s*$/.test(text) || /\?/.test(text.slice(-60)),
        }];
        session.timing = timing;
      }
      if (body.speak && body.stream && !paused && session.practice_mode === 'drill' && session.channel !== 'text') {
        return streamSpokenReply({
          system: await systemP, messages: toMessages(session.transcript, openerFor(session)),
           voice: body.speak.voice, pace: body.speak.pace, style: body.speak.style,
          onClaude: (tk, cost) => { logUsage(orgId, userId, session.id, 'claude', tk, cost).catch(() => {}); },
          onChars: logTts(session.id),
          finish: async (reply, timing) => {
            session.transcript.push({ role: 'client', text: reply, at: new Date().toISOString() });
            await db.from('script_boss_sessions').update({ transcript: session.transcript, timing: session.timing, updated_at: new Date().toISOString() }).eq('id', session.id);
            return { reply, transcript: session.transcript, speaker: 'client', live: timing };
          },
        });
      }
      const c0 = Date.now();
      const rawReply = await modelReply(orgId, userId, session, ctx.name);
      const claudeMs = Date.now() - c0;
      const speaker = paused || session.practice_mode === 'clinic' ? 'coach' : 'client';
      const reply = speaker === 'client' ? (stripStage(rawReply, true) || '...') : rawReply;
      session.transcript.push({ role: speaker, text: reply, at: new Date().toISOString() });
      await db.from('script_boss_sessions').update({ transcript: session.transcript, timing: session.timing, updated_at: new Date().toISOString() }).eq('id', session.id);
      const payload = { reply, transcript: session.transcript, speaker, claude_ms: claudeMs };
      // In-character lines on Phone/Face to face are spoken automatically, streamed with the reply.
      if (body.speak && speaker === 'client' && session.channel !== 'text') {
         return sseReply(payload, reply, { voice: body.speak.voice, pace: body.speak.pace, style: body.speak.style }, logTts(session.id));
      }
      return json(payload);
    }

    if (action === 'rewind') {
      const t = [...(session.transcript as Turn[])];
      const lastAgent = t.map((x, i) => (x.role === 'agent' && !x.paused ? i : -1)).filter((i) => i >= 0).pop();
      if (lastAgent == null) return json({ error: 'Nothing to rewind yet.' }, 400);
      const kept = t.slice(0, lastAgent);
      const timing = (session.timing as Timing[]).filter((x) => x.turn < lastAgent);
      await db.from('script_boss_sessions').update({ transcript: kept, timing, updated_at: new Date().toISOString() }).eq('id', session.id);
      const replay = [...kept].reverse().find((x) => x.role === 'client')?.text ?? null;
      return json({ transcript: kept, replay });
    }

    if (action === 'speak') {
      // Speaker button (coach answers, reports, replays): streamed PCM speech.
      const text = String(body.text ?? '').trim();
      if (!text) return json({ error: 'Nothing to say.' }, 400);
      if (await capReached(orgId, userId)) return json({ error: 'Monthly practice limit reached.' }, 402);
      return sseReply(null, text, { voice: body.voice_name, pace: body.pace, style: body.voice_style, coach: body.voice === 'coach' }, logTts(session.id));
    }

    if (action === 'score') {
      if (session.status === 'scored') return json({ practice_session_id: session.practice_session_id });
      const ended = new Date();
      if (session.practice_mode === 'clinic') {
        await db.from('script_boss_sessions').update({ status: 'abandoned', ended_at: ended.toISOString() }).eq('id', session.id);
        return json({ practice_session_id: null, clinic: true });
      }
      const t = session.transcript as Turn[];
      const rp = t.filter((x) => !x.paused && x.role !== 'coach');
      const agentTurns = rp.filter((x) => x.role === 'agent');
      if (agentTurns.length < 2) return json({ error: 'Have at least two exchanges before ending and scoring.' }, 400);
      const channelLabel = { phone: 'Phone', text: 'Text', face: 'Face to face' }[session.channel as string] ?? 'Phone';
      const transcriptText = t.map((x) => `${x.paused ? '[PAUSE] ' : ''}${x.role === 'agent' ? 'AGENT' : x.role === 'coach' ? '(coach)' : 'LEAD'}: ${x.text}`).join('\n');
      const delivery = deliverySummary(t, session.timing as Timing[]);
      const lvl = session.level ? Number(session.level) : null;
      const id = await gradeAndSave(ctx, userId, {
        transcriptText, transcript: t, scenario: session.custom_situation ? `Custom — ${session.custom_situation}` : session.scenario_name,
        mode: `DRILL · ${channelLabel} · ${session.mode === 'voice' ? 'voice' : 'typed'}`, channel: session.channel, practiceMode: 'drill',
        exchanges: agentTurns.length, delivery, sessionId: session.id,
        durationSeconds: Math.round((ended.getTime() - new Date(session.started_at).getTime()) / 1000), source: `script_boss_${session.mode}`,
        level: lvl,
      });
      await db.from('script_boss_sessions').update({ status: 'scored', practice_session_id: id, ended_at: ended.toISOString(), updated_at: ended.toISOString() }).eq('id', session.id);
      const unlocked = lvl ? await maybeUnlock(orgId, userId, lvl) : null;
      return json({ practice_session_id: id, unlocked });
    }

    // Owner/admin override: raise an agent to a level (logged with who did it).
    if (action === 'set_level') {
      const { data: isAdm } = await db.rpc('is_admin_or_owner', { _user_id: userId });
      if (!isAdm) return json({ error: 'Only owners and admins can set levels.' }, 403);
      const agentId = String(body.agent_id ?? ''); const target = Math.round(Number(body.level));
      if (!(target >= 1 && target <= 5)) return json({ error: 'Pick a level from 1 to 5.' }, 400);
      const { data: ag } = await db.from('profiles').select('org_id').eq('id', agentId).maybeSingle();
      if (!ag || ag.org_id !== orgId) return json({ error: 'Agent not found.' }, 404);
      const current = await currentLevel(agentId);
      if (target < current) return json({ error: `Already at Level ${current}. Levels can only be raised.` }, 400);
      const rows = [];
      for (let l = current + 1; l <= target; l++) rows.push({ org_id: orgId, agent_id: agentId, level: l, unlocked_by: userId, note: 'Manual set level' });
      if (rows.length) { const { error } = await db.from('level_unlocks').insert(rows); if (error) throw error; }
      return json({ level: target });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    const status = (e as { status?: number }).status;
    console.error('script-boss error', e instanceof Error ? e.message : 'unknown');
    return json({ error: e instanceof Error ? e.message : 'Something went wrong' }, status === 429 ? 429 : status === 502 ? 502 : 500);
  }
});
