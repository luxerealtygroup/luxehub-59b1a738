import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { blockPortalWrite, usePortalPreview } from '@/hooks/usePortalPreview';
import { Calendar, Check, Loader2, Lock, Plus, Circle } from 'lucide-react';

import { format } from 'date-fns';

import { PortalScope, scopePropertyId } from '@/lib/portalScope';

interface StageEntry {
  stage: string;
  reachedAt: string | null;
  deal?: FUBDeal;
}

interface TimelineNote {
  id: string;
  stage: string;
  note: string;
  created_at: string;
  user_id: string;
  is_internal?: boolean;
}


interface FUBTimelineProps {
  fubPersonId: number | null | undefined;
  clientAccountId: string;
  canAddNotes?: boolean; // agent side
  /** Restrict the timeline to a single Follow Up Boss deal (per-transaction view). */
  fubDealId?: number | null;
  /** Scope timeline notes to a specific transaction. */
  transactionId?: string | null;
  /** Property scope: 'all', 'general' (portal-wide only) or a property id. */
  scope?: PortalScope;
}

// Canonical ordered stage buckets. FUB stage names are matched case-insensitively
// via includes(); anything unmatched is appended at the end.
const CANONICAL_STAGES = [
  'Lead',
  'Active',
  'Under Contract',
  'Inspection',
  'Financing',
  'Closing',
  'Closed',
];

function normalizeStages(deals: FUBDeal[]): StageEntry[] {
  const seen = new Map<string, StageEntry>();
  for (const d of deals) {
    const name = d.stageName?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const prev = seen.get(key);
    const reachedAt = d.createdAt ?? null;
    if (!prev || (reachedAt && prev.reachedAt && reachedAt < prev.reachedAt)) {
      seen.set(key, { stage: name, reachedAt, deal: d });
    }
  }
  const entries = Array.from(seen.values());
  entries.sort((a, b) => {
    const ai = CANONICAL_STAGES.findIndex((s) => a.stage.toLowerCase().includes(s.toLowerCase()));
    const bi = CANONICAL_STAGES.findIndex((s) => b.stage.toLowerCase().includes(s.toLowerCase()));
    const av = ai === -1 ? 99 : ai;
    const bv = bi === -1 ? 99 : bi;
    if (av !== bv) return av - bv;
    return (a.reachedAt ?? '').localeCompare(b.reachedAt ?? '');
  });
  return entries;
}

