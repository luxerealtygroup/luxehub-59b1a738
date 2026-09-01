import { format, isAfter, parseISO, startOfDay } from 'date-fns';
import { CalendarClock } from 'lucide-react';
import { PortalProperty, PortalTransaction, propertyLabel } from '@/hooks/usePortalProperties';

interface Props {
  transactions: PortalTransaction[];
  properties: PortalProperty[];
  /** Fallback closing date from the legacy client_transactions record. */
  fallbackClosing?: string | null;
}

const DATE_FIELDS: Array<{ key: keyof PortalTransaction; label: string }> = [
  { key: 'offer_date', label: 'Offer' },
  { key: 'conditions_date', label: 'Conditions due' },
  { key: 'deposit_due_date', label: 'Deposit due' },
  { key: 'firm_date', label: 'Firm' },
  { key: 'requisition_date', label: 'Requisition' },
  { key: 'closing_date', label: 'Closing' },
];

export function KeyDatesCard({ transactions, properties, fallbackClosing }: Props) {
  const today = startOfDay(new Date());

  const rows = transactions
    .flatMap((t) => {
      const prop = properties.find((p) => p.id === t.property_id);
      return DATE_FIELDS.filter((f) => !!t[f.key]).map((f) => ({
        id: `${t.id}-${String(f.key)}`,
        label: f.label,
        date: String(t[f.key]),
        property: prop ? propertyLabel(prop) : null,
      }));
    })
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
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
