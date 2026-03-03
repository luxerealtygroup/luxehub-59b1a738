import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, startOfYear } from 'date-fns';

interface AgentProfile {
  id: string;
  full_name: string | null;
}

interface WeeklyRow {
  user_id: string;
  contacts_made: number | null;
  dials: number | null;
  doors_knocked: number | null;
  appointments_set: number | null;
  appointments_held: number | null;
  pipeline_additions: number | null;
  contracts_signed: number | null;
  firm_deals: number | null;
  database_size: number | null;
  week_start_date: string;
}

interface AgentTotals {
  contacts_made: number;
  dials: number;
  doors_knocked: number;
  appointments_set: number;
  appointments_held: number;
  pipeline_additions: number;
  contracts_signed: number;
  firm_deals: number;
  database_size: number;
}

const pct = (numerator: number, denominator: number): string => {
  if (denominator === 0) return '—';
  return ((numerator / denominator) * 100).toFixed(1) + '%';
};

const ConversionReport = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [weeklyRows, setWeeklyRows] = useState<WeeklyRow[]>([]);
  const [dateFrom, setDateFrom] = useState<Date>(startOfYear(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());

  // Non-admin agents can only see their own data
  const effectiveAgent = isAdmin ? selectedAgent : (user?.id || '');

  useEffect(() => {
    if (!isAdmin) return; // Agents don't need the agent list
    const fetchAgents = async () => {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .not('full_name', 'is', null);

      const { data: usersWith411 } = await supabase
        .from('weekly_411')
        .select('user_id');

      const activeIds = new Set((usersWith411 || []).map(w => w.user_id));

      const { data: fubProfiles } = await supabase
        .from('profiles')
        .select('id, fub_user_id')
        .not('fub_user_id', 'is', null);

      const fubMap = new Map((fubProfiles || []).map(p => [p.id, p.fub_user_id]));

      setAgents(
        (profiles || [])
          .filter(p => {
            const hasFub = fubMap.has(p.id) && fubMap.get(p.id) !== 8;
            return (hasFub || activeIds.has(p.id)) && p.full_name;
          })
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
      );
    };
    fetchAgents();
  }, [isAdmin]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      setLoading(true);
      const fromStr = format(dateFrom, 'yyyy-MM-dd');
      const toStr = format(dateTo, 'yyyy-MM-dd');

      let query = supabase
        .from('weekly_411')
        .select('user_id, contacts_made, dials, doors_knocked, appointments_set, appointments_held, pipeline_additions, contracts_signed, firm_deals, database_size, week_start_date')
        .gte('week_start_date', fromStr)
        .lte('week_start_date', toStr);

      // Filter: admin can pick agent or "all"; non-admin always filtered to self
      if (effectiveAgent !== 'all') {
        query = query.eq('user_id', effectiveAgent);
      }

      const { data } = await query;
      setWeeklyRows(data || []);
      setLoading(false);
    };
    fetchData();
  }, [dateFrom, dateTo, effectiveAgent, user]);

  const agentTotals = useMemo(() => {
    const map = new Map<string, AgentTotals>();

    weeklyRows.forEach(row => {
      const existing = map.get(row.user_id) || {
        contacts_made: 0, dials: 0, doors_knocked: 0, appointments_set: 0,
        appointments_held: 0, pipeline_additions: 0, contracts_signed: 0,
        firm_deals: 0, database_size: 0,
      };

      existing.contacts_made += row.contacts_made || 0;
      existing.dials += row.dials || 0;
      existing.doors_knocked += row.doors_knocked || 0;
      existing.appointments_set += row.appointments_set || 0;
      existing.appointments_held += row.appointments_held || 0;
      existing.pipeline_additions += row.pipeline_additions || 0;
      existing.contracts_signed += row.contracts_signed || 0;
      existing.firm_deals += row.firm_deals || 0;
      existing.database_size = Math.max(existing.database_size, row.database_size || 0);

      map.set(row.user_id, existing);
    });

    return map;
  }, [weeklyRows]);

  const getAgentName = (id: string) => {
    if (!isAdmin && id === user?.id) return user?.user_metadata?.full_name || 'You';
    return agents.find(a => a.id === id)?.full_name || 'Unknown';
  };

  const displayAgents = effectiveAgent === 'all'
    ? Array.from(agentTotals.keys())
    : agentTotals.has(effectiveAgent) ? [effectiveAgent] : [];

  const teamTotals = useMemo((): AgentTotals => {
    const totals: AgentTotals = {
      contacts_made: 0, dials: 0, doors_knocked: 0, appointments_set: 0,
      appointments_held: 0, pipeline_additions: 0, contracts_signed: 0,
      firm_deals: 0, database_size: 0,
    };
    agentTotals.forEach(t => {
      totals.contacts_made += t.contacts_made;
      totals.dials += t.dials;
      totals.doors_knocked += t.doors_knocked;
      totals.appointments_set += t.appointments_set;
      totals.appointments_held += t.appointments_held;
      totals.pipeline_additions += t.pipeline_additions;
      totals.contracts_signed += t.contracts_signed;
      totals.firm_deals += t.firm_deals;
      totals.database_size += t.database_size;
    });
    return totals;
  }, [agentTotals]);

  const conversionMetrics = [
    { label: 'Contact → Appt Set', num: 'appointments_set', den: 'contacts_made' },
    { label: 'Contact → Pipeline', num: 'pipeline_additions', den: 'contacts_made' },
    { label: 'Dials → Appt Set', num: 'appointments_set', den: 'dials' },
    { label: 'Dials → Pipeline', num: 'pipeline_additions', den: 'dials' },
    { label: 'Appt Held → Contract', num: 'contracts_signed', den: 'appointments_held' },
    { label: 'Appt Held → Firm Deal', num: 'firm_deals', den: 'appointments_held' },
    { label: 'Database → Firm Deal', num: 'firm_deals', den: 'database_size' },
    { label: 'Database → Contract', num: 'contracts_signed', den: 'database_size' },
  ] as const;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-primary/10">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Agent filter only shown to admins */}
            {isAdmin && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Agent</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Team Members</SelectItem>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
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
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
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

      {/* Team Summary (only for admin viewing all) */}
      {isAdmin && selectedAgent === 'all' && displayAgents.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Team Totals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              {conversionMetrics.map(m => {
                const numVal = teamTotals[m.num as keyof AgentTotals];
                const denVal = teamTotals[m.den as keyof AgentTotals];
                return (
                  <div key={m.label} className="text-center p-2 rounded-lg bg-background/50">
                    <p className="text-lg font-bold text-foreground">{pct(numVal, denVal)}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{numVal}/{denVal}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Agent Table */}
      {displayAgents.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-muted-foreground">
            No activity data found for the selected date range.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg font-display">
              {isAdmin ? 'Conversion Rates by Agent' : 'Your Conversion Rates'}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Agent</TableHead>
                  {conversionMetrics.map(m => (
                    <TableHead key={m.label} className="text-center min-w-[120px]">
                      <span className="text-xs">{m.label}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayAgents.map(agentId => {
                  const totals = agentTotals.get(agentId)!;
                  return (
                    <TableRow key={agentId}>
                      <TableCell className="font-medium">{getAgentName(agentId)}</TableCell>
                      {conversionMetrics.map(m => {
                        const numVal = totals[m.num as keyof AgentTotals];
                        const denVal = totals[m.den as keyof AgentTotals];
                        const percentage = pct(numVal, denVal);
                        return (
                          <TableCell key={m.label} className="text-center">
                            <span className="font-semibold">{percentage}</span>
                            <br />
                            <span className="text-xs text-muted-foreground">{numVal}/{denVal}</span>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {/* Team total row - only for admin with multiple agents */}
                {isAdmin && displayAgents.length > 1 && (
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>Team Total</TableCell>
                    {conversionMetrics.map(m => {
                      const numVal = teamTotals[m.num as keyof AgentTotals];
                      const denVal = teamTotals[m.den as keyof AgentTotals];
                      return (
                        <TableCell key={m.label} className="text-center">
                          <span className="font-bold">{pct(numVal, denVal)}</span>
                          <br />
                          <span className="text-xs text-muted-foreground">{numVal}/{denVal}</span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ConversionReport;
