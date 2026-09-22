import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, CalendarDays, Loader2, AlertTriangle } from 'lucide-react';
import { useFubClosingsCalendar, ClosingEntry } from '@/hooks/useFubClosingsCalendar';
import { ImportantDateEntry, ImportantDateType, useImportantDatesCalendar } from '@/hooks/useImportantDatesCalendar';
import { useDealMetadata } from '@/hooks/useDealMetadata';
import { formatCurrency } from '@/lib/utils';
import { formatWeightedDeals, sumWeightedDeals } from '@/lib/utils/dealWeight';

interface Props {
  year: number;
  /** Optional FUB user id → display name map for resolving unassigned/numeric users. */
  agentNameByFubId?: Map<number, string>;
  /** When set, restrict the calendar to deals assigned to this FUB user id (agent view). */
  agentFubUserId?: number | null;
  /** Profile id used to scope portal and transaction dates on an agent dashboard. */
  agentProfileId?: string | null;
  /** Enables company-wide agent filtering. */
  companyView?: boolean;
  /** Optional title override (e.g. "My 2026 Closings"). */
  title?: string;
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

const TYPE_LABELS: Record<ImportantDateType | 'all', string> = {
  all: 'All dates', closing: 'Closing', condition: 'Condition', deposit: 'Deposit',
  inspection: 'Inspection / appraisal', walkthrough: 'Walkthrough', other: 'Other',
};

const TYPE_CLASSES: Record<ImportantDateType, string> = {
  closing: 'bg-primary/20 text-primary border-primary/30',
  condition: 'bg-destructive/15 text-destructive border-destructive/30',
  deposit: 'bg-gold/20 text-gold border-gold/30',
  inspection: 'bg-success/20 text-success border-success/30',
  walkthrough: 'bg-accent text-accent-foreground border-border',
  other: 'bg-muted text-muted-foreground border-border',
};

type CalendarItem =
  | { kind: 'closing'; date: string; key: string; closing: ClosingEntry }
  | { kind: 'date'; date: string; key: string; importantDate: ImportantDateEntry };

export function ClosingsCalendar({ year, agentNameByFubId, agentFubUserId, agentProfileId, companyView = false, title }: Props) {
  const navigate = useNavigate();
  const { metadata } = useDealMetadata();
  // Adapter: useDealMetadata returns DealMetadataRow; dealWeight expects a smaller shape.
  const dealMetadataMap = useMemo(() => {
    const m = new Map();
    metadata.forEach((row, key) => {
      m.set(key, { deal_category: row.deal_category, weight_override: row.weight_override });
    });
    return m;
  }, [metadata]);

  const { deals: allDeals, loading } = useFubClosingsCalendar({ year, dealMetadataMap, agentNameByFubId });
  const deals = useMemo(() => {
    if (!companyView) {
      return agentFubUserId == null ? [] : allDeals.filter((d) => d.agentFubUserId === agentFubUserId);
    }
    if (agentFilter === 'all') return allDeals;
    const selectedAgent = agents.find((agent) => agent.id === agentFilter);
    const selectedDate = allImportantDates.find((entry) => entry.agentProfileId === selectedAgent?.id);
    return selectedDate?.agentFubUserId == null
      ? []
      : allDeals.filter((d) => d.agentFubUserId === selectedDate.agentFubUserId);
  }, [agentFubUserId, agentFilter, agents, allDeals, allImportantDates, companyView]);
  const { dates: allImportantDates, agents, loading: datesLoading } = useImportantDatesCalendar(year);
  const [typeFilter, setTypeFilter] = useState<ImportantDateType | 'all'>('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const importantDates = useMemo(() => allImportantDates.filter((entry) => {
    if (!companyView && agentProfileId && entry.agentProfileId !== agentProfileId) return false;
    if (companyView && agentFilter !== 'all' && entry.agentProfileId !== agentFilter) return false;
    return typeFilter === 'all' || entry.type === typeFilter;
  }), [allImportantDates, agentFilter, agentProfileId, companyView, typeFilter]);

  const today = new Date();
  const defaultMonth = today.getFullYear() === year ? today.getMonth() : 0;
  const [selectedMonth, setSelectedMonth] = useState<number>(defaultMonth);

  const itemsByDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const d of deals) {
      const arr = m.get(d.date) || [];
      const duplicatedByPortal = importantDates.some((entry) =>
        entry.type === 'closing' && entry.date === d.date &&
        entry.agentFubUserId === d.agentFubUserId &&
        entry.address !== 'Address not set' && d.address.toLowerCase().includes(entry.address.split(',')[0].toLowerCase()),
      );
      if (!duplicatedByPortal && (typeFilter === 'all' || typeFilter === 'closing')) {
        arr.push({ kind: 'closing', date: d.date, key: `fub-${d.entryKey}`, closing: d });
      }
      m.set(d.date, arr);
    }
    importantDates.forEach((entry) => {
      const arr = m.get(entry.date) || [];
      arr.push({ kind: 'date', date: entry.date, key: entry.id, importantDate: entry });
      m.set(entry.date, arr);
    });
    return m;
  }, [deals, importantDates, typeFilter]);

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
      <CardHeader className="flex flex-col items-start justify-between gap-4 space-y-0 sm:flex-row sm:items-center">
        <CardTitle className="flex items-center gap-2 font-display">
          <CalendarDays className="h-5 w-5 text-primary" />
          {title ?? `${year} Important Dates`}
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
        {loading || datesLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading important dates…
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as ImportantDateType | 'all')}>
                <SelectTrigger aria-label="Filter dates by type" className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              {companyView && (
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger aria-label="Filter dates by agent" className="h-9 w-[190px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agents</SelectItem>
                    {agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {(Object.keys(TYPE_CLASSES) as ImportantDateType[]).map((type) => (
                  <span key={type} className="inline-flex items-center gap-1">
                    <span className={`h-2.5 w-2.5 rounded-sm border ${TYPE_CLASSES[type]}`} />{TYPE_LABELS[type]}
                  </span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
            <div className="grid min-w-[700px] grid-cols-7 gap-px bg-border">
              {DOW.map(d => (
                <div key={d} className="bg-muted px-2 py-1 text-xs font-medium text-muted-foreground text-center">
                  {d}
                </div>
              ))}
              {cells.map((c, idx) => {
                if (c.day === null || !c.ymd) {
                  return <div key={idx} className="bg-background/50 min-h-[96px]" />;
                }
                 const dayItems = itemsByDay.get(c.ymd) || [];
                 const visible = dayItems.slice(0, 3);
                 const overflow = dayItems.length - visible.length;
                const isToday = c.ymd === todayYmd;
                return (
                  <div
                    key={idx}
                    className={`bg-card min-h-[96px] p-1.5 flex flex-col gap-1 ${isToday ? 'ring-1 ring-primary' : ''}`}
                  >
                    <div className="text-xs font-medium text-muted-foreground">{c.day}</div>
                     {visible.map(item => {
                       const d = item.kind === 'closing' ? item.closing : null;
                       const importantDate = item.kind === 'date' ? item.importantDate : null;
                       const past = item.date < todayYmd;
                       const daysAway = Math.ceil((new Date(`${item.date}T12:00:00`).getTime() - new Date(`${todayYmd}T12:00:00`).getTime()) / 86400000);
                       const urgent = !!importantDate && (importantDate.type === 'condition' || importantDate.type === 'deposit') && daysAway >= 0 && daysAway <= 3;
                       return (
                       <Popover key={item.key}>
                        <PopoverTrigger asChild>
                           <Button
                             type="button" variant="ghost"
                             className={`h-auto justify-start text-left text-[10px] leading-tight px-1.5 py-1 rounded block w-full border ${past ? 'opacity-50 grayscale' : ''} ${urgent ? 'ring-1 ring-destructive' : ''} ${
                               importantDate ? TYPE_CLASSES[importantDate.type] : d?.status === 'forecast'
                                ? 'border border-dashed border-primary/40 bg-transparent text-muted-foreground hover:bg-primary/5'
                                 : d?.category === 'lease'
                                  ? 'bg-success/20 text-success border border-success/30 hover:bg-success/30'
                                  : 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
                            }`}
                             title={importantDate ? `${importantDate.clientName} · ${importantDate.address} · ${importantDate.label}` : `${d?.agentName} · ${d?.address}`}
                          >
                             <span className="block truncate font-medium">{importantDate ? importantDate.clientName : firstName(d?.agentName || '')}</span>
                            <span className="block truncate text-[9px] opacity-75">
                               {importantDate ? importantDate.label : `${d?.address} · ${shortGci(d?.gci || 0)}`}
                            </span>
                           </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm space-y-1">
                           {importantDate ? <>
                             <div className="font-semibold flex items-center gap-2">{urgent && <AlertTriangle className="h-4 w-4 text-destructive" />}{importantDate.label}</div>
                             <div>{importantDate.clientName}</div>
                             <div className="text-muted-foreground text-xs">{importantDate.address}</div>
                             <div className="flex justify-between"><span>Agent</span><span>{importantDate.agentName}</span></div>
                             <div className="flex justify-between"><span>Date</span><span>{importantDate.date}</span></div>
                             {importantDate.portalId && <Button className="mt-2 w-full" size="sm" onClick={() => navigate(`/client-portal/preview/${importantDate.portalId}`)}>Open client portal</Button>}
                           </> : d ? <>
                           <div className="font-semibold">{d.address}</div>
                          <div className="text-muted-foreground text-xs">
                            {d.pipelineName} · {d.stageName}
                            {d.status === 'forecast' && <span className="ml-1 text-primary">· Forecast</span>}
                          </div>
                          <div className="flex justify-between">
                            <span>Agent</span>
                            <span>
                              {d.agentName}
                              {d.sharePercent < 100 && (
                                <span className="ml-1 text-xs text-muted-foreground">({d.sharePercent}% split)</span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between"><span>Type</span><span className="capitalize">{d.category}</span></div>
                          <div className="flex justify-between"><span>Status</span><span>{d.stageName}</span></div>
                          <div className="flex justify-between"><span>Price</span><span>{formatCurrency(d.price)}</span></div>
                          <div className="flex justify-between"><span>GCI</span><span>{formatCurrency(d.gci)}</span></div>
                          <div className="flex justify-between">
                            <span>{d.status === 'closed' ? 'Closed' : 'Projected close'}</span>
                            <span>{d.date}</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Source</span><span>{d.dateSource}</span>
                          </div>
                           </> : null}
                        </PopoverContent>
                      </Popover>
                     )})}
                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                           <Button variant="ghost" size="sm" className="h-auto px-1 py-0 text-[10px] text-muted-foreground hover:text-foreground">
                            +{overflow} more
                           </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 text-sm space-y-2 max-h-80 overflow-auto">
                           <div className="font-semibold">{c.ymd} — {dayItems.length} dates</div>
                           {dayItems.map(item => (
                             <div key={item.key} className="border-t border-border pt-1.5">
                               <div className="font-medium">{item.kind === 'date' ? item.importantDate.clientName : item.closing.agentName}</div>
                               <div className="text-xs text-muted-foreground">{item.kind === 'date' ? item.importantDate.address : item.closing.address}</div>
                               <div className="text-xs">{item.kind === 'date' ? item.importantDate.label : `${formatCurrency(item.closing.gci)} · ${item.closing.category} · ${item.closing.stageName}`}</div>
                            </div>
                          ))}
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })}
            </div></div>

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