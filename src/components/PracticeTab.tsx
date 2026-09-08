import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ExternalLink, Mic, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { format, parseISO, startOfMonth, startOfWeek } from 'date-fns';
import { parsePracticeReport, SCORE_FIELDS, ParsedPracticeReport } from '@/lib/practiceReport';

export interface PracticeSession extends ParsedPracticeReport {
  id: string;
  raw_report: string | null;
  created_at: string;
}

const emptyDraft = (): ParsedPracticeReport => parsePracticeReport('');

export function usePracticeSessions(userId?: string | null) {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('practice_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });
    setSessions((data as unknown as PracticeSession[]) || []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  return { sessions, loading, reload: load };
}

export function practiceSummary(sessions: PracticeSession[]) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const monthStart = startOfMonth(new Date());
  const inWeek = sessions.filter(s => parseISO(s.session_date) >= weekStart);
  const inMonth = sessions.filter(s => parseISO(s.session_date) >= monthStart);
  const totals = inMonth.map(s => s.total).filter((t): t is number => typeof t === 'number');
  const avgTotal = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  const grades = inMonth.map(s => (s.grade || '').toUpperCase()).filter(Boolean).sort();
  return {
    thisWeek: inWeek.length,
    thisMonth: inMonth.length,
    avgTotal,
    bestGrade: grades.length ? grades[0] : null,
    latest: sessions[0] || null,
  };
}

const gradeColor = (grade?: string | null) => {
  const g = (grade || '').charAt(0).toUpperCase();
  if (g === 'A') return 'bg-green-500/10 text-green-600 border-green-500/30';
  if (g === 'B') return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
  if (g === 'C') return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
  if (g) return 'bg-red-500/10 text-red-600 border-red-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

interface PracticeTabProps {
  /** Whose sessions are shown */
  userId?: string | null;
  /** Only the signed-in agent may log a session for themselves */
  canLog: boolean;
}

const SCRIPTING_BOSS_KEY = 'scripting_boss_url';

function ScriptingBossLink() {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [url, setUrl] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SCRIPTING_BOSS_KEY)
        .maybeSingle();
      if (!active) return;
      const v = (data as { value: string | null } | null)?.value ?? null;
      setUrl(v);
      setValue(v || '');
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleSave = async () => {
    const trimmed = value.trim();
    let valid = false;
    try {
      valid = new URL(trimmed).protocol === 'https:';
    } catch {
      valid = false;
    }
    if (!valid) {
      toast({ title: 'Enter a link that starts with https://', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: SCRIPTING_BOSS_KEY, value: trimmed }, { onConflict: 'org_id,key' });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save the link', description: error.message, variant: 'destructive' });
      return;
    }
    setUrl(trimmed);
    toast({ title: 'Link saved' });
  };

  return (
    <Card className="border-primary/10">
      <CardContent className="space-y-3 pt-6">
        {url ? (
          <div>
            <Button asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" /> Open Scripting Boss
              </a>
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Practise there, then paste your report below.</p>
          </div>
        ) : (
          !isAdmin && (
            <p className="text-sm text-muted-foreground">The Scripting Boss link is coming soon.</p>
          )
        )}

        {isAdmin && (
          <div className="space-y-2">
            <Label className="text-xs">
              {url ? 'Scripting Boss link' : 'Add the Scripting Boss link'}
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="https://claude.ai/project/…"
              />
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save link'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PracticeTab({ userId, canLog }: PracticeTabProps) {
  const { toast } = useToast();
  const { sessions, loading, reload } = usePracticeSessions(userId);
  const [raw, setRaw] = useState('');
  const [draft, setDraft] = useState<ParsedPracticeReport | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const summary = useMemo(() => practiceSummary(sessions), [sessions]);

  const handleParse = () => {
    if (!raw.trim()) {
      toast({ title: 'Paste your report first', variant: 'destructive' });
      return;
    }
    setDraft(parsePracticeReport(raw));
  };

  const setField = (key: keyof ParsedPracticeReport, value: unknown) =>
    setDraft(prev => (prev ? { ...prev, [key]: value } as ParsedPracticeReport : prev));

  const handleSave = async () => {
    if (!draft || !userId) return;
    setSaving(true);
    const { error } = await supabase.from('practice_sessions').insert({
      user_id: userId,
      session_date: draft.session_date,
      scenario: draft.scenario || null,
      mode: draft.mode || null,
      exchanges: draft.exchanges,
      earn_30_seconds: draft.earn_30_seconds,
      motivation_discovery: draft.motivation_discovery,
      talk_less_ratio: draft.talk_less_ratio,
      objection_handling: draft.objection_handling,
      the_ask: draft.the_ask,
      next_step_locked: draft.next_step_locked,
      total: draft.total,
      grade: draft.grade || null,
      appointment_set: draft.appointment_set,
      strongest_moment: draft.strongest_moment || null,
      costliest_moment: draft.costliest_moment || null,
      structure_covered: draft.structure_covered || null,
      magic_words_used: draft.magic_words_used || null,
      magic_words_missed: draft.magic_words_missed || null,
      one_thing_to_change: draft.one_thing_to_change || null,
      drill_again: draft.drill_again || null,
      coach_note: draft.coach_note || null,
      raw_report: raw,
    } as never);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save the session', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Practice session logged' });
    setRaw('');
    setDraft(null);
    reload();
  };

  const stat = (label: string, value: string) => (
    <div className="text-center p-3 rounded-lg bg-muted/40">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <ScriptingBossLink />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat('Sessions This Week', String(summary.thisWeek))}
        {stat('Sessions This Month', String(summary.thisMonth))}
        {stat('Average Score This Month', summary.avgTotal === null ? '—' : `${summary.avgTotal}/30`)}
        {stat('Best Grade This Month', summary.bestGrade || '—')}
      </div>

      {canLog && (
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" /> Log a Practice Session
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder="Paste your Scripting Boss report"
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={handleParse}>Log Session</Button>
              {draft && (
                <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>
                  Cancel
                </Button>
              )}
            </div>

            {draft && (
              <div className="space-y-4 border-t pt-4">
                <p className="text-xs text-muted-foreground">
                  Check what we read from your report, fix anything that looks wrong, then save. The original text is always kept.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Date</Label>
                    <Input type="date" value={draft.session_date} onChange={e => setField('session_date', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Scenario</Label>
                    <Input value={draft.scenario} onChange={e => setField('scenario', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Mode</Label>
                    <Input value={draft.mode} onChange={e => setField('mode', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">Exchanges</Label>
                    <Input
                      type="number"
                      value={draft.exchanges ?? ''}
                      onChange={e => setField('exchanges', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {SCORE_FIELDS.map(f => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label} (0-5)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        value={(draft[f.key] as number | null) ?? ''}
                        onChange={e => setField(f.key, e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </div>
                  ))}
                  <div>
                    <Label className="text-xs">Total (0-30)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={30}
                      value={draft.total ?? ''}
                      onChange={e => setField('total', e.target.value === '' ? null : Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Grade</Label>
                    <Input value={draft.grade} onChange={e => setField('grade', e.target.value.toUpperCase())} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="appt-set"
                    checked={draft.appointment_set === true}
                    onCheckedChange={c => setField('appointment_set', c === true)}
                  />
                  <Label htmlFor="appt-set" className="text-sm">This call would have produced an appointment</Label>
                </div>

                {([
                  ['strongest_moment', 'Strongest Moment'],
                  ['costliest_moment', 'Costliest Moment'],
                  ['structure_covered', 'Structure Covered'],
                  ['magic_words_used', 'Magic Words Used'],
                  ['magic_words_missed', 'Magic Words Missed'],
                  ['one_thing_to_change', 'One Thing to Change'],
                  ['drill_again', 'Drill Again'],
                  ['coach_note', 'Coach Note'],
                ] as [keyof ParsedPracticeReport, string][]).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Textarea
                      value={(draft[key] as string) || ''}
                      onChange={e => setField(key, e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                ))}

                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save Session'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle className="text-lg font-display">Past Sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && sessions.length === 0 && (
            <p className="text-sm text-muted-foreground">— no sessions yet</p>
          )}
          {sessions.map(s => {
            const open = expanded === s.id;
            return (
              <div key={s.id} className="rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : s.id)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/40"
                >
                  <span className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-medium">{format(parseISO(s.session_date), 'MMM d, yyyy')}</span>
                    <span className="text-muted-foreground">{s.scenario || '—'}</span>
                    <Badge variant="outline" className={gradeColor(s.grade)}>{s.grade || '—'}</Badge>
                    <span className="text-muted-foreground">{s.total === null ? '—' : `${s.total}/30`}</span>
                    <span className="text-muted-foreground">
                      Appointment: {s.appointment_set === null ? '—' : s.appointment_set ? 'Yes' : 'No'}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="space-y-3 border-t border-border p-3 text-sm">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {SCORE_FIELDS.map(f => (
                        <div key={f.key} className="rounded-md bg-muted/30 p-2 text-center">
                          <p className="text-lg font-bold">{(s[f.key] as number | null) ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                        </div>
                      ))}
                    </div>
                    {([
                      ['mode', 'Mode'],
                      ['exchanges', 'Exchanges'],
                      ['strongest_moment', 'Strongest Moment'],
                      ['costliest_moment', 'Costliest Moment'],
                      ['structure_covered', 'Structure Covered'],
                      ['magic_words_used', 'Magic Words Used'],
                      ['magic_words_missed', 'Magic Words Missed'],
                      ['one_thing_to_change', 'One Thing to Change'],
                      ['drill_again', 'Drill Again'],
                      ['coach_note', 'Coach Note'],
                    ] as [keyof PracticeSession, string][]).map(([key, label]) => (
                      <p key={String(key)}>
                        <span className="text-muted-foreground">{label}: </span>
                        {(s[key] as string | number | null) ?? '—'}
                      </p>
                    ))}
                    {s.raw_report && (
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">Original report</summary>
                        <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-2 text-xs">{s.raw_report}</pre>
                      </details>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default PracticeTab;
