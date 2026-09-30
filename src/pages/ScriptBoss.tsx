import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useScriptBossAccess } from '@/hooks/useScriptBossAccess';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, Pause, Play, Square, Send, Keyboard, Loader2, Shuffle, Undo2, Upload, Volume2, VolumeX, Ear, Brain, Phone } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { unlockAudio, playSpeechResponse, stopSpeech, setVolume } from '@/lib/voicePlayer';
import { openLiveStt, type LiveStt } from '@/lib/liveStt';
import { ScriptBossSettings } from '@/components/scriptBoss/ScriptBossSettings';
import { ScriptBossReport, type ScriptBossReportRow } from '@/components/scriptBoss/ScriptBossReport';

type Turn = { role: 'agent' | 'client' | 'coach'; text: string; paused?: boolean };
type Scenario = { id: string; name: string; description: string; is_custom: boolean; category: string | null; number: number | null };
type PracticeMode = 'drill' | 'review' | 'clinic';
type Channel = 'phone' | 'text' | 'face';
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
type VoicePrefs = { voice: string; pace: 'relaxed' | 'natural' | 'brisk'; voiceStyle: 'plain' | 'expressive'; voiceMuted: boolean; silenceMs: number; pushToTalk: boolean };
const PREFS_KEY = 'scriptBoss.voicePrefs';
const VOICE_OPTIONS = [
  { id: 'Kore', label: 'Kore — clear, understated (female)' }, { id: 'Aoede', label: 'Aoede — easygoing (female)' },
  { id: 'Leda', label: 'Leda — younger (female)' }, { id: 'Zephyr', label: 'Zephyr — bright (female)' },
  { id: 'Puck', label: 'Puck — upbeat (male)' }, { id: 'Charon', label: 'Charon — plain, steady (male)' },
  { id: 'Orus', label: 'Orus — firm (male)' }, { id: 'Fenrir', label: 'Fenrir — energetic (male)' },
];
const DEFAULT_PREFS: VoicePrefs = { voice: 'Charon', pace: 'brisk', voiceStyle: 'plain', voiceMuted: false, silenceMs: 1200, pushToTalk: false };
function loadPrefs(): VoicePrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch { return DEFAULT_PREFS; }
}

const GROUPS = ['Open houses', 'Paid & portal leads', 'Sphere & past clients', 'Sellers', 'Buyers', 'The calls nobody answers', 'Hard mode', 'Custom'];
const CHANNELS: { key: Channel; label: string }[] = [
  { key: 'phone', label: 'Phone' }, { key: 'text', label: 'Text' }, { key: 'face', label: 'Face to face' },
];
const COMMAND = (s: string) => {
  const t = s.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (/^(pause|pause please|lets pause)$/.test(t)) return 'pause';
  if (/^(rewind|rewind that|let me redo that)$/.test(t)) return 'rewind';
  if (/^(end|end call|end the call|end session)$/.test(t)) return 'end';
  if (/^(resume|continue|back in|lets go)$/.test(t)) return 'resume';
  return null;
};

async function callFn(body: unknown) {
  const { data, error } = await supabase.functions.invoke('script-boss', { body });
  if (error) {
    let msg = 'Something went wrong';
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data;
}

/** Calls the function and returns the raw Response (JSON or a streamed spoken reply). */
async function fnStream(body: unknown): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/script-boss`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Something went wrong'); }
  return res;
}

async function transcribeFile(file: Blob, name: string, sessionId: string | null, seconds: number): Promise<string> {
  const form = new FormData();
  const type = (file.type || 'audio/webm').split(';')[0].replace('video/', 'audio/');
  form.append('file', new File([file], name, { type }));
  if (sessionId) form.append('session_id', sessionId);
  form.append('seconds', String(Math.round(seconds)));
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/script-boss`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't transcribe that");
  return data.text as string;
}

