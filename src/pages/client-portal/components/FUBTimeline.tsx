import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Calendar, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { format } from 'date-fns';

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
}

interface FUBTimelineProps {
  fubPersonId: number | null | undefined;
  clientAccountId: string;
  canAddNotes?: boolean; // agent side
  /** Restrict the timeline to a single Follow Up Boss deal (per-transaction view). */
  fubDealId?: number | null;
  /** Scope timeline notes to a specific transaction. */
  transactionId?: string | null;
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
}: FUBTimelineProps) {
  const { toast } = useToast();
  const [stages, setStages] = useState<StageEntry[]>([]);
  const [notes, setNotes] = useState<TimelineNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingStage, setSavingStage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);

      const [dealsRes, notesRes] = await Promise.all([
        fubPersonId
          ? followUpBossApi.getPersonDeals(fubPersonId)
          : Promise.resolve({ success: true, data: { deals: [] } } as any),
        (transactionId
          ? supabase
              .from('portal_timeline_notes')
              .select('*')
              .eq('client_account_id', clientAccountId)
              .eq('transaction_id', transactionId)
              .order('created_at', { ascending: false })
          : supabase
              .from('portal_timeline_notes')
              .select('*')
              .eq('client_account_id', clientAccountId)
              .is('transaction_id', null)
              .order('created_at', { ascending: false })),
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
  }, [fubPersonId, clientAccountId, fubDealId, transactionId]);

  const currentStageName = stages[stages.length - 1]?.stage ?? null;

  const notesByStage = useMemo(() => {
    const map: Record<string, TimelineNote[]> = {};
    for (const n of notes) {
      (map[n.stage] ??= []).push(n);
    }
    return map;
  }, [notes]);

  const addNote = async (stage: string) => {
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
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Transaction Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading stages…
          </div>
        ) : error ? (
          <p className="text-sm text-destructive py-4">{error}</p>
        ) : stages.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">
            No Follow Up Boss deal stages yet. Stages will appear here as your agent moves the transaction forward.
          </p>
        ) : (
          <div className="relative">
            <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />
            <div className="space-y-6">
              {stages.map((entry, i) => {
                const isCurrent = entry.stage === currentStageName;
                const stageNotes = notesByStage[entry.stage] || [];
                return (
                  <div key={entry.stage + i} className="relative flex gap-4">
                    <div
                      className={`relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        isCurrent ? 'bg-primary ring-4 ring-primary/20' : 'bg-green-500'
                      }`}
                    >
                      {isCurrent ? (
                        <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{entry.stage}</p>
                        {isCurrent && (
                          <Badge variant="secondary" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      {entry.reachedAt && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Reached {format(new Date(entry.reachedAt), 'MMM d, yyyy')}
                        </p>
                      )}
                      {stageNotes.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {stageNotes.map((n) => (
                            <div key={n.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                              <p className="whitespace-pre-wrap">{n.note}</p>
                              <p className="text-[10px] text-muted-foreground mt-1">
                                {format(new Date(n.created_at), 'MMM d, yyyy · h:mm a')}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      {canAddNotes && (
                        <div className="mt-2 space-y-2">
                          <Textarea
                            placeholder={`Add a note for "${entry.stage}"…`}
                            value={draft[entry.stage] || ''}
                            onChange={(e) => setDraft({ ...draft, [entry.stage]: e.target.value })}
                            rows={2}
                            className="text-sm"
                          />
                          <Button
                            size="sm"
                            onClick={() => addNote(entry.stage)}
                            disabled={savingStage === entry.stage || !(draft[entry.stage] || '').trim()}
                          >
                            {savingStage === entry.stage ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Plus className="h-3 w-3 mr-1" />
                            )}
                            Add note
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}