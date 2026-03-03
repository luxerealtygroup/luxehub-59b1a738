import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TrendingUp, Save, Loader2 } from 'lucide-react';
import { ActiveMetrics, GoalInputs, currentYear } from './types';
import { StatCard } from './shared';

interface Props {
  metrics: ActiveMetrics | null;
  mode: 'active' | 'planning';
  goals: GoalInputs;
  quarter: number;
  uid: string | null;
  isViewingAsAgent: boolean;
  effectiveRates: { contactToAppt: number; apptToContract: number; cmaToListing: number; dialsToAppt: number };
}

export function ActionPlanTab({ metrics, mode, goals, quarter, uid, isViewingAsAgent, effectiveRates }: Props) {
  const { toast } = useToast();
  const [shareWithAdmin, setShareWithAdmin] = useState(false);

  // Calculated weekly targets
  const netPerDeal = goals.avg_commission * (goals.split_percent / 100);
  const requiredClosings = netPerDeal > 0 ? Math.ceil(goals.gci_target / netPerDeal) : 0;
  const requiredAppts = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredContacts = effectiveRates.contactToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.contactToAppt / 100)) : 0;
  const requiredDials = effectiveRates.dialsToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.dialsToAppt / 100)) : 0;

  const weeksInQ = 13;
  const weekly = (v: number) => Math.ceil(v / weeksInQ);

  const reqWeeklyDials = weekly(requiredDials);
  const reqWeeklyContacts = weekly(requiredContacts);
  const reqWeeklyAppts = weekly(requiredAppts);

  const projections = metrics && goals.gci_target > 0 ? (() => {
    const dialGap = reqWeeklyDials - metrics.weeklyAvgDials;
    const contactGap = reqWeeklyContacts - metrics.weeklyAvgContacts;
    const apptGap = reqWeeklyAppts - metrics.weeklyAvgAppts;
    const paceGCI = Math.round(metrics.ytdGCI * 4);
    const missAmount = goals.gci_target - paceGCI;
    const increasePct = metrics.weeklyAvgDials > 0 ? Math.round((dialGap / metrics.weeklyAvgDials) * 100) : 0;
    return { dialGap, contactGap, apptGap, missAmount, increasePct, paceGCI };
  })() : null;

  return (
    <div className="space-y-6">
      {/* Weekly Activity Targets */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-gold" />
              Weekly Action Plan — Q{quarter}
            </CardTitle>
            {!isViewingAsAgent && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Share with admin</Label>
                <Switch checked={shareWithAdmin} onCheckedChange={setShareWithAdmin} />
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {goals.gci_target <= 0 ? (
            <p className="text-sm text-muted-foreground">Set a GCI target in Q{quarter} Strategy & Goals to auto-calculate weekly targets.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Weekly Dials Target" value={formatNumber(reqWeeklyDials)} />
                <StatCard label="Weekly Contacts Target" value={formatNumber(reqWeeklyContacts)} />
                <StatCard label="Weekly Appts Target" value={formatNumber(reqWeeklyAppts)} />
                <StatCard label="Weekly Closings Target" value={formatNumber(weekly(requiredClosings))} />
              </div>

              {/* Gap analysis (active only) */}
              {mode === 'active' && projections && (
                <>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mt-4">Current vs Required</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { label: 'Dial Increase / Week', value: projections.dialGap, current: metrics!.weeklyAvgDials, required: reqWeeklyDials },
                      { label: 'Contact Increase / Week', value: projections.contactGap, current: metrics!.weeklyAvgContacts, required: reqWeeklyContacts },
                      { label: 'Appt Increase / Week', value: projections.apptGap, current: metrics!.weeklyAvgAppts, required: reqWeeklyAppts },
                    ].map(p => (
                      <div key={p.label} className={`rounded-lg border p-4 ${p.value > 0 ? 'border-destructive/40 bg-destructive/5' : 'border-green-500/40 bg-green-500/5'}`}>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{p.label}</p>
                        <p className={`text-2xl font-bold ${p.value > 0 ? 'text-destructive' : 'text-green-600'}`}>
                          {p.value > 0 ? `+${formatNumber(p.value)}` : 'On Pace'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Current: {formatNumber(p.current)} → Required: {formatNumber(p.required)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    {projections.missAmount > 0 ? (
                      <StatCard label={`At current pace you will miss Q${quarter} by`} value={formatCurrency(projections.missAmount)} danger />
                    ) : (
                      <StatCard label={`Q${quarter} Projection`} value="On Track" />
                    )}
                    <StatCard
                      label="Required Production Increase"
                      value={projections.increasePct > 0 ? `${projections.increasePct}%` : '0%'}
                      danger={projections.increasePct > 0}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
