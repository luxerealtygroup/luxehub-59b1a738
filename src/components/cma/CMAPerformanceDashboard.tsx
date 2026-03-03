import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfYear, differenceInDays } from 'date-fns';

interface CMARow {
  id: string;
  user_id: string;
  listing_status: string;
  created_at: string;
  listing_signed_at: string | null;
  listing_sold_at: string | null;
}

interface AgentMetrics {
  name: string;
  cmasCreated: number;
  listingsSigned: number;
  sold: number;
  cmaToListingPct: string;
  cmaToSoldPct: string;
  avgDaysToSign: string;
  avgDaysToSell: string;
}

const CMAPerformanceDashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [cmaRows, setCmaRows] = useState<CMARow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [dateFrom, setDateFrom] = useState<Date>(startOfYear(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const fromStr = format(dateFrom, 'yyyy-MM-dd');
      const toStr = format(dateTo, 'yyyy-MM-dd');

      const [{ data: cmas }, { data: profs }] = await Promise.all([
        supabase
          .from('cma_reports')
          .select('id, user_id, listing_status, created_at, listing_signed_at, listing_sold_at')
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

  const agentMetrics = useMemo((): AgentMetrics[] => {
    const byAgent = new Map<string, CMARow[]>();
    cmaRows.forEach(r => {
      const list = byAgent.get(r.user_id) || [];
      list.push(r);
      byAgent.set(r.user_id, list);
    });

    return Array.from(byAgent.entries()).map(([userId, rows]) => {
      const signed = rows.filter(r => ['Listing Signed', 'Active', 'Sold'].includes(r.listing_status));
      const sold = rows.filter(r => r.listing_status === 'Sold');

      const daysToSign = signed
        .filter(r => r.listing_signed_at)
        .map(r => differenceInDays(new Date(r.listing_signed_at!), new Date(r.created_at)));
      const daysToSell = sold
        .filter(r => r.listing_sold_at)
        .map(r => differenceInDays(new Date(r.listing_sold_at!), new Date(r.created_at)));

      const avgSign = daysToSign.length ? (daysToSign.reduce((a, b) => a + b, 0) / daysToSign.length).toFixed(0) : '—';
      const avgSell = daysToSell.length ? (daysToSell.reduce((a, b) => a + b, 0) / daysToSell.length).toFixed(0) : '—';

      return {
        name: profiles.get(userId) || 'Unknown',
        cmasCreated: rows.length,
        listingsSigned: signed.length,
        sold: sold.length,
        cmaToListingPct: rows.length ? ((signed.length / rows.length) * 100).toFixed(1) + '%' : '—',
        cmaToSoldPct: rows.length ? ((sold.length / rows.length) * 100).toFixed(1) + '%' : '—',
        avgDaysToSign: avgSign,
        avgDaysToSell: avgSell,
      };
    }).sort((a, b) => b.cmasCreated - a.cmasCreated);
  }, [cmaRows, profiles]);

  // Team totals
  const teamTotals = useMemo(() => {
    const total = agentMetrics.reduce(
      (acc, a) => ({
        cmas: acc.cmas + a.cmasCreated,
        signed: acc.signed + a.listingsSigned,
        sold: acc.sold + a.sold,
      }),
      { cmas: 0, signed: 0, sold: 0 }
    );
    return total;
  }, [agentMetrics]);

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
        <h2 className="text-xl font-display font-bold text-foreground">CMA Performance Dashboard</h2>
      </div>

      {/* Date Filters */}
      <Card className="border-gold/10">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
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
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total CMAs" value={teamTotals.cmas} />
        <SummaryCard label="Listings Signed" value={teamTotals.signed} />
        <SummaryCard label="Sold" value={teamTotals.sold} />
        <SummaryCard
          label="CMA → Sold %"
          value={teamTotals.cmas ? ((teamTotals.sold / teamTotals.cmas) * 100).toFixed(1) + '%' : '—'}
        />
      </div>

      {/* Agent Table */}
      {agentMetrics.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            No CMA reports found in the selected date range.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-gold/10">
          <CardContent className="pt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-center">CMAs</TableHead>
                  <TableHead className="text-center">Signed</TableHead>
                  <TableHead className="text-center">Sold</TableHead>
                  <TableHead className="text-center">CMA→Listing %</TableHead>
                  <TableHead className="text-center">CMA→Sold %</TableHead>
                  <TableHead className="text-center">Avg Days to Sign</TableHead>
                  <TableHead className="text-center">Avg Days to Sell</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentMetrics.map(a => (
                  <TableRow key={a.name}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-center">{a.cmasCreated}</TableCell>
                    <TableCell className="text-center">{a.listingsSigned}</TableCell>
                    <TableCell className="text-center">{a.sold}</TableCell>
                    <TableCell className="text-center font-semibold">{a.cmaToListingPct}</TableCell>
                    <TableCell className="text-center font-semibold">{a.cmaToSoldPct}</TableCell>
                    <TableCell className="text-center">{a.avgDaysToSign}</TableCell>
                    <TableCell className="text-center">{a.avgDaysToSell}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: number | string }) => (
  <Card className="border-gold/20">
    <CardContent className="pt-4 pb-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </CardContent>
  </Card>
);

export default CMAPerformanceDashboard;
