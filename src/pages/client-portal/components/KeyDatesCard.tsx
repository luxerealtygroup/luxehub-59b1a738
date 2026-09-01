import { useEffect, useState } from 'react';
import { format, isAfter, parseISO, startOfDay } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PortalProperty, PortalTransaction, propertyLabel } from '@/hooks/usePortalProperties';
import { PortalCondition, conditionLabel, isSettled } from '@/lib/portalConditions';
import { PortalKeyDate, formatEventTime, keyDateLabel } from '@/lib/portalKeyDates';

interface Props {
  portalId?: string | null;
  transactions: PortalTransaction[];
  properties: PortalProperty[];
  /** Fallback closing date from the legacy client_transactions record. */
  fallbackClosing?: string | null;
}

interface Row {
  id: string;
  label: string;
  date: string;
  time?: string | null;
  property: string | null;
}

/**
 * Important dates for the client: every outstanding condition due date, the
 * closing (plus the other milestone dates on the transaction), and any extra
 * dates the agent added by hand — inspections, open houses, anything else.
 */
export function KeyDatesCard({ portalId, transactions, properties, fallbackClosing }: Props) {
  const today = startOfDay(new Date());
  const [conditions, setConditions] = useState<PortalCondition[]>([]);
  const [extras, setExtras] = useState<PortalKeyDate[]>([]);

  const txIds = transactions.map((t) => t.id).sort().join(',');
  const propIds = properties.map((p) => p.id).sort().join(',');

  useEffect(() => {
    const ids = txIds ? txIds.split(',') : [];
    if (!ids.length) {
      setConditions([]);
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await supabase
        .from('portal_transaction_conditions')
        .select('*')
        .in('transaction_id', ids);
      if (active) setConditions((data ?? []) as PortalCondition[]);
    })();
    return () => {
      active = false;
    };
  }, [txIds]);

  useEffect(() => {
    if (!portalId) {
      setExtras([]);
      return;
    }
    const ids = propIds ? propIds.split(',') : [];
    let active = true;
    void (async () => {
      let query = supabase.from('portal_key_dates').select('*').eq('portal_id', portalId);
      if (ids.length) query = query.or(`property_id.is.null,property_id.in.(${ids.join(',')})`);
      const { data } = await query;
      if (active) setExtras((data ?? []) as PortalKeyDate[]);
    })();
    return () => {
      active = false;
    };
  }, [portalId, propIds]);

  const propName = (propertyId: string | null | undefined) => {
    const p = properties.find((x) => x.id === propertyId);
    return p ? propertyLabel(p) : null;
  };

  const conditionRows: Row[] = conditions
    .filter((c) => c.due_date && !isSettled(c.status))
    .map((c) => {
      const tx = transactions.find((t) => t.id === c.transaction_id);
      return {
        id: `cond-${c.id}`,
        label: `${conditionLabel(c)} due`,
        date: String(c.due_date),
        property: propName(tx?.property_id),
      };
    });

  const milestoneFields: Array<{ key: keyof PortalTransaction; label: string }> = [
    { key: 'offer_date', label: 'Offer' },
    { key: 'deposit_due_date', label: 'Deposit due' },
    { key: 'firm_date', label: 'Firm' },
    { key: 'requisition_date', label: 'Requisition' },
    { key: 'closing_date', label: 'Closing' },
  ];

  const milestoneRows: Row[] = transactions.flatMap((t) => {
    const fields = [...milestoneFields];
    // Only fall back to the transaction-level conditions date when no
    // individual conditions have been logged for this transaction.
    const hasConditions = conditions.some((c) => c.transaction_id === t.id && c.due_date && !isSettled(c.status));
    if (!hasConditions) fields.unshift({ key: 'conditions_date', label: 'Conditions due' });
    return fields
      .filter((f) => !!t[f.key])
      .map((f) => ({
        id: `${t.id}-${String(f.key)}`,
        label: f.label,
        date: String(t[f.key]),
        property: propName(t.property_id),
      }));
  });

  const extraRows: Row[] = extras.map((d) => ({
    id: `extra-${d.id}`,
    label: keyDateLabel(d),
    date: d.event_date,
    time: d.event_time,
    property: propName(d.property_id),
  }));

  const rows = [...conditionRows, ...milestoneRows, ...extraRows]
    .concat(
      transactions.length === 0 && fallbackClosing
        ? [{ id: 'fallback-closing', label: 'Closing', date: fallbackClosing, property: null }]
        : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="luxe-card p-6">
      <p className="eyebrow">Important dates</p>
      {rows.length === 0 ? (
        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
          <CalendarClock className="h-5 w-5" />
          No dates set yet — they appear here as your deal moves forward.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((r) => {
            const upcoming = isAfter(parseISO(r.date), today);
            const time = formatEventTime(r.time ?? null);
            return (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.label}</p>
                  {r.property && <p className="text-xs text-muted-foreground truncate">{r.property}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    upcoming ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {format(parseISO(r.date), 'MMM d, yyyy')}
                  {time ? ` · ${time}` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
