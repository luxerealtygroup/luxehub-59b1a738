import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { TrendingUp, Save, Loader2, ShieldCheck, Rocket, AlertTriangle } from 'lucide-react';
import { ActiveMetrics, GoalInputs, currentYear } from './types';
import { StatCard } from './shared';
import { Q3Requirements } from './q3Requirements';

interface Props {
  metrics: ActiveMetrics | null;
  mode: 'active' | 'planning';
  goals: GoalInputs;
  quarter: number;
  uid: string | null;
  isViewingAsAgent: boolean;
  effectiveRates: { contactToAppt: number; apptToContract: number; cmaToListing: number; dialsToAppt: number };
  q3Requirements: Q3Requirements;
}

export function ActionPlanTab({ metrics, mode, goals, quarter, uid, isViewingAsAgent, effectiveRates, q3Requirements }: Props) {
  const { toast } = useToast();
  const [shareWithAdmin, setShareWithAdmin] = useState(false);

  // Calculated weekly targets — sales count sourced from canonical Q-Requirements
  const requiredClosings = q3Requirements.q3SalesNeeded;
  const requiredAppts = effectiveRates.apptToContract > 0 ? Math.ceil(requiredClosings / (effectiveRates.apptToContract / 100)) : 0;
  const requiredContacts = effectiveRates.contactToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.contactToAppt / 100)) : 0;
  const requiredDials = effectiveRates.dialsToAppt > 0 ? Math.ceil(requiredAppts / (effectiveRates.dialsToAppt / 100)) : 0;

  const weeksInQ = 13;
  const weekly = (v: number) => Math.ceil(v / weeksInQ);

  const reqWeeklyDials = weekly(requiredDials);
  const reqWeeklyContacts = weekly(requiredContacts);
  const reqWeeklyAppts = weekly(requiredAppts);

  // Team non-negotiable floor — committed minimums every agent owes the team
  const FLOOR = {
    conversations: 10, // conversations / week
    pipelineAdds: 3,   // new pipeline contacts / week
    appointments: 1,   // appointments / week
  } as const;

  // Display caps for stretch numbers — anything above this signals a lead-source issue
  const DIAL_CAP = 20;
  const CONTACT_CAP = 15;
  const dialsOverCap = reqWeeklyDials > DIAL_CAP;
  const contactsOverCap = reqWeeklyContacts > CONTACT_CAP;
  const anyOverCap = dialsOverCap || contactsOverCap;
  const displayDials = dialsOverCap ? `${DIAL_CAP}+` : formatNumber(reqWeeklyDials);
  const displayContacts = contactsOverCap ? `${CONTACT_CAP}+` : formatNumber(reqWeeklyContacts);

  // Conversion-rate sanity check (mirrors StrategyGoalsTab)
  const ratesOver100 = Object.values(effectiveRates).some(v => v > 100);

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
          {ratesOver100 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-foreground">
                One or more conversion rates exceed 100% — the math below may be off. Review your rates with Kristen.
              </p>
            </div>
          )}
          {goals.gci_target <= 0 ? (
            <p className="text-sm text-muted-foreground">Set a GCI target in Q{quarter} Strategy & Goals to auto-calculate weekly targets.</p>
          ) : (
            <>
              {/* Tier 1 — Non-Negotiable Floor */}
              <div className="rounded-lg border-2 border-gold/50 bg-gold/5 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-5 w-5 text-gold" />
                  <h3 className="text-base font-bold">Non-Negotiable Weekly Floor</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Team-committed minimums. Hit these every week, no exceptions.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Conversations / week" value={formatNumber(FLOOR.conversations)} />
                  <StatCard label="Pipeline adds / week" value={formatNumber(FLOOR.pipelineAdds)} />
                  <StatCard label="Appointments / week" value={formatNumber(FLOOR.appointments)} />
                </div>
              </div>

              {/* Tier 2 — Stretch (what closes the gap faster) */}
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Rocket className="h-5 w-5 text-gold" />
                  <h3 className="text-base font-bold">What it would take to close your gap faster</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Stretch target — calculated from your Q{quarter} pipeline math. Not a requirement.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard label="Weekly Dials (stretch)" value={displayDials} />
                  <StatCard label="Weekly Contacts (stretch)" value={displayContacts} />
                  <StatCard label="Weekly Appts (stretch)" value={formatNumber(reqWeeklyAppts)} />
                  <StatCard label="Weekly Closings (stretch)" value={formatNumber(weekly(requiredClosings))} />
                </div>
                {anyOverCap && (
                  <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-foreground">
                      This number is high — talk to Kristen about your lead source mix in your Tuesday session.
                    </p>
                  </div>
                )}
              </div>

              {/* Two-tier Required Activity Breakdown */}
              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-4 py-2 bg-muted/40 border-b border-border">
                  <h3 className="text-sm font-bold">Required Activity Breakdown</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Activity</th>
                      <th className="text-right px-4 py-2 font-semibold">Non-Negotiable Floor</th>
                      <th className="text-right px-4 py-2 font-semibold">Stretch (gap-close)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">Dials / week</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-4 py-2 text-right font-semibold">{displayDials}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">Conversations / week</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatNumber(FLOOR.conversations)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{displayContacts}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">Pipeline adds / week</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatNumber(FLOOR.pipelineAdds)}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">Appointments / week</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatNumber(FLOOR.appointments)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatNumber(reqWeeklyAppts)}</td>
                    </tr>
                    <tr className="border-t border-border">
                      <td className="px-4 py-2">Closings / week</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">—</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatNumber(weekly(requiredClosings))}</td>
                    </tr>
                  </tbody>
                </table>
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

          {/* Bottom floor action card — always visible */}
          <div className="rounded-lg border-2 border-gold/50 bg-gold/5 p-4">
            <p className="text-sm font-semibold text-foreground">
              This week: have {formatNumber(FLOOR.conversations)} conversations, add {formatNumber(FLOOR.pipelineAdds)} new people to your pipeline, and book {formatNumber(FLOOR.appointments)} appointment.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              That's the floor — hit it every week.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
