import { formatCurrency, formatNumber } from '@/lib/utils';
import { GoalResults, GoalInputType, perMonth, perWeek } from '@/lib/planning2027';

const money = (v: number | null) => (v == null ? '—' : formatCurrency(v));
const num = (v: number | null) => (v == null ? '—' : formatNumber(v));

function Headline({ label, value, tag, primary }: { label: string; value: string; tag: string; primary?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 min-w-0 ${primary ? 'border-gold/60 bg-gold/5' : 'border-border bg-card'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{tag}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1 break-words">{value}</p>
    </div>
  );
}

function Small({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 min-w-0">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground break-words">{value}</p>
    </div>
  );
}

function Cadence({ label, yearly }: { label: string; yearly: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 min-w-0">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['Yearly', yearly], ['Monthly', perMonth(yearly)], ['Weekly', perWeek(yearly)]].map(([k, v]) => (
          <div key={k as string}>
            <p className="text-xl font-bold text-foreground">{num(v as number | null)}</p>
            <p className="text-[11px] text-muted-foreground">{k as string}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GoalResultsView({ r, inputType }: { r: GoalResults; inputType: GoalInputType }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Headline label="Net Income" value={money(r.net_income_goal)} tag={inputType === 'net' ? 'Your goal' : 'Calculated'} primary={inputType === 'net'} />
        <Headline label="Total GCI" value={money(r.gci_goal)} tag={inputType === 'gci' ? 'Your goal' : 'Calculated'} primary={inputType === 'gci'} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Small label="GCI per deal" value={money(r.gci_per_deal)} />
        <Small label="Net per deal" value={money(r.net_per_deal)} />
        <Small label="Volume needed" value={money(r.volume_needed)} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Cadence label="Deals" yearly={r.deals_needed} />
        <Cadence label="Appointments" yearly={r.appointments_needed} />
        <Cadence label="Leads" yearly={r.leads_needed} />
      </div>
      <p className="text-xs text-muted-foreground">Monthly = yearly ÷ 12. Weekly = yearly ÷ 48 working weeks. Rounded up.</p>
    </div>
  );
}
