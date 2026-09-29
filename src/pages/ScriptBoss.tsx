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
import { Mic, MicOff, Pause, Play, Square, Send, Keyboard, Loader2, Shuffle, Undo2, Upload } from 'lucide-react';
import { ScriptBossSettings } from '@/components/scriptBoss/ScriptBossSettings';
import { ScriptBossReport, type ScriptBossReportRow } from '@/components/scriptBoss/ScriptBossReport';

type Turn = { role: 'agent' | 'client' | 'coach'; text: string; paused?: boolean };
type Scenario = { id: string; name: string; description: string; is_custom: boolean; category: string | null; number: number | null };
type PracticeMode = 'drill' | 'review' | 'clinic';
type Channel = 'phone' | 'text' | 'face';

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
  const [handsFree, setHandsFree] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typed, setTyped] = useState('');
  const [report, setReport] = useState<ScriptBossReportRow | null>(null);
  const [history, setHistory] = useState<ScriptBossReportRow[]>([]);
  const [tab, setTab] = useState('practice');

  const [reviewText, setReviewText] = useState('');
  const [reviewContext, setReviewContext] = useState('');
  const [reviewSeconds, setReviewSeconds] = useState<number | null>(null);
  const [fromRecording, setFromRecording] = useState(false);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRef = useRef({ start: 0, first: 0, last: 0, stop: 0 });
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vadRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const stateRef = useRef({ paused, handsFree, busy, sessionId, mode });
  stateRef.current = { paused, handsFree, busy, sessionId, mode };
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);

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

  const stopVad = () => { if (vadRef.current) { cancelAnimationFrame(vadRef.current.raf); vadRef.current.ctx.close().catch(() => {}); vadRef.current = null; } };
  const stopAll = useCallback(() => {
    stopVad();
    if (recRef.current?.state === 'recording') { recRef.current.onstop = null; recRef.current.stop(); }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioRef.current?.pause();
    setRecording(false);
  }, []);
  useEffect(() => () => stopAll(), [stopAll]);

  const speak = useCallback(async (text: string, sid: string, voice: 'client' | 'coach' = 'client') => {
    if (stateRef.current.mode !== 'voice' || !text) return;
    try {
      setBusy(voice === 'coach' ? 'Coach is speaking…' : 'Speaking…');
      const data = await callFn({ action: 'speak', session_id: sid, text, voice });
      await new Promise<void>((resolve) => {
        const a = new Audio(`data:${data.mime};base64,${data.audio}`);
        audioRef.current = a;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.onpause = () => resolve();
        a.play().catch(() => resolve());
      });
    } catch { /* the transcript still shows the reply */ }
    finally { setBusy(null); }
  }, []);

  const resumeListening = () => {
    if (stateRef.current.handsFree && stateRef.current.mode === 'voice') startListening(true);
  };

  const doRewind = useCallback(async () => {
    const sid = stateRef.current.sessionId; if (!sid) return;
    audioRef.current?.pause();
    setBusy('Rewinding…');
    try {
      const data = await callFn({ action: 'rewind', session_id: sid });
      setTurns(data.transcript);
      setBusy(null);
      toast({ title: 'Rewound', description: 'Take your last line again.' });
      if (data.replay) await speak(data.replay, sid);
      resumeListening();
    } catch (e) { setBusy(null); toast({ title: 'Rewind failed', description: (e as Error).message, variant: 'destructive' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, toast]);

  const setPausedState = (next: boolean) => {
    setPaused(next);
    stateRef.current.paused = next;
    if (next) audioRef.current?.pause();
  };

  const endAndScore = useCallback(async () => {
    const sid = stateRef.current.sessionId; if (!sid) return;
    stopAll();
    setBusy('Writing your LUXE Practice Report…');
    try {
      const data = await callFn({ action: 'score', session_id: sid });
      if (data.practice_session_id) {
        const { data: row } = await supabase.from('practice_sessions').select('*').eq('id', data.practice_session_id).maybeSingle();
        setReport(row as unknown as ScriptBossReportRow);
      } else toast({ title: 'Clinic ended' });
      setSessionId(null); setPausedState(false);
      loadHistory();
    } catch (e) {
      toast({ title: "Couldn't score", description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopAll, toast, loadHistory]);

  const sendAgent = useCallback(async (raw: string, timing?: { seconds: number; trailing_silence_ms: number | null }) => {
    const sid = stateRef.current.sessionId;
    const text = raw.trim();
    if (!sid || !text) return;
    // Spoken or typed commands
    const cmd = COMMAND(text);
    if (cmd === 'end') return endAndScore();
    if (cmd === 'rewind') return doRewind();
    if (cmd === 'pause') { setPausedState(true); toast({ title: 'Paused', description: 'Ask the coach anything. Say "resume" or tap Resume to go back in.' }); resumeListening(); return; }
    if (cmd === 'resume') { setPausedState(false); toast({ title: 'Back in character' }); resumeListening(); return; }
    const isPaused = stateRef.current.paused;
    setTurns(t => [...t, { role: 'agent', text, paused: isPaused }]);
    setBusy(isPaused ? 'Coach is thinking…' : 'Thinking…');
    try {
      const data = await callFn({ action: 'turn', session_id: sid, text, paused: isPaused, timing });
      setTurns(data.transcript);
      setBusy(null);
      await speak(data.reply, sid, data.speaker === 'coach' || sessionMode === 'clinic' ? 'coach' : 'client');
      resumeListening();
    } catch (e) {
      setBusy(null);
      toast({ title: 'Turn failed', description: (e as Error).message, variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, toast, endAndScore, doRewind, sessionMode]);

  const finishRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: chunksRef.current[0]?.type || 'audio/webm' });
    const sp = speechRef.current;
    const secs = (sp.stop - sp.start) / 1000;
    const sid = stateRef.current.sessionId;
    if (!sid || blob.size < 2000 || secs < 0.6 || !sp.first) { resumeListening(); return; }
    const speakingSecs = Math.max(0.5, (sp.last - sp.first) / 1000);
    const trailing = sp.stop - sp.last;
    setBusy('Transcribing…');
    try {
      const text = await transcribeFile(blob, 'speech.webm', sid, secs);
      setBusy(null);
      if (text) await sendAgent(text, { seconds: speakingSecs, trailing_silence_ms: trailing });
      else resumeListening();
    } catch (e) {
      setBusy(null);
      toast({ title: "Couldn't hear that", description: (e as Error).message, variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendAgent, toast]);

  const startListening = useCallback(async (auto = false) => {
    if (recRef.current?.state === 'recording') return;
    try {
      const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      setMicOk(true);
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => { speechRef.current.stop = Date.now(); stopVad(); setRecording(false); finishRecording(); };
      recRef.current = rec;
      speechRef.current = { start: Date.now(), first: 0, last: 0, stop: 0 };
      rec.start(250);
      setRecording(true);
      // Level meter: measures speech onset/offset for pace and pause data; in hands-free it also ends the turn after ~1.5s of silence.
      stopVad();
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / buf.length);
        const now = Date.now();
        const sp = speechRef.current;
        if (rms > 6) { sp.first ||= now; sp.last = now; }
        if (auto && ((sp.last && now - sp.last > 1500) || now - sp.start > 90000)) {
          if (rec.state === 'recording') rec.stop();
          return;
        }
        if (vadRef.current) vadRef.current.raf = requestAnimationFrame(tick);
      };
      vadRef.current = { ctx, raf: requestAnimationFrame(tick) };
    } catch {
      setMicOk(false);
      setMode('text');
      toast({ title: 'Microphone unavailable', description: 'Switched to typing.' });
    }
  }, [finishRecording, toast]);

  const stopListening = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };

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
    setReport(null); setTurns([]); setPausedState(false);
    setBusy(practiceMode === 'clinic' ? 'Opening the clinic…' : channel === 'phone' ? 'Dialling…' : 'Starting…');
    try {
      const data = await callFn({ action: 'start', practice_mode: practiceMode, scenario_id: scenarioId, custom_situation: custom, channel, mode });
      setSessionId(data.session_id);
      setSessionMode(practiceMode);
      stateRef.current.sessionId = data.session_id;
      setTurns(data.transcript);
      setBusy(null);
      if (data.reply) await speak(data.reply, data.session_id, practiceMode === 'clinic' ? 'coach' : 'client');
      if (mode === 'voice' && handsFree) startListening(true);
    } catch (e) {
      setBusy(null);
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
                      {mode === 'voice' && <label className="flex items-center gap-2 text-sm"><Switch checked={handsFree} onCheckedChange={setHandsFree} /> Hands-free</label>}
                      {micOk === false && <span className="text-xs text-muted-foreground">Microphone not available — typing instead.</span>}
                    </div>
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
                  <Badge variant="outline">{mode === 'voice' ? (handsFree ? 'Hands-free' : 'Push-to-talk') : 'Typing'}</Badge>
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
                      </span>
                    </div>
                  ))}
                  <div ref={transcriptEnd} />
                </div>
                {busy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>}

                {mode === 'voice' ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    {handsFree ? (
                      <Button variant={recording ? 'destructive' : 'default'} disabled={Boolean(busy)} onClick={() => (recording ? stopListening() : startListening(true))}>
                        {recording ? <><MicOff className="h-4 w-4 mr-2" /> Listening… tap when done</> : <><Mic className="h-4 w-4 mr-2" /> Start listening</>}
                      </Button>
                    ) : (
                      <Button variant={recording ? 'destructive' : 'default'} disabled={Boolean(busy)}
                        onPointerDown={e => { e.preventDefault(); startListening(false); }} onPointerUp={stopListening}
                        onPointerLeave={() => recording && stopListening()} className="select-none touch-none">
                        <Mic className="h-4 w-4 mr-2" /> {recording ? 'Release to send' : 'Hold to talk'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setMode('text')}><Keyboard className="h-4 w-4 mr-1" /> Type instead</Button>
                    <span className="text-xs text-muted-foreground">Say "pause", "rewind" or "end" any time.</span>
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
                      <Button variant="outline" onClick={() => { setPausedState(!paused); if (paused) resumeListening(); }}>
                        {paused ? <><Play className="h-4 w-4 mr-1" /> Resume</> : <><Pause className="h-4 w-4 mr-1" /> Pause</>}
                      </Button>
                      <Button variant="outline" onClick={doRewind} disabled={Boolean(busy) || !turns.some(t => t.role === 'agent')}><Undo2 className="h-4 w-4 mr-1" /> Rewind</Button>
                    </>
                  )}
                  <Button onClick={endAndScore} disabled={Boolean(busy) && !busy.startsWith('Speaking')}><Square className="h-4 w-4 mr-1" /> End{sessionMode === 'clinic' ? '' : ' & report'}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {report && (
            <div className="space-y-3">
              <ScriptBossReport row={report} />
              <Button onClick={() => setReport(null)}>Practise again</Button>
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
