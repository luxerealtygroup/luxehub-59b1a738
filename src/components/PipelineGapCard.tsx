import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Target, Users, TrendingDown, Calculator, AlertTriangle, Loader2 } from 'lucide-react';
import { currentYear } from '@/components/business-planning/types';

interface Props {
  userId: string | null | undefined;
  currentPipelineCount: number;
  readOnly?: boolean;
}

export const PipelineGapCard: React.FC<Props> = ({ userId, currentPipelineCount, readOnly }) => {
  const { toast } = useToast();
  const quarter = Math.floor(new Date().getMonth() / 3) + 1;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [quarterlyGoal, setQuarterlyGoal] = useState<number>(0);
  const [falloutRate, setFalloutRate] = useState<number>(0);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    supabase
      .from('pipeline_gap_settings')
      .select('quarterly_goal, fallout_rate')
      .eq('user_id', userId)
      .eq('year', currentYear)
      .eq('quarter', quarter)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setQuarterlyGoal(Number(data.quarterly_goal) || 0);
          setFalloutRate(Number(data.fallout_rate) || 0);
        }
        setLoading(false);
      });
  }, [userId, quarter]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from('pipeline_gap_settings')
      .upsert(
        {
          user_id: userId,
          year: currentYear,
          quarter,
          quarterly_goal: quarterlyGoal,
          fallout_rate: falloutRate,
        },
        { onConflict: 'user_id,year,quarter' },
      );
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: 'Could not save gap settings', variant: 'destructive' });
      return;
    }
    toast({ title: 'Saved', description: 'Pipeline gap targets updated' });
  };

  const falloutDecimal = Math.min(Math.max(falloutRate / 100, 0), 0.99);
  const totalNeeded = quarterlyGoal > 0 ? Math.ceil(quarterlyGoal / (1 - falloutDecimal)) : 0;
  const gap = Math.max(0, totalNeeded - currentPipelineCount);
  const onTrack = quarterlyGoal > 0 && gap === 0;

  return (
    <Card className="border-gold/40 bg-gradient-to-br from-background to-gold/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-display">
          <Target className="h-5 w-5 text-gold" />
          Q{quarter} Pipeline Gap Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Quarterly Goal */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Target className="h-3 w-3" /> Quarterly Goal (deals)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={quarterlyGoal || ''}
                  onChange={(e) => setQuarterlyGoal(Number(e.target.value) || 0)}
                  disabled={readOnly}
                  placeholder="e.g. 8"
                />
              </div>

              {/* Fall-out rate */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" /> Fall-out Rate (%)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={99}
                  value={falloutRate || ''}
                  onChange={(e) => setFalloutRate(Number(e.target.value) || 0)}
                  disabled={readOnly}
                  placeholder="e.g. 20"
                />
              </div>

              {/* Current pipeline */}
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Users className="h-3 w-3" /> Current Pipeline (Q{quarter})
                </div>
                <div className="text-2xl font-bold text-foreground mt-1">{currentPipelineCount}</div>
              </div>

              {/* Total names needed */}
              <div className="rounded-lg border bg-card p-3">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calculator className="h-3 w-3" /> Total Names Needed
                </div>
                <div className="text-2xl font-bold text-foreground mt-1">{totalNeeded}</div>
              </div>

              {/* Gap */}
              <div className={`rounded-lg border p-3 ${onTrack ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'}`}>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Gap to Fill
                </div>
                <div className={`text-2xl font-bold mt-1 ${onTrack ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                  {gap}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
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