import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Target, Users, TrendingDown, Calculator, AlertTriangle, Loader2 } from 'lucide-react';
import { rollingCalendarQuarters } from '@/lib/pipelineQuarters';
import { useQuarterlyPipelineSummary } from '@/hooks/useQuarterlyPipelineSummary';

interface Props {
  userId: string | null | undefined;
  /** Whose pipeline the counts come from. Pass null for the whole company/team. */
  scopeUserId?: string | null;
  readOnly?: boolean;
}

interface GapSettings {
  goal: number;
  fallout: number;
}

const emptySettings = (): GapSettings => ({ goal: 0, fallout: 0 });

const computeGap = (settings: GapSettings, pipelineCount: number) => {
  const falloutDecimal = Math.min(Math.max(settings.fallout / 100, 0), 0.99);
  const totalNeeded = settings.goal > 0 ? Math.ceil(settings.goal / (1 - falloutDecimal)) : 0;
  const gap = Math.max(0, totalNeeded - pipelineCount);
  return { totalNeeded, gap, onTrack: settings.goal > 0 && gap === 0 };
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'plain' | 'good' | 'bad' }> = ({
  icon,
  label,
  value,
  tone = 'plain',
}) => (
  <div
    className={`rounded-lg border p-3 min-w-0 ${
      tone === 'good'
        ? 'border-emerald-500/40 bg-emerald-500/10'
        : tone === 'bad'
          ? 'border-destructive/40 bg-destructive/10'
          : 'bg-card'
    }`}
  >
    <div className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</div>
    <div
      className={`text-2xl font-bold mt-1 ${
        tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
      }`}
    >
      {value}
    </div>
  </div>
);

export const PipelineGapCard: React.FC<Props> = ({ userId, scopeUserId, readOnly }) => {
  const { toast } = useToast();
  const periods = useMemo(() => rollingCalendarQuarters(), []);
  const scope = scopeUserId === undefined ? userId : scopeUserId;
  const { summary, loading: countsLoading } = useQuarterlyPipelineSummary(scope);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentSettings, setCurrentSettings] = useState<GapSettings>(emptySettings());
  const [nextSettings, setNextSettings] = useState<GapSettings>(emptySettings());

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data } = await supabase
        .from('pipeline_gap_settings')
        .select('year, quarter, quarterly_goal, fallout_rate')
        .eq('user_id', userId)
        .in('year', Array.from(new Set([periods.current.year, periods.next.year])));
      if (cancelled) return;
      const pick = (year: number, quarter: number) => {
        const row = (data || []).find((r) => Number(r.year) === year && Number(r.quarter) === quarter);
        return row ? { goal: Number(row.quarterly_goal) || 0, fallout: Number(row.fallout_rate) || 0 } : emptySettings();
      };
      setCurrentSettings(pick(periods.current.year, periods.current.quarter));
      setNextSettings(pick(periods.next.year, periods.next.quarter));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, periods]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase.from('pipeline_gap_settings').upsert(
      [
        {
          user_id: userId,
          year: periods.current.year,
          quarter: periods.current.quarter,
          quarterly_goal: currentSettings.goal,
          fallout_rate: currentSettings.fallout,
        },
        {
          user_id: userId,
          year: periods.next.year,
          quarter: periods.next.quarter,
          quarterly_goal: nextSettings.goal,
          fallout_rate: nextSettings.fallout,
        },
      ],
      { onConflict: 'user_id,year,quarter' },
    );
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: 'Could not save gap settings', variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved', description: 'Pipeline gap targets updated' });
  };

  const currentCount = summary ? Math.round(summary.current.units * 10) / 10 : 0;
  const nextCount = summary ? Math.round(summary.next.units * 10) / 10 : 0;
  const currentGap = computeGap(currentSettings, currentCount);
  const nextGap = computeGap(nextSettings, nextCount);

  const combinedGoal = currentSettings.goal + nextSettings.goal;
  const combinedNeeded = currentGap.totalNeeded + nextGap.totalNeeded;
  const combinedCount = Math.round((currentCount + nextCount) * 10) / 10;
  const combinedGapValue = Math.max(0, combinedNeeded - combinedCount);
  const combinedOnTrack = combinedGoal > 0 && combinedGapValue === 0;

  const panel = (
    label: string,
    settings: GapSettings,
    setSettings: (s: GapSettings) => void,
    count: number,
    gap: ReturnType<typeof computeGap>,
  ) => (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4 space-y-3 min-w-0">
      <div className="font-display text-base text-foreground">{label}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1 min-w-0">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" /> Quarterly Goal (deals)
          </Label>
          <Input
            type="number"
            min={0}
            value={settings.goal || ''}
            onChange={(e) => setSettings({ ...settings, goal: Number(e.target.value) || 0 })}
            disabled={readOnly}
            placeholder="e.g. 8"
          />
        </div>
        <div className="space-y-1 min-w-0">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Fall-out Rate (%)
          </Label>
          <Input
            type="number"
            min={0}
            max={99}
            value={settings.fallout || ''}
            onChange={(e) => setSettings({ ...settings, fallout: Number(e.target.value) || 0 })}
            disabled={readOnly}
            placeholder="e.g. 20"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Metric icon={<Users className="h-3 w-3" />} label="Current Pipeline" value={count} />
        <Metric icon={<Calculator className="h-3 w-3" />} label="Total Names Needed" value={gap.totalNeeded} />
        <Metric
          icon={<AlertTriangle className="h-3 w-3" />}
          label="Gap to Fill"
          value={gap.gap}
          tone={gap.onTrack ? 'good' : 'bad'}
        />
      </div>
    </div>
  );

  return (
    <Card className="border-gold/40 bg-gradient-to-br from-background to-gold/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg font-display">
          <Target className="h-5 w-5 text-gold" />
          Pipeline Gap Analysis — {periods.current.label} &amp; {periods.next.label}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Entered in {periods.current.year}, excluding lost/cancelled · assigned by actual or linked closing date, then
          expected closing date · sales 1 unit, leases 0.33
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading || countsLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {panel(periods.current.label, currentSettings, setCurrentSettings, currentCount, currentGap)}
              {panel(periods.next.label, nextSettings, setNextSettings, nextCount, nextGap)}
            </div>

            <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 space-y-3 min-w-0">
              <div className="font-display text-base text-foreground">
                {periods.combinedLabel} Total
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Metric icon={<Target className="h-3 w-3" />} label="Goal (deals)" value={combinedGoal} />
                <Metric icon={<Users className="h-3 w-3" />} label="Current Pipeline" value={combinedCount} />
                <Metric icon={<Calculator className="h-3 w-3" />} label="Total Names Needed" value={combinedNeeded} />
                <Metric
                  icon={<AlertTriangle className="h-3 w-3" />}
                  label="Gap to Fill"
                  value={combinedGapValue}
                  tone={combinedOnTrack ? 'good' : 'bad'}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
              <span>
                Formula: Total Needed = Goal ÷ (1 − Fall-out %). Gap = Total Needed − Current Pipeline.
              </span>
              {!readOnly && (
                <Button size="sm" onClick={handleSave} disabled={saving} className="bg-gold hover:bg-gold/90">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PipelineGapCard;