export function FUBTimeline({
  fubPersonId,
  clientAccountId,
  canAddNotes = false,
  fubDealId = null,
  transactionId = null,
  scope = 'all',
}: FUBTimelineProps) {
  const { toast } = useToast();
  const { isPreview } = usePortalPreview();
  const [stages, setStages] = useState<StageEntry[]>([]);
  const [notes, setNotes] = useState<TimelineNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Stage notes read as agent notes, so they default to internal (agent-only).
  const [draftInternal, setDraftInternal] = useState<Record<string, boolean>>({});
  const [savingStage, setSavingStage] = useState<string | null>(null);
  // Internal notes are blocked for clients by RLS; the preview runs on the
  // agent's session, so filter them out to keep the preview accurate.
  const showInternal = canAddNotes && !isPreview;



  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);

      const [dealsRes, notesRes] = await Promise.all([
        fubPersonId
          ? followUpBossApi.getPersonDeals(fubPersonId)
          : Promise.resolve({ success: true, data: { deals: [] } } as any),
        (() => {
          if (!clientAccountId) return Promise.resolve({ data: [], error: null } as any);
          let q = supabase
            .from('portal_timeline_notes')
            .select('*')
            .eq('client_account_id', clientAccountId);
          q = transactionId ? q.eq('transaction_id', transactionId) : q.is('transaction_id', null);
          if (scope === 'general') q = q.is('property_id', null);
          else if (scope !== 'all') q = q.eq('property_id', scope);
          if (!showInternal) q = q.eq('is_internal', false);
          return q.order('created_at', { ascending: false });

        })(),
      ]);

      if (cancelled) return;

      if (!dealsRes.success) {
        setError(dealsRes.error || 'Unable to load Follow Up Boss deals');
      } else {
        let deals = dealsRes.data?.deals ?? [];
        if (fubDealId) {
          deals = deals.filter((d) => Number(d.id) === Number(fubDealId));
        }
        setStages(normalizeStages(deals));
      }
      if (!notesRes.error && notesRes.data) {
        setNotes(notesRes.data as TimelineNote[]);
      }
      setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [fubPersonId, clientAccountId, fubDealId, transactionId, scope, showInternal]);

  const canAddNotesHere = canAddNotes && !isPreview;

  const currentStageName = stages[stages.length - 1]?.stage ?? null;

  const notesByStage = useMemo(() => {
    const map: Record<string, TimelineNote[]> = {};
    for (const n of notes) {
      (map[n.stage] ??= []).push(n);
    }
    return map;
  }, [notes]);

  const isDraftInternal = (stage: string) => draftInternal[stage] ?? true;

  const toggleNoteInternal = async (note: TimelineNote) => {
    if (blockPortalWrite('Changing note visibility')) return;
    const next = !note.is_internal;
    const { error } = await supabase
      .from('portal_timeline_notes')
      .update({ is_internal: next })
      .eq('id', note.id);
    if (error) {
      toast({ title: 'Could not change visibility', description: error.message, variant: 'destructive' });
      return;
    }
    setNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, is_internal: next } : n)));
    toast({ title: next ? 'Marked internal' : 'Now visible to client' });
  };

  const addNote = async (stage: string) => {
    if (blockPortalWrite('Adding timeline notes')) return;
    const text = (draft[stage] || '').trim();
    if (!text) return;
    setSavingStage(stage);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavingStage(null);
      return;
    }
    const { data, error } = await supabase
      .from('portal_timeline_notes')
      .insert({
        client_account_id: clientAccountId,
        user_id: user.id,
        stage,
        note: text,
        transaction_id: transactionId,
        property_id: scopePropertyId(scope),
        is_internal: isDraftInternal(stage),
      })
      .select()
      .single();
    setSavingStage(null);
    if (error) {
      toast({ title: 'Could not save note', description: error.message, variant: 'destructive' });
      return;
    }
    setNotes([data as TimelineNote, ...notes]);
    setDraft({ ...draft, [stage]: '' });
    setDraftInternal({ ...draftInternal, [stage]: true });
  };


  return (
    <Card className="luxe-card">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Calendar className="h-4 w-4" />
          </div>
          <div>
            <p className="eyebrow leading-none">Progress</p>
            <CardTitle className="font-display text-lg font-semibold tracking-tight mt-1">
              Transaction Timeline
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading stages…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : stages.length === 0 ? (
          <div className="text-center py-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Stages will appear here as your agent moves your transaction forward.
            </p>
          </div>
        ) : (
          (() => {
            // Compute upcoming stages from the canonical order after the current stage
            const currentCanonicalIdx = CANONICAL_STAGES.findIndex((s) =>
              currentStageName?.toLowerCase().includes(s.toLowerCase()),
            );
            const reachedKeys = new Set(stages.map((s) => s.stage.toLowerCase()));
            const upcoming =
              currentCanonicalIdx >= 0
                ? CANONICAL_STAGES.slice(currentCanonicalIdx + 1).filter(
                    (s) => !reachedKeys.has(s.toLowerCase()),
                  )
                : [];
            const total = stages.length + upcoming.length;

            return (
              <div className="relative pl-1">
                <div className="absolute left-[13px] top-3 bottom-3 w-px bg-gradient-to-b from-primary/30 via-border to-border" />
                <ol className="space-y-6">
                  {stages.map((entry, i) => {
                    const isCurrent = entry.stage === currentStageName;
                    const isComplete = !isCurrent;
                    const stageNotes = notesByStage[entry.stage] || [];
                    return (
                      <li key={entry.stage + i} className="relative flex gap-4">
                        <div
                          className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ${
                            isCurrent
                              ? 'bg-primary ring-primary/15 animate-soft-pulse'
                              : 'bg-emerald-500 ring-emerald-500/15'
                          }`}
                        >
                          {isCurrent ? (
                            <div className="h-2 w-2 rounded-full bg-white" />
                          ) : (
                            <Check className="h-4 w-4 text-white" strokeWidth={3} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p
                              className={`font-display text-base font-semibold tracking-tight ${
                                isCurrent ? 'text-foreground' : 'text-foreground/90'
                              }`}
                            >
                              {entry.stage}
                            </p>
                            {isCurrent ? (
                              <span className="chip-gold">Current</span>
                            ) : (
                              <span className="chip-success">
                                <Check className="h-3 w-3" /> Complete
                              </span>
                            )}
                          </div>
                          {entry.reachedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {isCurrent ? 'Started' : 'Reached'}{' '}
                              {format(new Date(entry.reachedAt), 'MMM d, yyyy')}
                            </p>
                          )}
                          {stageNotes.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              {stageNotes.map((n) => (
                                <div
                                  key={n.id}
                                  className={`rounded-lg border px-3 py-2 text-sm ${
                                    n.is_internal
                                      ? 'border-dashed border-amber-500/50 bg-muted/60'
                                      : 'border-border/60 bg-muted/40'
                                  }`}
                                >
                                  <p className={`whitespace-pre-wrap ${n.is_internal ? 'text-muted-foreground' : ''}`}>{n.note}</p>
                                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    <p className="text-[10px] text-muted-foreground">
                                      {format(new Date(n.created_at), 'MMM d, yyyy · h:mm a')}
                                    </p>
                                    {n.is_internal && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                                        <Lock className="h-3 w-3" /> Internal
                                      </span>
                                    )}
                                    {canAddNotesHere && (
                                      <button
                                        type="button"
                                        onClick={() => toggleNoteInternal(n)}
                                        className="text-[10px] underline text-muted-foreground hover:text-foreground"
                                      >
                                        {n.is_internal ? 'Make visible to client' : 'Mark internal'}
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {canAddNotesHere && (
                            <div className="mt-3 space-y-2">
                              <Textarea
                                placeholder={`Add a note for "${entry.stage}"…`}
                                value={draft[entry.stage] || ''}
                                onChange={(e) =>
                                  setDraft({ ...draft, [entry.stage]: e.target.value })
                                }
                                rows={2}
                                className="text-sm rounded-lg"
                              />
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Switch
                                    id={`note-internal-${entry.stage}`}
                                    checked={isDraftInternal(entry.stage)}
                                    onCheckedChange={(v) =>
                                      setDraftInternal({ ...draftInternal, [entry.stage]: v })
                                    }
                                  />
                                  <Label
                                    htmlFor={`note-internal-${entry.stage}`}
                                    className="text-xs cursor-pointer flex items-center gap-1"
                                  >
                                    <Lock className="h-3 w-3" />
                                    {isDraftInternal(entry.stage) ? 'Internal (agent-only)' : 'Visible to client'}
                                  </Label>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => addNote(entry.stage)}
                                  disabled={
                                    savingStage === entry.stage ||
                                    !(draft[entry.stage] || '').trim()
                                  }
                                >
                                  {savingStage === entry.stage ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Plus className="h-3 w-3 mr-1" />
                                  )}
                                  Add note
                                </Button>
                              </div>
                            </div>
                          )}

                        </div>
                      </li>
                    );
                  })}
                  {upcoming.map((s) => (
                    <li key={`upcoming-${s}`} className="relative flex gap-4 opacity-70">
                      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background ring-4 ring-border/40 border border-border">
                        <Circle className="h-2 w-2 text-muted-foreground" fill="currentColor" />
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="font-display text-base font-medium tracking-tight text-muted-foreground">
                            {s}
                          </p>
                          <span className="chip-muted">Upcoming</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
                {total > 0 && (
                  <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    {stages.length} of {total} stages complete
                  </p>
                )}
              </div>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}