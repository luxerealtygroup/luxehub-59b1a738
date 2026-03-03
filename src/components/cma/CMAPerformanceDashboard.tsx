import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Loader2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfYear, differenceInDays } from 'date-fns';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CMARow {
  id: string;
  user_id: string;
  listing_status: string;
  approval_status: string;
  created_at: string;
  listing_signed_at: string | null;
  listing_sold_at: string | null;
  lost_reason: string | null;
  pricing_band_recommended: number | null;
}

interface AgentMetrics {
  name: string;
  userId: string;
  cmasCreated: number;
  approved: number;
  converted: number;
  sold: number;
  lost: number;
  staleCount: number;
  approvedPct: string;
  convertedPct: string;
  avgDaysToConvert: string;
  avgDaysToSign: string;
  avgDaysToSell: string;
}

const STALE_DAYS = 60;

const PRICE_BANDS = [
  { label: 'All', min: 0, max: Infinity },
  { label: 'Under $300K', min: 0, max: 300000 },
  { label: '$300K–$500K', min: 300000, max: 500000 },
  { label: '$500K–$750K', min: 500000, max: 750000 },
  { label: '$750K–$1M', min: 750000, max: 1000000 },
  { label: '$1M+', min: 1000000, max: Infinity },
];

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--destructive))',
  'hsl(45 93% 47%)',
  'hsl(200 80% 50%)',
  'hsl(280 60% 55%)',
  'hsl(160 60% 45%)',
  'hsl(20 80% 55%)',
];

const CONVERTED_STATUSES = ['Listing Signed', 'Active', 'Sold'];
const APPROVED_STATUSES = ['approved', 'exported', 'pushed', 'converted'];

const CMAPerformanceDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [cmaRows, setCmaRows] = useState<CMARow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [dateFrom, setDateFrom] = useState<Date>(startOfYear(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [priceBandFilter, setPriceBandFilter] = useState<string>('All');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const fromStr = format(dateFrom, 'yyyy-MM-dd');
      const toStr = format(dateTo, 'yyyy-MM-dd');

      const [{ data: cmas }, { data: profs }] = await Promise.all([
        supabase
          .from('cma_reports')
          .select('id, user_id, listing_status, approval_status, created_at, listing_signed_at, listing_sold_at, lost_reason, pricing_band_recommended')
          .gte('created_at', `${fromStr}T00:00:00`)
          .lte('created_at', `${toStr}T23:59:59`),
        supabase.from('profiles').select('id, full_name'),
      ]);

      setCmaRows(cmas || []);
      const map = new Map<string, string>();
      (profs || []).forEach(p => { if (p.full_name) map.set(p.id, p.full_name); });
      setProfiles(map);
      setLoading(false);
    };
    fetchData();
  }, [dateFrom, dateTo]);

  // Filtered rows by agent + price band
  const filteredRows = useMemo(() => {
    let rows = cmaRows;
    if (agentFilter !== 'all') {
      rows = rows.filter(r => r.user_id === agentFilter);
    }
    const band = PRICE_BANDS.find(b => b.label === priceBandFilter) || PRICE_BANDS[0];
    if (band.label !== 'All') {
      rows = rows.filter(r => {
        const p = r.pricing_band_recommended;
        return p != null && p >= band.min && p < band.max;
      });
    }
    return rows;
  }, [cmaRows, agentFilter, priceBandFilter]);

  // Unique agents for filter dropdown
  const agentOptions = useMemo(() => {
    const ids = new Set(cmaRows.map(r => r.user_id));
    return Array.from(ids)
      .map(id => ({ id, name: profiles.get(id) || 'Unknown' }))
      .filter(a => a.name !== 'Unknown')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cmaRows, profiles]);

  const agentMetrics = useMemo((): AgentMetrics[] => {
    const byAgent = new Map<string, CMARow[]>();
    filteredRows.forEach(r => {
      const list = byAgent.get(r.user_id) || [];
      list.push(r);
      byAgent.set(r.user_id, list);
    });

    const now = new Date();

    return Array.from(byAgent.entries()).map(([userId, rows]) => {
      const approved = rows.filter(r => APPROVED_STATUSES.includes(r.approval_status));
      const converted = rows.filter(r => CONVERTED_STATUSES.includes(r.listing_status));
      const sold = rows.filter(r => r.listing_status === 'Sold');
      const lost = rows.filter(r => r.listing_status === 'Expired/Lost' || r.approval_status === 'lost');

      const staleCount = rows.filter(r =>
        r.listing_status === 'CMA Created' &&
        differenceInDays(now, new Date(r.created_at)) > STALE_DAYS
      ).length;

      const daysToConvert = converted
        .filter(r => r.listing_signed_at)
        .map(r => differenceInDays(new Date(r.listing_signed_at!), new Date(r.created_at)));
      const daysToSign = converted
        .filter(r => r.listing_signed_at)
        .map(r => differenceInDays(new Date(r.listing_signed_at!), new Date(r.created_at)));
      const daysToSell = sold
        .filter(r => r.listing_sold_at)
        .map(r => differenceInDays(new Date(r.listing_sold_at!), new Date(r.created_at)));

      const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(0) : '—';

      return {
        name: profiles.get(userId) || 'Unknown',
        userId,
        cmasCreated: rows.length,
        approved: approved.length,
        converted: converted.length,
        sold: sold.length,
        lost: lost.length,
        staleCount,
        approvedPct: rows.length ? ((approved.length / rows.length) * 100).toFixed(1) + '%' : '—',
        convertedPct: rows.length ? ((converted.length / rows.length) * 100).toFixed(1) + '%' : '—',
        avgDaysToConvert: avg(daysToConvert),
        avgDaysToSign: avg(daysToSign),
        avgDaysToSell: avg(daysToSell),
      };
    }).sort((a, b) => b.cmasCreated - a.cmasCreated);
  }, [filteredRows, profiles]);

  // Team totals
  const teamTotals = useMemo(() => {
    const now = new Date();
    const t = filteredRows.reduce(
      (acc, r) => {
        acc.cmas++;
        if (APPROVED_STATUSES.includes(r.approval_status)) acc.approved++;
        if (CONVERTED_STATUSES.includes(r.listing_status)) acc.converted++;
        if (r.listing_status === 'Sold') acc.sold++;
        if (r.listing_status === 'CMA Created' && differenceInDays(now, new Date(r.created_at)) > STALE_DAYS) acc.stale++;
        if (r.listing_status === 'Expired/Lost' || r.approval_status === 'lost') acc.lost++;
        return acc;
      },
      { cmas: 0, approved: 0, converted: 0, sold: 0, stale: 0, lost: 0 }
    );

    // Avg days to convert
    const convertedRows = filteredRows.filter(r => CONVERTED_STATUSES.includes(r.listing_status) && r.listing_signed_at);
    const daysArr = convertedRows.map(r => differenceInDays(new Date(r.listing_signed_at!), new Date(r.created_at)));
    const avgDays = daysArr.length ? (daysArr.reduce((a, b) => a + b, 0) / daysArr.length).toFixed(0) : '—';

    return { ...t, avgDaysToConvert: avgDays };
  }, [filteredRows]);

  // Lost reasons pie chart data
  const lostReasonData = useMemo(() => {
    const lostRows = filteredRows.filter(r => r.listing_status === 'Expired/Lost' || r.approval_status === 'lost');
    const counts = new Map<string, number>();
    lostRows.forEach(r => {
      const reason = r.lost_reason?.trim() || 'No Reason Given';
      counts.set(reason, (counts.get(reason) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredRows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-5 w-5 text-gold" />
        <h2 className="text-xl font-display font-bold text-foreground">CMA Performance Metrics</h2>
      </div>

      {/* Filters */}
      <Card className="border-gold/10">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date From */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateFrom, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {/* Date To */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(dateTo, 'MMM d, yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            {/* Agent Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Agent</Label>
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Agents" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  {agentOptions.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Price Band Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Price Band</Label>
              <Select value={priceBandFilter} onValueChange={setPriceBandFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_BANDS.map(b => (
                    <SelectItem key={b.label} value={b.label}>{b.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard label="Total CMAs" value={teamTotals.cmas} />
        <SummaryCard
          label="% Approved"
          value={teamTotals.cmas ? ((teamTotals.approved / teamTotals.cmas) * 100).toFixed(1) + '%' : '—'}
        />
        <SummaryCard
          label="% Converted"
          value={teamTotals.cmas ? ((teamTotals.converted / teamTotals.cmas) * 100).toFixed(1) + '%' : '—'}
        />
        <SummaryCard label="Avg Days to Convert" value={teamTotals.avgDaysToConvert} />
        <SummaryCard
          label="Stale CMAs"
          value={teamTotals.stale}
          variant={teamTotals.stale > 0 ? 'warning' : 'default'}
        />
        <SummaryCard
          label="Lost"
          value={teamTotals.lost}
          variant={teamTotals.lost > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Lost Reason Breakdown + Agent Table side by side on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lost Reason Pie Chart */}
        <Card className="border-gold/10 lg:col-span-1">
          <CardContent className="pt-5">
            <p className="text-sm font-semibold text-foreground mb-4">Lost Reason Breakdown</p>
            {lostReasonData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No lost CMAs in range
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={lostReasonData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                  >
                    {lostReasonData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Agent Table */}
        <Card className="border-gold/10 lg:col-span-2">
          <CardContent className="pt-4 overflow-x-auto">
            {agentMetrics.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                No CMA reports found for selected filters.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-center">CMAs</TableHead>
                    <TableHead className="text-center">Approved</TableHead>
                    <TableHead className="text-center">% Approved</TableHead>
                    <TableHead className="text-center">Converted</TableHead>
                    <TableHead className="text-center">% Converted</TableHead>
                    <TableHead className="text-center">Avg Days</TableHead>
                    <TableHead className="text-center">Sold</TableHead>
                    <TableHead className="text-center">Lost</TableHead>
                    <TableHead className="text-center">Stale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentMetrics.map(a => (
                    <TableRow key={a.userId}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-center">{a.cmasCreated}</TableCell>
                      <TableCell className="text-center">{a.approved}</TableCell>
                      <TableCell className="text-center font-semibold">{a.approvedPct}</TableCell>
                      <TableCell className="text-center">{a.converted}</TableCell>
                      <TableCell className="text-center font-semibold">{a.convertedPct}</TableCell>
                      <TableCell className="text-center">{a.avgDaysToConvert}</TableCell>
                      <TableCell className="text-center">{a.sold}</TableCell>
                      <TableCell className={cn("text-center", a.lost > 0 && "text-destructive font-semibold")}>{a.lost}</TableCell>
                      <TableCell className={cn("text-center", a.staleCount > 0 && "text-amber-500 font-semibold")}>{a.staleCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value, variant = 'default' }: { label: string; value: number | string; variant?: 'default' | 'warning' }) => (
  <Card className={cn("border-gold/20", variant === 'warning' && "border-amber-500/30")}>
    <CardContent className="pt-4 pb-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-2xl font-bold mt-1", variant === 'warning' ? "text-amber-500" : "text-foreground")}>{value}</p>
    </CardContent>
  </Card>
);

export default CMAPerformanceDashboard;
