import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Target, Send, Phone, Users, CalendarCheck, TrendingUp, FileText, Lock } from 'lucide-react';
import { formatNumber } from '@/lib/utils';

interface ConversionRates {
  contactToAppt: number;   // percentage e.g. 20
  dialToAppt: number;      // percentage e.g. 10
  apptToPipeline: number;  // percentage e.g. 30
  apptToContract: number;  // percentage e.g. 25
  cmaToListing: number;    // percentage e.g. 30
}

interface Props {
  pipelineDeficit: number;
  quarter: number;
  conversionRates: ConversionRates;
  userId: string | null;
  isReadOnly?: boolean;
  adjustedClosingsNeeded?: number;
}

function getWeeksRemaining(quarter: number): number {
  const year = new Date().getFullYear();
  const quarterEnds: Record<number, string> = {
    1: `${year}-03-31`, 2: `${year}-06-30`,
    3: `${year}-09-30`, 4: `${year}-12-31`,
  };
  const endDate = new Date(quarterEnds[quarter] || quarterEnds[2]);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  return Math.max(1, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

function toRate(pct: number, fallback: number): number {
  return pct > 0 ? pct / 100 : fallback / 100;
}

export function ActivityRequirementsEngine({ pipelineDeficit, quarter, conversionRates, userId, isReadOnly, adjustedClosingsNeeded }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  const weeksRemaining = getWeeksRemaining(quarter);
  const deficit = Math.max(0, pipelineDeficit);

  // Rates (convert from % to decimal, with fallbacks)
  const apptToContractRate = toRate(conversionRates.apptToContract, 25);
  const contactToApptRate = toRate(conversionRates.contactToAppt, 20);
  const dialToApptRate = toRate(conversionRates.dialToAppt, 10);
  const cmaToListingRate = toRate(conversionRates.cmaToListing, 30);

  // Total requirements
  const apptsRequired = Math.ceil(deficit / apptToContractRate);
  const contactsRequired = Math.ceil(apptsRequired / contactToApptRate);
  const dialsRequired = Math.ceil(apptsRequired / dialToApptRate);
  const cmasRequired = Math.ceil(deficit / cmaToListingRate);

  // Weekly targets
  const weeklyPipeline = Math.ceil(deficit / weeksRemaining);
  const weeklyAppts = Math.ceil(apptsRequired / weeksRemaining);
  const weeklyContacts = Math.ceil(contactsRequired / weeksRemaining);
  const weeklyDials = Math.ceil(dialsRequired / weeksRemaining);
  const weeklyCMAs = Math.ceil(cmasRequired / weeksRemaining);

  const handleSendTo411 = async () => {
    const writeId = user?.id;
    if (!writeId) return;
    setSending(true);

    // Get current week start (Monday)
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    const weekStart = monday.toISOString().split('T')[0];

    // Upsert goals into current week's 4-1-1
    const { data: existing } = await supabase
      .from('weekly_411')
      .select('id')
      .eq('user_id', writeId)
      .eq('week_start_date', weekStart)
      .maybeSingle();

    const goalPayload = {
      calls_goal: weeklyDials,
      appointments_goal: weeklyAppts,
      contracts_goal: weeklyPipeline,
      listings_goal: weeklyCMAs,
    };

    const { error } = existing
      ? await supabase.from('weekly_411').update(goalPayload).eq('id', existing.id)
      : await supabase.from('weekly_411').insert({ user_id: writeId, week_start_date: weekStart, ...goalPayload });

    setSending(false);
    if (error) {
      toast({ title: 'Error', description: 'Failed to send targets to 4-1-1', variant: 'destructive' });
    } else {
      toast({ title: 'Sent!', description: 'Weekly targets sent to your 4-1-1 Goal Tracking.' });
    }
  };

  if (deficit === 0) return null;

  const metrics = [
    { icon: TrendingUp, label: 'Pipeline Deals Needed', total: deficit, weekly: weeklyPipeline, color: 'text-destructive' },
    { icon: CalendarCheck, label: 'Appointments Required', total: apptsRequired, weekly: weeklyAppts, color: 'text-primary' },
    { icon: Users, label: 'Contacts Required', total: contactsRequired, weekly: weeklyContacts, color: 'text-blue-500' },
    { icon: Phone, label: 'Dials Required', total: dialsRequired, weekly: weeklyDials, color: 'text-gold' },
    { icon: FileText, label: 'CMAs Required', total: cmasRequired, weekly: weeklyCMAs, color: 'text-emerald-500' },
  ];

  return (
    <Card className="border-gold/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-display">
          <Target className="h-5 w-5 text-gold" />
          Execution Plan to Close Pipeline Gap
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            {weeksRemaining} weeks left in Q{quarter}
          </Badge>
        </CardTitle>
        {adjustedClosingsNeeded !== undefined && adjustedClosingsNeeded > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            Based on Q{quarter} adjusted closings needed: <strong>{adjustedClosingsNeeded}</strong> (includes prior-quarter carryover)
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total + weekly targets */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {metrics.map(m => (
            <div key={m.label} className="rounded-lg border border-border bg-card/50 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <m.icon className={`h-4 w-4 ${m.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{m.label}</span>
              </div>
              <p className={`text-2xl font-bold ${m.color}`}>{formatNumber(m.total)}</p>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Weekly</span>
                <span className="text-sm font-bold text-foreground">{formatNumber(m.weekly)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Conversion rates used */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> Conversion Rates Used
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            <span>Appt → Contract: <strong>{Math.round(apptToContractRate * 100)}%</strong></span>
            <span>Contact → Appt: <strong>{Math.round(contactToApptRate * 100)}%</strong></span>
            <span>Dial → Appt: <strong>{Math.round(dialToApptRate * 100)}%</strong></span>
            <span>CMA → Listing: <strong>{Math.round(cmaToListingRate * 100)}%</strong></span>
            {conversionRates.contactToAppt === 0 && conversionRates.dialToAppt === 0 && (
              <Badge variant="outline" className="text-amber-600 border-amber-500/40">Using defaults</Badge>
            )}
          </div>
        </div>

        {/* Send to 4-1-1 button */}
        {!isReadOnly && (
          <Button
            onClick={handleSendTo411}
            disabled={sending}
            className="gap-2 bg-gold hover:bg-gold/90"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send Weekly Targets to 4-1-1'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
