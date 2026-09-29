import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { SCORE_FIELDS } from '@/lib/practiceReport';

export interface ScriptBossReportRow {
  id: string;
  session_date: string;
  created_at: string;
  scenario: string | null;
  mode: string | null;
  total: number | null;
  grade: string | null;
  appointment_set: boolean | null;
  agent_talk_pct: number | null;
  duration_seconds: number | null;
  strongest_moment: string | null;
  costliest_moment: string | null;
  magic_words_used: string | null;
  magic_words_missed: string | null;
  one_thing_to_change: string | null;
  drill_again: string | null;
  coach_note: string | null;
  raw_report?: string | null;
  delivery?: { wpm?: number | null; avg_pause_after_question_ms?: number | null; hard_rule_applied?: boolean } | null;
  transcript: { role: 'agent' | 'client' | 'coach'; text: string; paused?: boolean }[] | null;
  [k: string]: unknown;
}

export function ScriptBossReport({ row, collapsible = false }: { row: ScriptBossReportRow; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const [showTranscript, setShowTranscript] = useState(false);
  const { toast } = useToast();
  const delivery = row.delivery ?? null;
  const mins = row.duration_seconds ? Math.max(1, Math.round(row.duration_seconds / 60)) : null;

  return (
    <Card data-testid="sb-report">
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-display text-lg">{row.scenario}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge className="text-base px-3">{row.total ?? '–'}/30</Badge>
            <Badge variant="outline" className="text-base px-3">{row.grade || '–'}</Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {format(parseISO(row.created_at), 'MMM d, yyyy h:mm a')} · {row.mode}{mins ? ` · ${mins} min` : ''} · Appointment: {row.appointment_set ? 'Yes' : 'No'}
          {row.agent_talk_pct != null ? ` · You talked ${row.agent_talk_pct}% / lead ${100 - row.agent_talk_pct}%` : ''}
          {delivery?.wpm ? ` · ${delivery.wpm} words/min` : ''}
          {delivery?.avg_pause_after_question_ms != null ? ` · ${(delivery.avg_pause_after_question_ms / 1000).toFixed(1)}s pause after questions` : ''}
        </p>
        <div className="flex gap-2">
          {collapsible && <Button variant="link" className="px-0 h-auto" onClick={() => setOpen(o => !o)}>{open ? 'Hide report' : 'Show report'}</Button>}
          {row.raw_report && (
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(String(row.raw_report)); toast({ title: 'Report copied' }); }}>
              <Copy className="h-4 w-4 mr-1" /> Copy
            </Button>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SCORE_FIELDS.map(f => (
              <div key={f.key} className="rounded-md border border-border p-2">
                <div className="text-xs text-muted-foreground">{f.label}</div>
                <div className="font-semibold text-lg">{String(row[f.key] ?? '–')}/5</div>
              </div>
            ))}
          </div>
          {delivery?.hard_rule_applied && <p className="text-sm font-medium">No specific appointment was asked for, so this call is capped at 17/30.</p>}
          {([
            ['Strongest moment', row.strongest_moment], ['Costliest moment', row.costliest_moment],
            ['Structure covered', row.structure_covered as string | null],
            ['Magic words used', row.magic_words_used], ['Magic words missed', row.magic_words_missed],
            ['One thing to change next time', row.one_thing_to_change], ['Drill this again', row.drill_again], ["Coach's note to Kristen", row.coach_note],
          ] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div><p>{v}</p></div>
          ))}
          {row.transcript?.length ? (
            <div>
              <Button variant="outline" size="sm" onClick={() => setShowTranscript(s => !s)}>{showTranscript ? 'Hide transcript' : 'Show transcript'}</Button>
              {showTranscript && (
                <div className="mt-2 space-y-1 rounded-md bg-muted/30 p-3">
                  {row.transcript.map((t, i) => <p key={i}><strong>{t.role === 'agent' ? (t.paused ? 'You (paused)' : 'You') : t.role === 'coach' ? 'Coach' : 'Lead'}:</strong> {t.text}</p>)}
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
