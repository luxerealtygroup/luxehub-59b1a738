import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, CheckCircle2, Circle, Info } from 'lucide-react';
import { format } from 'date-fns';
import {
  APS_DISCLAIMER,
  PortalCondition,
  STATUS_LABEL,
  conditionLabel,
  countdownLabel,
  isOverdue,
  isSettled,
} from '@/lib/portalConditions';

interface TimelineTransaction {
  id: string;
  side: string;
  status: string;
  offer_date?: string | null;
  conditions_date?: string | null;
  firm_date?: string | null;
  deposit_due_date?: string | null;
  requisition_date?: string | null;
  closing_date?: string | null;
}

interface Props {
  transaction: TimelineTransaction;
  /** Property address or similar, used as the card subtitle. */
  title?: string;
}

const fmt = (d: string) => format(new Date(`${d}T00:00:00`), 'EEEE MMMM d');

/**
 * Client-facing conditions + key dates for one transaction.
 *
 * Conditions are entered by the agent in LUXEhub. The client sees the
 * condition, its due date and its status — never the agent's notes, which live
 * in a separate table the client's RLS policy cannot read when internal.
 */
export function ConditionsTimeline({ transaction, title }: Props) {
  const [conditions, setConditions] = useState<PortalCondition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('portal_transaction_conditions')
        .select('*')
        .eq('transaction_id', transaction.id)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (!cancelled) {
        setConditions((data ?? []) as PortalCondition[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [transaction.id]);

  const keyDates = (
    [
      ['Offer accepted', transaction.offer_date],
      ['Deposit due', transaction.deposit_due_date],
      ['Conditions end', transaction.conditions_date],
      ['Firm', transaction.firm_date],
      ['Requisition date', transaction.requisition_date],
      ['Completion / closing', transaction.closing_date],
    ] as const
  ).filter(([, d]) => !!d) as [string, string][];

  if (loading) return null;
  if (conditions.length === 0 && keyDates.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <CalendarClock className="h-5 w-5 text-primary" />
          Conditions & Key Dates
        </CardTitle>
        {title && <p className="text-sm text-muted-foreground">{title}</p>}
      </CardHeader>
      <CardContent className="space-y-5">
        {conditions.length > 0 && (
          <ul className="space-y-3">
            {conditions.map((c) => {
              const done = isSettled(c.status);
              const late = isOverdue(c);
              return (
                <li key={c.id} className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    {done ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className={`h-5 w-5 ${late ? 'text-destructive' : 'text-muted-foreground'}`} />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`font-medium ${done ? 'text-muted-foreground' : ''}`}>
                        {conditionLabel(c)}
                      </p>
                      {done ? (
                        <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[11px]">
                          {STATUS_LABEL[c.status]}
                          {c.resolved_date ? ` ${format(new Date(`${c.resolved_date}T00:00:00`), 'MMM d')}` : ''}
                        </Badge>
                      ) : c.status === 'not_met' ? (
                        <Badge variant="outline" className="text-[11px]">Not met</Badge>
                      ) : late ? (
                        <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-[11px]">
                          {countdownLabel(c.due_date)}
                        </Badge>
                      ) : null}
                    </div>
                    {!done && c.due_date && (
                      <p className="text-sm text-muted-foreground">
                        Due {fmt(c.due_date)}
                        {!late && countdownLabel(c.due_date) ? ` (${countdownLabel(c.due_date)})` : ''}
                      </p>
                    )}
                    {!c.due_date && !done && (
                      <p className="text-sm text-muted-foreground">Date to be confirmed</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {keyDates.length > 0 && (
          <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
            <p className="eyebrow mb-2">Key dates</p>
            <ul className="space-y-1.5">
              {keyDates.map(([label, date]) => (
                <li key={label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{fmt(date)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {APS_DISCLAIMER}
        </p>
      </CardContent>
    </Card>
  );
}
