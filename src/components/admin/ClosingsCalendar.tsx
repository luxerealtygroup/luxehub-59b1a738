import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from 'lucide-react';
import { useFubClosingsCalendar, ClosingEntry } from '@/hooks/useFubClosingsCalendar';
import { useDealMetadata } from '@/hooks/useDealMetadata';
import { formatCurrency } from '@/lib/utils';
import { formatWeightedDeals, sumWeightedDeals } from '@/lib/utils/dealWeight';

interface Props {
  year: number;
  /** Optional FUB user id → display name map for resolving unassigned/numeric users. */
  agentNameByFubId?: Map<number, string>;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function shortGci(n: number): string {
  if (!n) return '$0';
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

function firstName(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || 'Agent';
}

export function ClosingsCalendar({ year, agentNameByFubId }: Props) {
  const { metadata } = useDealMetadata();
  // Adapter: useDealMetadata returns DealMetadataRow; dealWeight expects a smaller shape.
  const dealMetadataMap = useMemo(() => {
    const m = new Map();
    metadata.forEach((row, key) => {
      m.set(key, { deal_category: row.deal_category, weight_override: row.weight_override });
    });
    return m;
  }, [metadata]);

  const { deals, loading } = useFubClosingsCalendar({ year, dealMetadataMap, agentNameByFubId });

  const today = new Date();
  const defaultMonth = today.getFullYear() === year ? today.getMonth() : 0;
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);

  const dealsByDay = useMemo(() => {
    const m = new Map<string, ClosingEntry[]>();
    for (const d of deals) {
      const arr = m.get(d.date) || [];
      arr.push(d);
      m.set(d.date, arr);
    }
    return m;
  }, [deals]);

  const monthDeals = useMemo(
    () => deals.filter(d => {
      const mo = Number(d.date.slice(5, 7)) - 1;
      return mo === selectedMonth;
    }),
    [deals, selectedMonth],
  );

  const totals = useMemo(() => {
    // Totals reflect ACTUAL closings only (status === 'closed'), not forecast deals.
    const closedOnly = monthDeals.filter(d => d.status === 'closed');
    const sales = closedOnly.filter(d => d.category === 'sale').length;
    const leases = closedOnly.filter(d => d.category === 'lease').length;
    const gci = closedOnly.reduce((s, d) => s + d.gci, 0);
    const weighted = sumWeightedDeals(closedOnly as any[], dealMetadataMap as any);
    const forecastCount = monthDeals.length - closedOnly.length;
    return { sales, leases, gci, weighted, count: closedOnly.length, forecastCount };
  }, [monthDeals, dealMetadataMap]);

  // Build cells: leading blanks + day cells
  const firstOfMonth = new Date(year, selectedMonth, 1);
  const leadBlanks = firstOfMonth.getDay();
  const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
  const cells: Array<{ day: number | null; ymd: string | null }> = [];
  for (let i = 0; i < leadBlanks; i++) cells.push({ day: null, ymd: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, ymd: toYmd(year, selectedMonth, d) });
  while (cells.length % 7 !== 0) cells.push({ day: null, ymd: null });

  const todayYmd = toYmd(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonth = () => setSelectedMonth(m => (m === 0 ? 0 : m - 1));
  const nextMonth = () => setSelectedMonth(m => (m === 11 ? 11 : m + 1));

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="flex items-center gap-2 font-display">
          <CalendarDays className="h-5 w-5 text-primary" />
          {year} Closings Calendar
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} disabled={selectedMonth === 0}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium">{MONTH_NAMES[selectedMonth]} {year}</span>
          <Button variant="outline" size="icon" onClick={nextMonth} disabled={selectedMonth === 11}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading deals…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-px bg-border rounded-md overflow-hidden border border-border">
              {DOW.map(d => (
                <div key={d} className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground text-center">
                  {d}
                </div>
              ))}
              {cells.map((c, idx) => {
                if (c.day === null || !c.ymd) {
                  return <div key={idx} className="bg-background/50 min-h-[96px]" />;
                }
                const dayDeals = dealsByDay.get(c.ymd) || [];
                const visible = dayDeals.slice(0, 3);
                const overflow = dayDeals.length - visible.length;
                const isToday = c.ymd === todayYmd;
                return (
                  <div
                    key={idx}
                    className={`bg-card min-h-[96px] p-1.5 flex flex-col gap-1 ${isToday ? 'ring-1 ring-primary' : ''}`}
                  >
                    <div className="text-xs font-medium text-muted-foreground">{c.day}</div>
                    {visible.map(d => (
                      <Popover key={d.id}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={`text-left text-[10px] leading-tight px-1.5 py-1 rounded truncate transition-colors block w-full ${
                              d.status === 'forecast'
                                ? 'border border-dashed border-primary/40 bg-transparent text-muted-foreground hover:bg-primary/5'
                                : d.category === 'lease'
                                  ? 'bg-success/20 text-success border border-success/30 hover:bg-success/30'
                                  : 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
                            }`}
                            title={`${d.agentName} · ${d.address} · ${shortGci(d.gci)}${d.status === 'forecast' ? ' (forecast)' : ''}`}
                          >
                            <span className="block truncate font-medium">{firstName(d.agentName)}</span>
                            <span className="block truncate text-[9px] opacity-75">
                              {d.address} · {shortGci(d.gci)}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm space-y-1">
                          <div className="font-semibold">{d.address}</div>
                          <div className="text-muted-foreground text-xs">
                            {d.pipelineName} · {d.stageName}
                            {d.status === 'forecast' && <span className="ml-1 text-primary">· Forecast</span>}
                          </div>
                          <div className="flex justify-between"><span>Agent</span><span>{d.agentName}</span></div>
                          <div className="flex justify-between"><span>Type</span><span className="capitalize">{d.category}</span></div>
                          <div className="flex justify-between"><span>Price</span><span>{formatCurrency(d.price)}</span></div>
                          <div className="flex justify-between"><span>GCI</span><span>{formatCurrency(d.gci)}</span></div>
                          <div className="flex justify-between">
                            <span>{d.status === 'closed' ? 'Closed' : 'Projected close'}</span>
                            <span>{d.date}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Source</span><span>{d.dateSource}</span>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ))}
                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-[10px] text-muted-foreground hover:text-foreground text-left">
                            +{overflow} more
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm space-y-2 max-h-80 overflow-auto">
                          <div className="font-semibold">{c.ymd} — {dayDeals.length} closings</div>
                          {dayDeals.map(d => (
                            <div key={d.id} className="border-t border-border pt-1.5">
                              <div className="font-medium">{d.agentName} {d.status === 'forecast' && <span className="text-primary text-[10px]">(forecast)</span>}</div>
                              <div className="text-xs text-muted-foreground">{d.address}</div>
                              <div className="text-xs">{formatCurrency(d.gci)} · {d.category}</div>
                            </div>
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Closings (actual)</div>
                <div className="text-lg font-semibold">
                  {totals.count}
                  {totals.forecastCount > 0 && (
                    <span className="text-xs font-normal text-muted-foreground ml-1">
                      +{totals.forecastCount} forecast
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Weighted Units</div>
                <div className="text-lg font-semibold">{formatWeightedDeals(totals.weighted)}</div>
              </div>
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-xs text-muted-foreground">Sales / Leases</div>
                <div className="text-lg font-semibold">{totals.sales} / {totals.leases}</div>
              </div>
              <div className="bg-muted/40 rounded-md p-3">
                <div className="text-xs text-muted-foreground">GCI</div>
                <div className="text-lg font-semibold">{formatCurrency(totals.gci)}</div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ClosingsCalendar;