export default function ScriptBoss() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const access = useScriptBossAccess();
  const { toast } = useToast();

  const [practiceMode, setPracticeMode] = useState<PracticeMode>('drill');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioId, setScenarioId] = useState('');
  const [custom, setCustom] = useState('');
  const [channel, setChannel] = useState<Channel>('phone');
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [micOk, setMicOk] = useState<boolean | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<PracticeMode>('drill');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typed, setTyped] = useState('');
  const [report, setReport] = useState<ScriptBossReportRow | null>(null);
  const [history, setHistory] = useState<ScriptBossReportRow[]>([]);
  const [tab, setTab] = useState('practice');

  const [reviewText, setReviewText] = useState('');
  const [reviewContext, setReviewContext] = useState('');
  const [reviewSeconds, setReviewSeconds] = useState<number | null>(null);
  const [fromRecording, setFromRecording] = useState(false);

  const [prefs, setPrefsState] = useState<VoicePrefs>(() => loadPrefs());
  const setPrefs = (p: Partial<VoicePrefs>) => setPrefsState(prev => { const n = { ...prev, ...p }; localStorage.setItem(PREFS_KEY, JSON.stringify(n)); return n; });
  const [phase, setPhase] = useState<Phase>('idle');
  const [micMuted, setMicMuted] = useState(false);
  const [delays, setDelays] = useState<number[]>([]);
  const [live, setLive] = useState<boolean | null>(null); // true = live transcription, false = standard fallback

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef({ start: 0, first: 0, last: 0, stop: 0 });
  const loopRef = useRef<{ ctx: AudioContext; timer: number; an: AnalyserNode } | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const loudRef = useRef(0);
  const endSpeechAt = useRef(0);
  const sentAt = useRef(0);
  const dgRef = useRef<LiveStt | null>(null);
  const liveLineRef = useRef(false);
  const finishingRef = useRef(false);
  const stateRef = useRef({ paused, busy, sessionId, mode, prefs, channel, micMuted, sessionMode });
  stateRef.current = { paused, busy, sessionId, mode, prefs, channel, micMuted, sessionMode };
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const go = (p: Phase) => { phaseRef.current = p; setPhase(p); };

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);
  useEffect(() => { setVolume(prefs.voiceMuted ? 0 : 1); }, [prefs.voiceMuted]);
  useEffect(() => { dgRef.current?.setMuted(micMuted); }, [micMuted]);

  useEffect(() => {
    supabase.from('script_boss_scenarios' as never).select('id,name,description,is_custom,category,number').eq('active', true).order('sort_order')
      .then(({ data }) => {
        const list = ((data as unknown as Scenario[]) || []).filter(s => s.category);
        setScenarios(list);
        if (list[0]) setScenarioId(id => id || list[0].id);
      });
  }, []);

  const grouped = useMemo(() => GROUPS.map(g => ({ g, items: scenarios.filter(s => s.category === g) })).filter(x => x.items.length), [scenarios]);

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('practice_sessions').select('*').eq('user_id', user.id)
      .like('source' as never, 'script_boss%').order('created_at', { ascending: false }).limit(20);
    setHistory((data as unknown as ScriptBossReportRow[]) || []);
  }, [user]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMicOk(false); setMode('text'); }
  }, []);

  const stopRecorder = () => { if (recRef.current?.state === 'recording') { recRef.current.onstop = null; recRef.current.stop(); } recRef.current = null; };
  const stopAll = useCallback(() => {
    stopSpeech();
    stopRecorder();
    dgRef.current?.close(); dgRef.current = null;
    if (loopRef.current) { clearInterval(loopRef.current.timer); loopRef.current.ctx.close().catch(() => {}); loopRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRecording(false);
    go('idle');
  }, []);
  useEffect(() => () => stopAll(), [stopAll]);

  const isHandsFree = () => stateRef.current.mode === 'voice' && !stateRef.current.prefs.pushToTalk;
  const autoVoice = () => stateRef.current.mode === 'voice' && stateRef.current.channel !== 'text' && stateRef.current.sessionMode === 'drill';

  /** Plays a streamed reply. Shows the transcript as soon as the text arrives, speaks it at the same time. */
  const playStream = useCallback(async (res: Response, onReply?: (p: Record<string, unknown>) => void) => {
    liveLineRef.current = false;
    const w = window as unknown as { __sb?: { delays: number[]; sendDelays?: number[]; heard: number; live?: unknown[] } };
    const r = await playSpeechResponse(res, {
      onReply: p => {
        onReply?.(p);
        if (p.live) { w.__sb = w.__sb || { delays: [], heard: 0 }; (w.__sb.live ||= []).push(p.live); }
        if (phaseRef.current === 'thinking') { setBusy(null); go('speaking'); }
      },
      onLine: text => {
        // Live mode: grow the lead's bubble sentence by sentence, as it's spoken.
        setTurns(t => {
          if (liveLineRef.current && t.length && t[t.length - 1].role === 'client') {
            const c = [...t]; c[c.length - 1] = { ...c[c.length - 1], text: `${c[c.length - 1].text} ${text}` }; return c;
          }
          return [...t, { role: 'client', text }];
        });
        liveLineRef.current = true;
        setBusy(null); go('speaking');
      },
      onFirstAudio: () => {
        setBusy(null); go('speaking');
        w.__sb = w.__sb || { delays: [], heard: 0 };
        if (endSpeechAt.current) {
          const d = (Date.now() - endSpeechAt.current) / 1000;
          endSpeechAt.current = 0;
          setDelays(x => [...x, d]);
          w.__sb.delays.push(d);
        }
        if (sentAt.current) { (w.__sb.sendDelays ||= []).push((Date.now() - sentAt.current) / 1000); sentAt.current = 0; }
        w.__sb.heard++;
      },
    });
    if (r.error) toast({ title: 'Voice unavailable', description: `${r.error} The line is on screen.`, variant: 'destructive' });
    return r;
  }, [toast]);

  /** Speaker button: coach answers, replays, the report. */
  const speakText = useCallback(async (text: string, coach: boolean) => {
    const sid = stateRef.current.sessionId ?? lastSessionRef.current;
    if (!sid || !text) return;
    unlockAudio();
    try {
      const res = await fnStream({ action: 'speak', session_id: sid, text, voice: coach ? 'coach' : 'client', voice_name: coach ? undefined : stateRef.current.prefs.voice, pace: stateRef.current.prefs.pace, voice_style: stateRef.current.prefs.voiceStyle });
      await playStream(res);
    } catch (e) { toast({ title: 'Voice unavailable', description: (e as Error).message, variant: 'destructive' }); }
  }, [playStream, toast]);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !stateRef.current.sessionId) return;
    stopRecorder();
    if (dgRef.current) {
      // Live transcription is already streaming; just start a fresh turn.
      dgRef.current.reset();
      speechRef.current = { start: Date.now(), first: 0, last: 0, stop: 0 };
      setRecording(true);
      go('listening');
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => { speechRef.current.stop = Date.now(); setRecording(false); finishRecordingRef.current(); };
    recRef.current = rec;
    speechRef.current = { start: Date.now(), first: 0, last: 0, stop: 0 };
    rec.start(250);
    setRecording(true);
    go('listening');
  }, []);

  /** After the client (or coach) finishes: reopen the mic in hands-free, otherwise wait for push-to-talk. */
  const afterReply = useCallback(() => {
    if (!stateRef.current.sessionId) return;
    if (isHandsFree()) beginRecording(); else go('idle');
  }, [beginRecording]);

  const doRewind = useCallback(async () => {
    const sid = stateRef.current.sessionId; if (!sid) return;
    stopSpeech(); stopRecorder();
    setBusy('Rewinding…'); go('thinking');
    try {
      const data = await callFn({ action: 'rewind', session_id: sid });
      setTurns(data.transcript);
      setBusy(null);
      toast({ title: 'Rewound', description: 'Take your last line again.' });
      if (data.replay && autoVoice()) {
        const p = stateRef.current.prefs;
        await playStream(await fnStream({ action: 'speak', session_id: sid, text: data.replay, voice: 'client', voice_name: p.voice, pace: p.pace, voice_style: p.voiceStyle }), () => go('speaking'));
      }
    } catch (e) { setBusy(null); toast({ title: 'Rewind failed', description: (e as Error).message, variant: 'destructive' }); }
    afterReply();
  }, [playStream, toast, afterReply]);

  const setPausedState = (next: boolean) => {
    setPaused(next);
    stateRef.current.paused = next;
    if (next) stopSpeech();
  };

  const lastSessionRef = useRef<string | null>(null);
  const endAndScore = useCallback(async () => {
    const sid = stateRef.current.sessionId; if (!sid) return;
    stopAll();
    lastSessionRef.current = sid;
    setBusy('Writing your LUXE Practice Report…');
    try {
      const data = await callFn({ action: 'score', session_id: sid });
      if (data.practice_session_id) {
        const { data: row } = await supabase.from('practice_sessions').select('*').eq('id', data.practice_session_id).maybeSingle();
        setReport(row as unknown as ScriptBossReportRow);
      } else toast({ title: 'Clinic ended' });
      setSessionId(null); stateRef.current.sessionId = null; setPausedState(false);
      loadHistory();
    } catch (e) {
      toast({ title: "Couldn't score", description: (e as Error).message, variant: 'destructive' });
      setSessionId(null); stateRef.current.sessionId = null;
    } finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAll, toast, loadHistory]);

  const sendAgent = useCallback(async (raw: string, timing?: { seconds: number; trailing_silence_ms: number | null }) => {
    const sid = stateRef.current.sessionId;
    const text = raw.trim();
    if (!sid || !text) return;
    const cmd = COMMAND(text);
    if (cmd === 'end') return endAndScore();
    if (cmd === 'rewind') return doRewind();
    if (cmd === 'pause') { setPausedState(true); toast({ title: 'Paused', description: 'Ask the coach anything. Say "resume" or tap Resume to go back in.' }); afterReply(); return; }
    if (cmd === 'resume') { setPausedState(false); toast({ title: 'Back in character' }); afterReply(); return; }
    const isPaused = stateRef.current.paused;
    setTurns(t => [...t, { role: 'agent', text, paused: isPaused }]);
    setBusy(isPaused ? 'Coach is thinking…' : 'Thinking…'); go('thinking');
    try {
      const p = stateRef.current.prefs;
      const speak = !isPaused && autoVoice() ? { voice: p.voice, pace: p.pace, style: p.voiceStyle } : undefined;
      const stt_seconds = dgRef.current?.takeSeconds();
      sentAt.current = Date.now();
      const res = await fnStream({ action: 'turn', session_id: sid, text, paused: isPaused, timing, speak, stream: true, stt_seconds });
      if ((res.headers.get('content-type') || '').includes('text/event-stream')) {
        await playStream(res, d => setTurns(d.transcript as Turn[]));
      } else {
        const data = await res.json();
        setTurns(data.transcript);
        setBusy(null);
      }
    } catch (e) {
      setBusy(null);
      toast({ title: 'Turn failed', description: (e as Error).message, variant: 'destructive' });
    }
    afterReply();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playStream, toast, endAndScore, doRewind, afterReply]);

  const finishRecordingRef = useRef<() => void>(() => {});
  finishRecordingRef.current = async () => {
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
    const sp = speechRef.current;
    const secs = (sp.stop - sp.start) / 1000;
    const sid = stateRef.current.sessionId;
    if (!sid) return;
    if (blob.size < 2000 || secs < 0.4 || !sp.first) { afterReply(); return; }
    endSpeechAt.current = sp.last || Date.now();
    const speakingSecs = Math.max(0.5, (sp.last - sp.first) / 1000);
    const trailing = sp.stop - sp.last;
    setBusy('Thinking…'); go('thinking');
    try {
      const text = await transcribeFile(blob, 'speech.webm', sid, secs);
      if (text) await sendAgent(text, { seconds: speakingSecs, trailing_silence_ms: trailing });
      else { setBusy(null); afterReply(); }
    } catch (e) {
      setBusy(null);
      toast({ title: "Couldn't hear that", description: (e as Error).message, variant: 'destructive' });
      afterReply();
    }
  };

  /** Live mode: end of the agent's turn — finalize the words and send them. */
  const finishLive = async () => {
    const dg = dgRef.current; const sid = stateRef.current.sessionId;
    if (!dg || !sid || finishingRef.current) return;
    finishingRef.current = true;
    const sp = speechRef.current; sp.stop = Date.now();
    setRecording(false); go('thinking');
    try {
      const text = sp.first ? await dg.finalize() : '';
      if (!text) { afterReply(); return; }
      endSpeechAt.current = sp.last || Date.now();
      await sendAgent(text, { seconds: Math.max(0.5, (sp.last - sp.first) / 1000), trailing_silence_ms: sp.stop - sp.last });
    } finally { finishingRef.current = false; }
  };
  const finishLiveRef = useRef(finishLive); finishLiveRef.current = finishLive;
  const stopListening = () => { if (dgRef.current) finishLiveRef.current(); else if (recRef.current?.state === 'recording') recRef.current.stop(); };
  const isListening = () => (dgRef.current ? phaseRef.current === 'listening' : recRef.current?.state === 'recording');

  /** Try live transcription; stay on the standard (slower) path if it isn't available. */
  const tryLive = async () => {
    const stream = streamRef.current, ctx = loopRef.current?.ctx;
    if (!stream || !ctx) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no session');
      dgRef.current = await openLiveStt(stream, ctx, session.access_token, () => {
        // Dropped mid-drill: fall back to the standard path without interrupting.
        dgRef.current = null; setLive(false);
        toast({ title: 'Live transcription dropped', description: 'Switched to standard voice — replies will be a bit slower.' });
        if (phaseRef.current === 'listening') beginRecording();
      });
      dgRef.current.setMuted(stateRef.current.micMuted);
      setLive(true);
    } catch {
      dgRef.current = null; setLive(false);
    }
  };

  /** Opens the mic once for the whole session and watches the level every 50 ms. */
  const openMic = useCallback(async () => {
    if (streamRef.current) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      streamRef.current = stream;
      setMicOk(true);
      const ctx = new AudioContext();
      ctx.resume().catch(() => {});
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const timer = window.setInterval(() => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        const st = stateRef.current;
        if (st.micMuted) return;
        const ph = phaseRef.current;
        if (ph === 'listening') {
          const sp = speechRef.current;
          if (rms > 6) { sp.first ||= now; sp.last = now; }
          if (isHandsFree() && isListening()
            && ((sp.first && now - sp.last > st.prefs.silenceMs) || now - sp.start > 90000)) {
            go('thinking');
            stopListening();
          }
        } else if (ph === 'speaking' && isHandsFree()) {
          // Agent talks over the client: stop the client and listen.
          loudRef.current = rms > 16 ? loudRef.current + 1 : 0;
          if (loudRef.current >= 6) {
            loudRef.current = 0;
            const w = window as unknown as { __sb?: { barges?: number } };
            w.__sb = w.__sb || {}; w.__sb.barges = (w.__sb.barges ?? 0) + 1;
            stopSpeech();
            beginRecording();
            speechRef.current.first = now - 300; speechRef.current.last = now;
          }
        }
      }, 50);
      loopRef.current = { ctx, timer, an };
      return true;
    } catch {
      setMicOk(false);
      setMode('text');
      toast({ title: 'Microphone unavailable', description: 'Switched to typing.' });
      return false;
    }
  }, [beginRecording, toast]);

  const pttDown = async () => { if (await openMic()) { stopSpeech(); beginRecording(); } };
  const pttUp = () => { if (isListening()) { go('thinking'); stopListening(); } };

  const surprise = () => {
    const pool = scenarios.filter(s => !s.is_custom);
    const oh = pool.filter(s => s.category === 'Open houses');
    const rest = pool.filter(s => s.category !== 'Open houses');
    const from = Math.random() < 0.5 && oh.length ? oh : (rest.length ? rest : oh);
    const pick = from[Math.floor(Math.random() * from.length)];
    if (pick) { setScenarioId(pick.id); toast({ title: `Surprise: ${pick.number}. ${pick.name}` }); }
  };

  const start = async () => {
    const sc = scenarios.find(s => s.id === scenarioId);
    if (practiceMode === 'drill' && sc?.is_custom && !custom.trim()) { toast({ title: 'Describe the situation first' }); return; }
    // Unlock audio + open the mic inside the Start tap, so nothing is blocked later.
    unlockAudio();
    if (mode === 'voice' && !(await openMic())) return;
    setReport(null); setTurns([]); setPausedState(false); setDelays([]); setLive(null);
    setBusy(practiceMode === 'clinic' ? 'Opening the clinic…' : channel === 'phone' ? 'Dialling…' : 'Starting…'); go('thinking');
    // Live transcription connects while the lead picks up.
    const liveReady = mode === 'voice' ? tryLive() : Promise.resolve();
    try {
      const speak = mode === 'voice' && channel !== 'text' && practiceMode === 'drill' ? { voice: prefs.voice, pace: prefs.pace, style: prefs.voiceStyle } : undefined;
      const res = await fnStream({ action: 'start', practice_mode: practiceMode, scenario_id: scenarioId, custom_situation: custom, channel, mode, speak, stream: true });
      const onData = (d: Record<string, unknown>) => {
        setSessionId(d.session_id as string); setSessionMode(practiceMode);
        stateRef.current.sessionId = d.session_id as string; stateRef.current.sessionMode = practiceMode;
        setTurns(d.transcript as Turn[]);
      };
      if ((res.headers.get('content-type') || '').includes('text/event-stream')) await playStream(res, onData);
      else { onData(await res.json()); setBusy(null); }
      await liveReady;
      afterReply();
    } catch (e) {
      setBusy(null); stopAll();
      toast({ title: "Couldn't start", description: (e as Error).message, variant: 'destructive' });
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 14_000_000) { toast({ title: 'File too large', description: 'Upload a recording under 14 MB.', variant: 'destructive' }); return; }
    setBusy('Transcribing the recording…');
    try {
      const secs = await new Promise<number>(res => {
        const a = document.createElement('audio'); a.preload = 'metadata';
        a.onloadedmetadata = () => res(isFinite(a.duration) ? a.duration : 0); a.onerror = () => res(0);
        a.src = URL.createObjectURL(file);
      });
      const text = await transcribeFile(file, file.name, null, secs);
      setReviewText(text); setReviewSeconds(secs || null); setFromRecording(true);
      toast({ title: 'Transcribed', description: 'Check it over, then grade it.' });
    } catch (e) { toast({ title: "Couldn't transcribe", description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const gradeReview = async () => {
    setBusy('Grading the conversation…');
    try {
      const data = await callFn({ action: 'review', text: reviewText, context: reviewContext, seconds: reviewSeconds, from_recording: fromRecording });
      const { data: row } = await supabase.from('practice_sessions').select('*').eq('id', data.practice_session_id).maybeSingle();
      setReport(row as unknown as ScriptBossReportRow);
      setReviewText(''); setReviewContext(''); setFromRecording(false); setReviewSeconds(null);
      loadHistory();
    } catch (e) { toast({ title: "Couldn't grade", description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (access.loading) return null;
  if (!access.allowed) return <Navigate to="/dashboard" replace />;

  const selected = scenarios.find(s => s.id === scenarioId);
  const inSession = Boolean(sessionId);
  const sendTyped = () => { const t = typed; setTyped(''); sendAgent(t); };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-3xl">Script Boss</h1>
        <p className="text-muted-foreground text-sm">Rehearse real conversations before you have them. Every report saves to your 4-1-1 Practice history.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="practice">Practice</TabsTrigger>
          <TabsTrigger value="history">My sessions</TabsTrigger>
          {isAdmin && <TabsTrigger value="settings">Script Boss settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="practice" className="space-y-4">
          {!inSession && !report && (
            <Card>
              <CardHeader><CardTitle className="font-display text-xl">Start a session</CardTitle></CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-1.5">
                  <Label>Mode</Label>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode">
                    {([['drill', 'DRILL', 'Live roleplay'], ['review', 'REVIEW', 'Grade a real conversation'], ['clinic', 'CLINIC', 'Build the words']] as const).map(([k, l, d]) => (
                      <Button key={k} type="button" variant={practiceMode === k ? 'default' : 'outline'} className="h-auto flex-col py-2" aria-pressed={practiceMode === k} onClick={() => setPracticeMode(k)}>
                        <span className="font-semibold">{l}</span><span className="text-[11px] font-normal opacity-80">{d}</span>
                      </Button>
                    ))}
                  </div>
                </div>

                {practiceMode === 'drill' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Scenario</Label>
                      <div className="flex gap-2">
                        <Select value={scenarioId} onValueChange={setScenarioId}>
                          <SelectTrigger aria-label="Scenario" className="flex-1"><SelectValue placeholder="Pick a scenario" /></SelectTrigger>
                          <SelectContent className="max-h-96">
                            {grouped.map(({ g, items }) => (
                              <SelectGroup key={g}>
                                <SelectLabel>{g}</SelectLabel>
                                {items.map(s => <SelectItem key={s.id} value={s.id}>{s.is_custom ? 'Custom — describe your own' : `${s.number}. ${s.name}`}</SelectItem>)}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="outline" onClick={surprise}><Shuffle className="h-4 w-4 mr-1" /> Surprise me</Button>
                      </div>
                      {selected && !selected.is_custom && <p className="text-xs text-muted-foreground">{selected.description}</p>}
                    </div>
                    {selected?.is_custom && (
                      <div className="space-y-1.5">
                        <Label htmlFor="sb-custom">Describe the situation (buyer or seller)</Label>
                        <Textarea id="sb-custom" value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Downsizing couple in Waterloo's Beechwood area, kids moved out, worried about timing…" />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label>Channel</Label>
                      <div className="flex gap-2" role="radiogroup" aria-label="Channel">
                        {CHANNELS.map(c => <Button key={c.key} type="button" size="sm" variant={channel === c.key ? 'default' : 'outline'} aria-pressed={channel === c.key} onClick={() => setChannel(c.key)}>{c.label}</Button>)}
                      </div>
                    </div>
                  </>
                )}

                {practiceMode !== 'review' && (
                  <>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant={mode === 'voice' ? 'default' : 'outline'} disabled={micOk === false} onClick={() => setMode('voice')}><Mic className="h-4 w-4 mr-1" /> Out loud</Button>
                        <Button type="button" size="sm" variant={mode === 'text' ? 'default' : 'outline'} onClick={() => setMode('text')}><Keyboard className="h-4 w-4 mr-1" /> Type</Button>
                      </div>

                      {micOk === false && <span className="text-xs text-muted-foreground">Microphone not available — typing instead.</span>}
                    </div>
                    {mode === 'voice' && (
                      <div className="grid gap-4 rounded-md border border-border p-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Client voice</Label>
                          <Select value={prefs.voice} onValueChange={v => setPrefs({ voice: v })}>
                            <SelectTrigger aria-label="Client voice"><SelectValue /></SelectTrigger>
                            <SelectContent>{VOICE_OPTIONS.map(v => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Speaking speed</Label>
                          <div className="flex gap-2">
                            {(['relaxed', 'natural', 'brisk'] as const).map(p => (
                              <Button key={p} type="button" size="sm" variant={prefs.pace === p ? 'default' : 'outline'} onClick={() => setPrefs({ pace: p })} className="capitalize">{p}</Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Voice style</Label>
                          <div className="flex gap-2" role="group" aria-label="Voice style">
                            {(['plain', 'expressive'] as const).map(style => (
                              <Button key={style} type="button" size="sm" variant={prefs.voiceStyle === style ? 'default' : 'outline'} aria-pressed={prefs.voiceStyle === style} onClick={() => setPrefs({ voiceStyle: style })} className="capitalize">{style}</Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Send after I stop talking for {(prefs.silenceMs / 1000).toFixed(1)}s</Label>
                          <Slider min={700} max={2500} step={100} value={[prefs.silenceMs]} onValueChange={([v]) => setPrefs({ silenceMs: v })} aria-label="Silence before sending" />
                        </div>
                        <div className="flex flex-col gap-2 text-sm">
                          <label className="flex items-center gap-2"><Switch checked={!prefs.voiceMuted} onCheckedChange={v => setPrefs({ voiceMuted: !v })} /> Client speaks out loud</label>
                          <label className="flex items-center gap-2"><Switch checked={prefs.pushToTalk} onCheckedChange={v => setPrefs({ pushToTalk: v })} /> Push-to-talk instead of hands-free</label>
                          {channel === 'text' && practiceMode === 'drill' && <span className="text-xs text-muted-foreground">Text channel stays as text — the lead's replies aren't read aloud.</span>}
                        </div>
                      </div>
                    )}
                    <Button onClick={start} disabled={(practiceMode === 'drill' && !scenarioId) || Boolean(busy)}>
                      {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />} {practiceMode === 'clinic' ? 'Open clinic' : 'Start drill'}
                    </Button>
                  </>
                )}

                {practiceMode === 'review' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="sb-ctx">What was it? (optional)</Label>
                      <Input id="sb-ctx" value={reviewContext} onChange={e => setReviewContext(e.target.value)} placeholder="e.g. Realtor.ca lead callback, Tuesday" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sb-review">Paste the call transcript, text thread or email</Label>
                      <Textarea id="sb-review" rows={10} value={reviewText} onChange={e => { setReviewText(e.target.value); setFromRecording(false); }} placeholder={'Me: Hi Sarah, it\'s…\nSarah: …'} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline" disabled={Boolean(busy)}>
                        <label className="cursor-pointer"><Upload className="h-4 w-4 mr-2" /> Upload a call recording
                          <input type="file" accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav" className="sr-only" onChange={e => onUpload(e.target.files?.[0])} />
                        </label>
                      </Button>
                      <Button onClick={gradeReview} disabled={Boolean(busy) || reviewText.trim().split(/\s+/).length < 15}>
                        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Grade it
                      </Button>
                    </div>
                    {busy && <p className="text-sm text-muted-foreground">{busy}</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {inSession && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="font-display text-lg">
                  {sessionMode === 'clinic' ? 'Clinic' : `${selected?.is_custom ? 'Custom' : `${selected?.number}. ${selected?.name}`} · ${CHANNELS.find(c => c.key === channel)?.label}`}
                </CardTitle>
                <div className="flex gap-1">
                  {paused && <Badge>Paused — talking to the coach</Badge>}
                  <Badge variant="outline">{mode === 'voice' ? (prefs.pushToTalk ? 'Push-to-talk' : 'Hands-free') : 'Typing'}</Badge>
                  {mode === 'voice' && live !== null && <Badge variant="outline" data-testid="sb-live" data-live={live ? '1' : '0'}>{live ? 'Live voice' : 'Standard voice'}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-80 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 space-y-2" aria-live="polite" data-testid="sb-transcript">
                  {turns.length === 0 && <p className="text-sm text-muted-foreground">You go first — send your opening message.</p>}
                  {turns.map((t, i) => (
                    <div key={i} className={t.role === 'agent' ? 'text-right' : ''}>
                      <span className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${t.role === 'agent' ? 'bg-primary text-primary-foreground' : t.role === 'coach' ? 'bg-accent text-accent-foreground border border-border' : 'bg-card border border-border'}`}>
                        <span className="block text-[10px] uppercase tracking-wide opacity-70">{t.role === 'agent' ? (t.paused ? 'You (paused)' : 'You') : t.role === 'coach' ? 'Coach' : 'Lead'}</span>
                        {t.text}
                        {t.role !== 'agent' && (
                          <button type="button" className="ml-2 inline-flex align-middle opacity-60 hover:opacity-100" aria-label="Play this line" onClick={() => speakText(t.text, t.role === 'coach')}>
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  <div ref={transcriptEnd} />
                </div>
                {busy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>}

                {mode === 'voice' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2" data-testid="sb-status" data-phase={micMuted ? 'muted' : phase}>
                      {micMuted ? <><MicOff className="h-5 w-5 text-muted-foreground" /><span className="font-medium">Mic muted</span></>
                        : phase === 'listening' ? <><Ear className="h-5 w-5 text-primary animate-pulse" /><span className="font-medium">Listening</span></>
                        : phase === 'thinking' ? <><Brain className="h-5 w-5 text-muted-foreground animate-pulse" /><span className="font-medium">Thinking</span></>
                        : phase === 'speaking' ? <><Phone className="h-5 w-5 text-primary" /><span className="font-medium">{paused ? 'Coach speaking' : 'Client speaking'}</span></>
                        : <><Mic className="h-5 w-5 text-muted-foreground" /><span className="font-medium">{prefs.pushToTalk ? 'Hold to talk' : 'Ready'}</span></>}
                      {delays.length > 0 && <span className="ml-auto text-xs text-muted-foreground">Reply delay {delays[delays.length - 1].toFixed(1)}s · avg {(delays.reduce((a, b) => a + b, 0) / delays.length).toFixed(1)}s</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 items-center">
                      {prefs.pushToTalk && (
                        <Button variant={recording ? 'destructive' : 'default'} disabled={phase === 'thinking'}
                          onPointerDown={e => { e.preventDefault(); pttDown(); }} onPointerUp={pttUp}
                          onPointerLeave={() => recording && pttUp()} className="select-none touch-none">
                          <Mic className="h-4 w-4 mr-2" /> {recording ? 'Release to send' : 'Hold to talk'}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setMicMuted(m => !m)}>
                        {micMuted ? <><Mic className="h-4 w-4 mr-1" /> Unmute mic</> : <><MicOff className="h-4 w-4 mr-1" /> Mute mic</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setPrefs({ voiceMuted: !prefs.voiceMuted }); }}>
                        {prefs.voiceMuted ? <><VolumeX className="h-4 w-4 mr-1" /> Voice off</> : <><Volume2 className="h-4 w-4 mr-1" /> Voice on</>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { stopAll(); setMode('text'); }}><Keyboard className="h-4 w-4 mr-1" /> Type instead</Button>
                      <span className="text-xs text-muted-foreground">Just talk — it sends when you stop. Say "pause", "rewind" or "end" any time.</span>
                    </div>
                  </div>
                ) : (
                  <form className="flex gap-2" onSubmit={e => { e.preventDefault(); sendTyped(); }}>
                    <Textarea value={typed} onChange={e => setTyped(e.target.value)} placeholder={paused ? 'Ask the coach…' : 'What do you say? (or type PAUSE, REWIND, END)'} rows={2} aria-label="Your reply"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTyped(); } }} />
                    <Button type="submit" disabled={Boolean(busy) || !typed.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
                  </form>
                )}

                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {sessionMode !== 'clinic' && (
                    <>
                      <Button variant="outline" onClick={() => { setPausedState(!paused); if (!paused) afterReply(); }}>
                        {paused ? <><Play className="h-4 w-4 mr-1" /> Resume</> : <><Pause className="h-4 w-4 mr-1" /> Pause</>}
                      </Button>
                      <Button variant="outline" onClick={doRewind} disabled={Boolean(busy) || !turns.some(t => t.role === 'agent')}><Undo2 className="h-4 w-4 mr-1" /> Rewind</Button>
                    </>
                  )}
                  <Button onClick={endAndScore} ><Square className="h-4 w-4 mr-1" /> End{sessionMode === 'clinic' ? '' : ' & Score'}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {report && (
            <div className="space-y-3">
              <ScriptBossReport row={report} />
              <div className="flex gap-2">
                <Button onClick={() => setReport(null)}>Practise again</Button>
                {report.raw_report && <Button variant="outline" onClick={() => speakText(report.raw_report!, true)}><Volume2 className="h-4 w-4 mr-1" /> Read report aloud</Button>}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {history.length === 0 && <p className="text-sm text-muted-foreground">No Script Boss sessions yet.</p>}
          {history.map(h => <ScriptBossReport key={h.id} row={h} collapsible />)}
        </TabsContent>

        {isAdmin && <TabsContent value="settings"><ScriptBossSettings canEditInstructions /></TabsContent>}
      </Tabs>
    </div>
  );
}
