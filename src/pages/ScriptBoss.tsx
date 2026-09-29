import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, MicOff, Pause, Play, Square, Send, Keyboard, Loader2 } from 'lucide-react';
import { ScriptBossSettings } from '@/components/scriptBoss/ScriptBossSettings';
import { ScriptBossReport, type ScriptBossReportRow } from '@/components/scriptBoss/ScriptBossReport';

type Turn = { role: 'agent' | 'client'; text: string };
type Scenario = { id: string; name: string; description: string; is_custom: boolean };
const DIFFICULTIES = ['Friendly', 'Skeptical', 'Tough'] as const;

async function callFn(body: unknown) {
  const { data, error } = await supabase.functions.invoke('script-boss', { body });
  if (error) {
    let msg = 'Something went wrong';
    try { msg = (await (error as { context?: Response }).context?.json())?.error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return data;
}

async function transcribeBlob(blob: Blob, sessionId: string, seconds: number): Promise<string> {
  const form = new FormData();
  form.append('file', new File([blob], 'speech.webm', { type: blob.type.split(';')[0] || 'audio/webm' }));
  form.append('session_id', sessionId);
  form.append('seconds', String(Math.round(seconds)));
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/script-boss`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't hear that");
  return data.text as string;
}

export default function ScriptBoss() {
  const { user } = useAuth();
  const { isAdmin, isStrictOwner } = useUserRole();
  const access = useScriptBossAccess();
  const { toast } = useToast();

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioId, setScenarioId] = useState('');
  const [custom, setCustom] = useState('');
  const [difficulty, setDifficulty] = useState<string>('Skeptical');
  const [mode, setMode] = useState<'voice' | 'text'>('voice');
  const [micOk, setMicOk] = useState<boolean | null>(null);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [recording, setRecording] = useState(false);
  const [typed, setTyped] = useState('');
  const [report, setReport] = useState<ScriptBossReportRow | null>(null);
  const [history, setHistory] = useState<ScriptBossReportRow[]>([]);
  const [tab, setTab] = useState('practice');

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vadRef = useRef<{ ctx: AudioContext; raf: number } | null>(null);
  const stateRef = useRef({ paused, handsFree, busy, sessionId });
  stateRef.current = { paused, handsFree, busy, sessionId };
  const transcriptEnd = useRef<HTMLDivElement>(null);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ block: 'nearest' }); }, [turns]);

  useEffect(() => {
    supabase.from('script_boss_scenarios' as never).select('id,name,description,is_custom').eq('active', true).order('sort_order')
      .then(({ data }) => {
        const list = (data as unknown as Scenario[]) || [];
        setScenarios(list);
        if (list[0]) setScenarioId(id => id || list[0].id);
      });
  }, []);

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

  const stopAll = useCallback(() => {
    if (vadRef.current) { cancelAnimationFrame(vadRef.current.raf); vadRef.current.ctx.close().catch(() => {}); vadRef.current = null; }
    if (recRef.current?.state === 'recording') recRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioRef.current?.pause();
    setRecording(false);
  }, []);
  useEffect(() => () => stopAll(), [stopAll]);

  const speak = useCallback(async (text: string, sid: string) => {
    if (mode !== 'voice') return;
    try {
      setBusy('Client is speaking…');
      const data = await callFn({ action: 'speak', session_id: sid, text });
      await new Promise<void>((resolve) => {
        const a = new Audio(`data:${data.mime};base64,${data.audio}`);
        audioRef.current = a;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      });
    } catch { /* transcript still shows the reply */ }
    finally { setBusy(null); }
  }, [mode]);

  const sendAgent = useCallback(async (text: string) => {
    const sid = stateRef.current.sessionId;
    if (!sid || !text.trim()) return;
    setTurns(t => [...t, { role: 'agent', text }]);
    setBusy('Client is thinking…');
    try {
      const data = await callFn({ action: 'turn', session_id: sid, text });
      setTurns(data.transcript);
      setBusy(null);
      await speak(data.reply, sid);
      if (stateRef.current.handsFree && !stateRef.current.paused) startListening(true);
    } catch (e) {
      setBusy(null);
      toast({ title: 'Turn failed', description: (e as Error).message, variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speak, toast]);

  const finishRecording = useCallback(async () => {
    const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
    const secs = (Date.now() - recStartRef.current) / 1000;
    const sid = stateRef.current.sessionId;
    if (!sid || blob.size < 2000 || secs < 0.6) {
      if (stateRef.current.handsFree && !stateRef.current.paused) startListening(true);
      return;
    }
    setBusy('Transcribing…');
    try {
      const text = await transcribeBlob(blob, sid, secs);
      setBusy(null);
      if (text) await sendAgent(text);
      else if (stateRef.current.handsFree) startListening(true);
    } catch (e) {
      setBusy(null);
      toast({ title: "Couldn't hear that", description: (e as Error).message, variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendAgent, toast]);

  const startListening = useCallback(async (auto = false) => {
    if (stateRef.current.paused || recRef.current?.state === 'recording') return;
    try {
      const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      setMicOk(true);
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => { setRecording(false); finishRecording(); };
      recRef.current = rec;
      recStartRef.current = Date.now();
      rec.start(250);
      setRecording(true);
      if (auto) {
        // Hands-free: stop after ~1.3s of silence once speech has been heard.
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
        const buf = new Uint8Array(an.fftSize);
        let heard = false; let silentSince = 0;
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += (v - 128) ** 2;
          const rms = Math.sqrt(sum / buf.length);
          const now = Date.now();
          if (rms > 6) { heard = true; silentSince = 0; } else if (heard) { silentSince ||= now; }
          if ((heard && silentSince && now - silentSince > 1300) || now - recStartRef.current > 60000) {
            ctx.close().catch(() => {}); vadRef.current = null;
            if (rec.state === 'recording') rec.stop();
            return;
          }
          if (vadRef.current) vadRef.current.raf = requestAnimationFrame(tick);
        };
        vadRef.current = { ctx, raf: requestAnimationFrame(tick) };
      }
    } catch {
      setMicOk(false);
      setMode('text');
      toast({ title: 'Microphone unavailable', description: 'Switched to text mode.' });
    }
  }, [finishRecording, toast]);

  const stopListening = () => { if (recRef.current?.state === 'recording') recRef.current.stop(); };

  const start = async () => {
    const sc = scenarios.find(s => s.id === scenarioId);
    if (sc?.is_custom && !custom.trim()) { toast({ title: 'Describe the situation first' }); return; }
    setReport(null); setTurns([]); setPaused(false);
    setBusy('Dialling…');
    try {
      const data = await callFn({ action: 'start', scenario_id: scenarioId, custom_situation: custom, difficulty, mode });
      setSessionId(data.session_id);
      stateRef.current.sessionId = data.session_id;
      setTurns(data.transcript);
      setBusy(null);
      await speak(data.reply, data.session_id);
      if (mode === 'voice' && handsFree) startListening(true);
    } catch (e) {
      setBusy(null);
      toast({ title: "Couldn't start", description: (e as Error).message, variant: 'destructive' });
    }
  };

  const endAndScore = async () => {
    if (!sessionId) return;
    stopAll();
    setBusy('Scoring your call…');
    try {
      const data = await callFn({ action: 'score', session_id: sessionId });
      const { data: row } = await supabase.from('practice_sessions').select('*').eq('id', data.practice_session_id).maybeSingle();
      setReport(row as unknown as ScriptBossReportRow);
      setSessionId(null);
      loadHistory();
    } catch (e) {
      toast({ title: 'Scoring failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    stateRef.current.paused = next;
    if (next) { if (vadRef.current) { cancelAnimationFrame(vadRef.current.raf); vadRef.current.ctx.close().catch(() => {}); vadRef.current = null; } if (recRef.current?.state === 'recording') { recRef.current.onstop = () => setRecording(false); recRef.current.stop(); } audioRef.current?.pause(); }
    else if (handsFree && mode === 'voice') startListening(true);
  };

  if (access.loading) return null;
  if (!access.allowed) return <Navigate to="/dashboard" replace />;

  const selected = scenarios.find(s => s.id === scenarioId);
  const inSession = Boolean(sessionId);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-3xl">Script Boss</h1>
        <p className="text-muted-foreground text-sm">Role-play a real call, then get scored on the six skills. Sessions save to your Practice history.</p>
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
              <CardHeader><CardTitle className="font-display text-xl">Set up the call</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Scenario</Label>
                    <Select value={scenarioId} onValueChange={setScenarioId}>
                      <SelectTrigger aria-label="Scenario"><SelectValue placeholder="Pick a scenario" /></SelectTrigger>
                      <SelectContent>{scenarios.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                    {selected && !selected.is_custom && <p className="text-xs text-muted-foreground">{selected.description}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Difficulty</Label>
                    <div className="flex gap-2" role="radiogroup" aria-label="Difficulty">
                      {DIFFICULTIES.map(d => (
                        <Button key={d} type="button" size="sm" variant={difficulty === d ? 'default' : 'outline'} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>{d}</Button>
                      ))}
                    </div>
                  </div>
                </div>
                {selected?.is_custom && (
                  <div className="space-y-1.5">
                    <Label htmlFor="sb-custom">Describe the situation</Label>
                    <Textarea id="sb-custom" value={custom} onChange={e => setCustom(e.target.value)} placeholder="e.g. Downsizing couple in Waterloo's Beechwood area, kids moved out, worried about timing…" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant={mode === 'voice' ? 'default' : 'outline'} disabled={micOk === false} onClick={() => setMode('voice')}><Mic className="h-4 w-4 mr-1" /> Voice</Button>
                    <Button type="button" size="sm" variant={mode === 'text' ? 'default' : 'outline'} onClick={() => setMode('text')}><Keyboard className="h-4 w-4 mr-1" /> Text</Button>
                  </div>
                  {mode === 'voice' && (
                    <label className="flex items-center gap-2 text-sm"><Switch checked={handsFree} onCheckedChange={setHandsFree} /> Hands-free</label>
                  )}
                  {micOk === false && <span className="text-xs text-muted-foreground">Microphone not available — using text mode.</span>}
                </div>
                <Button onClick={start} disabled={!scenarioId || Boolean(busy)}>
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />} Start call
                </Button>
              </CardContent>
            </Card>
          )}

          {inSession && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="font-display text-lg">{selected?.name} · {difficulty}</CardTitle>
                <Badge variant="outline">{mode === 'voice' ? (handsFree ? 'Hands-free' : 'Push-to-talk') : 'Text'}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-80 overflow-y-auto rounded-md border border-border bg-muted/30 p-3 space-y-2" aria-live="polite" data-testid="sb-transcript">
                  {turns.map((t, i) => (
                    <div key={i} className={t.role === 'agent' ? 'text-right' : ''}>
                      <span className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${t.role === 'agent' ? 'bg-primary text-primary-foreground' : 'bg-card border border-border'}`}>
                        <span className="block text-[10px] uppercase tracking-wide opacity-70">{t.role === 'agent' ? 'You' : 'Client'}</span>
                        {t.text}
                      </span>
                    </div>
                  ))}
                  <div ref={transcriptEnd} />
                </div>
                {busy && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {busy}</p>}
                {paused && <p className="text-sm text-muted-foreground">Paused.</p>}

                {mode === 'voice' ? (
                  <div className="flex flex-wrap gap-2 items-center">
                    {handsFree ? (
                      <Button variant={recording ? 'destructive' : 'default'} disabled={Boolean(busy) || paused} onClick={() => (recording ? stopListening() : startListening(true))}>
                        {recording ? <><MicOff className="h-4 w-4 mr-2" /> Listening… tap when done</> : <><Mic className="h-4 w-4 mr-2" /> Start listening</>}
                      </Button>
                    ) : (
                      <Button
                        variant={recording ? 'destructive' : 'default'}
                        disabled={Boolean(busy) || paused}
                        onPointerDown={e => { e.preventDefault(); startListening(false); }}
                        onPointerUp={stopListening}
                        onPointerLeave={() => recording && stopListening()}
                        className="select-none touch-none"
                      >
                        <Mic className="h-4 w-4 mr-2" /> {recording ? 'Release to send' : 'Hold to talk'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setMode('text')}><Keyboard className="h-4 w-4 mr-1" /> Type instead</Button>
                  </div>
                ) : (
                  <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const t = typed; setTyped(''); sendAgent(t); }}>
                    <Textarea value={typed} onChange={e => setTyped(e.target.value)} placeholder="What do you say?" rows={2} aria-label="Your reply"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const t = typed; setTyped(''); sendAgent(t); } }} />
                    <Button type="submit" disabled={Boolean(busy) || !typed.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
                  </form>
                )}

                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button variant="outline" onClick={togglePause}>{paused ? <><Play className="h-4 w-4 mr-1" /> Resume</> : <><Pause className="h-4 w-4 mr-1" /> Pause</>}</Button>
                  <Button onClick={endAndScore} disabled={Boolean(busy) && busy !== 'Client is speaking…'}><Square className="h-4 w-4 mr-1" /> End & score</Button>
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

        {isAdmin && (
          <TabsContent value="settings"><ScriptBossSettings canEditInstructions={isStrictOwner || isAdmin} /></TabsContent>
        )}
      </Tabs>
    </div>
  );
}
