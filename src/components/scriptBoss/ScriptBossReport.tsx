import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  transcript: { role: 'agent' | 'client'; text: string }[] | null;
  [k: string]: unknown;
}

export function ScriptBossReport({ row, collapsible = false }: { row: ScriptBossReportRow; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const [showTranscript, setShowTranscript] = useState(false);
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
          {format(parseISO(row.created_at), 'MMM d, yyyy h:mm a')} · {row.mode}{mins ? ` · ${mins} min` : ''} · Appointment set: {row.appointment_set ? 'Yes' : 'No'}
          {row.agent_talk_pct != null ? ` · You talked ${row.agent_talk_pct}% / client ${100 - row.agent_talk_pct}%` : ''}
        </p>
        {collapsible && <Button variant="link" className="px-0 h-auto self-start" onClick={() => setOpen(o => !o)}>{open ? 'Hide report' : 'Show report'}</Button>}
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
          {([
            ['Strongest moment', row.strongest_moment], ['Costliest moment', row.costliest_moment],
            ['Magic words used', row.magic_words_used], ['Magic words missed', row.magic_words_missed],
            ['One thing to change', row.one_thing_to_change], ['Drill again', row.drill_again], ['Coach note', row.coach_note],
          ] as const).filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div><p>{v}</p></div>
          ))}
          {row.transcript?.length ? (
            <div>
              <Button variant="outline" size="sm" onClick={() => setShowTranscript(s => !s)}>{showTranscript ? 'Hide transcript' : 'Show transcript'}</Button>
              {showTranscript && (
                <div className="mt-2 space-y-1 rounded-md bg-muted/30 p-3">
                  {row.transcript.map((t, i) => <p key={i}><strong>{t.role === 'agent' ? 'You' : 'Client'}:</strong> {t.text}</p>)}
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}
