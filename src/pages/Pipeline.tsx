import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { FUBDealSections } from '@/components/FUBDealSections';
import { useAuth } from '@/hooks/useAuth';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Phone, Mail, Search, Trash2, Edit2, Loader2, DollarSign, Home, Users, Calendar, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { differenceInDays, format, parseISO } from 'date-fns';
import { SOURCE_OPTIONS } from '@/lib/constants/sourceOptions';
import { formatCurrency, formatNumber } from '@/lib/utils';

// Safely format a date string; returns '—' on invalid input so one bad row
// (e.g. a typo'd year) can't crash the whole Pipeline page.
const safeFormatDate = (value?: string | null, fmt = 'MMM d, yyyy'): string => {
  if (!value) return '—';
  try {
    const d = parseISO(value);
    if (isNaN(d.getTime())) return '—';
    return format(d, fmt);
  } catch {
    return '—';
  }
};
import { usePipelineMetrics } from '@/hooks/usePipelineMetrics';
import { ActivityRequirementsEngine } from '@/components/ActivityRequirementsEngine';
import { PaceTracker } from '@/components/PaceTracker';
import { aggregate411Rows } from '@/lib/utils/weekly411Fallback';
import { currentYear, safe, pct } from '@/components/business-planning/types';

interface PipelineClient {
  id: string;
  client_name: string;
  client_type: 'buyer' | 'seller' | 'tenant' | 'landlord';
  stage: number;
  source?: string;
  phone?: string;
  email?: string;
  notes?: string;
  projected_sale_amount: number;
  projected_gci: number;
  commission_percent: number;
  split_percent: number;
  expected_pending_date?: string;
  created_at: string;
  last_contact?: string;
  fub_person_id?: number;
  property_address?: string;
}

interface NewClient {
  client_name: string;
  client_type: 'buyer' | 'seller' | 'tenant' | 'landlord';
  stage: number;
  source: string;
  phone: string;
  email: string;
  notes: string;
  projected_sale_amount: number;
  commission_percent: number;
  split_percent: number;
  expected_pending_date: string;
  fub_person_id?: number;
  property_address: string;
}

const stageLabels: { [key: number]: string } = {
  1: 'Lead',
  2: 'Active on MLS',
  3: 'Exclusive Listing',
  4: 'BRA Signed',
  5: 'Appointment Held',
  6: 'Appointment Set',
  7: 'Showing',
  8: 'Offer',
  9: 'Pending',
};

const Pipeline = () => {
  const { user } = useAuth();
  const { isViewingAsAgent, effectiveUserId } = useViewAsAgent();
  const isReadOnly = isViewingAsAgent;
  const queryUserId = effectiveUserId;
  const { toast } = useToast();
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [filteredClients, setFilteredClients] = useState<PipelineClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<PipelineClient | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'buyer' | 'seller' | 'tenant' | 'landlord'>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [newClient, setNewClient] = useState<NewClient>({
    client_name: '',
    client_type: 'buyer',
    stage: 1,
    source: '',
    phone: '',
    email: '',
    notes: '',
    projected_sale_amount: 0,
    commission_percent: 0,
    split_percent: 0,
    expected_pending_date: '',
    property_address: '',
  });

  // ── Activity Requirements Engine data ──
  const currentMonth = new Date().getMonth();
  const currentQuarter = Math.floor(currentMonth / 3) + 1;

  // Pipeline metrics for deficit calc
  const getQDateRange = (q: number) => {
    const starts: Record<number, string> = { 1: `${currentYear}-01-01`, 2: `${currentYear}-04-01`, 3: `${currentYear}-07-01`, 4: `${currentYear}-10-01` };
    const ends: Record<number, string> = { 1: `${currentYear}-03-31`, 2: `${currentYear}-06-30`, 3: `${currentYear}-09-30`, 4: `${currentYear}-12-31` };
    return { start: starts[q] || starts[1], end: ends[q] || ends[1] };
  };
  const currQRange = getQDateRange(currentQuarter);
  const pipelineMetrics = usePipelineMetrics({ userId: queryUserId, dateStart: currQRange.start, dateEnd: currQRange.end });

  // Conversion rates + deficit data
  const [conversionRates, setConversionRates] = useState({ contactToAppt: 0, dialToAppt: 0, apptToPipeline: 0, apptToContract: 0, cmaToListing: 0 });
  const [adjustedClosingsNeeded, setAdjustedClosingsNeeded] = useState(0);
  const [pipelineDeficit, setPipelineDeficit] = useState(0);

  useEffect(() => {
    if (!queryUserId) return;
    // Fetch conversion rates from 411 data + goals for deficit
    Promise.all([
      supabase.from('weekly_411').select('dials, contacts_made, appointments_held, contracts_signed, calls_actual, appointments_actual, contracts_actual, pipeline_additions')
        .eq('user_id', queryUserId).gte('week_start_date', `${currentYear}-01-01`),
      supabase.from('planning_assumptions').select('gci_target, avg_commission, contact_to_appt_rate, appt_to_contract_rate, dials_to_appt_rate, cma_to_listing_rate')
        .eq('user_id', queryUserId).eq('year', currentYear).eq('quarter', currentQuarter).maybeSingle(),
      supabase.from('agent_goals').select('target_value')
        .eq('user_id', queryUserId).eq('period', 'yearly').eq('goal_type', 'deals_closed').maybeSingle(),
      supabase.from('production_goals').select('annual_gci_goal')
        .eq('user_id', queryUserId).eq('year', currentYear).maybeSingle(),
      supabase.from('cma_reports').select('listing_status')
        .eq('user_id', queryUserId),
    ]).then(([w411Res, paRes, agRes, pgRes, cmaRes]) => {
      const rows = w411Res.data || [];
      const agg = aggregate411Rows(rows);
      const totalDials = agg.dials;
      const totalContacts = agg.contacts_made;
      const totalAppts = agg.appointments_held;
      const totalContracts = agg.contracts_signed;
      const totalPipelineAdds = rows.reduce((s, r) => s + (r.pipeline_additions || 0), 0);

      // CMA conversion rate
      const cmas = cmaRes.data || [];
      const totalCMAs = cmas.length;
      const convertedCMAs = cmas.filter(c => ['Listing Signed', 'Active', 'Sold'].includes(c.listing_status)).length;
      const realCmaToListing = pct(convertedCMAs, totalCMAs);

      // Compute real rates
      const realContactToAppt = pct(totalAppts, totalContacts);
      const realDialToAppt = pct(totalAppts, totalDials);
      const realApptToPipeline = pct(totalPipelineAdds, totalAppts);
      const realApptToContract = pct(totalContracts, totalAppts);

      // Use real rates if available, else planning assumptions, else defaults
      const pa = paRes.data;
      setConversionRates({
        contactToAppt: realContactToAppt || safe(pa?.contact_to_appt_rate) || 20,
        dialToAppt: realDialToAppt || safe(pa?.dials_to_appt_rate) || 10,
        apptToPipeline: realApptToPipeline || 30,
        apptToContract: realApptToContract || safe(pa?.appt_to_contract_rate) || 25,
        cmaToListing: realCmaToListing || safe(pa?.cma_to_listing_rate) || 30,
      });

      // Pipeline deficit + adjusted closings
      const qTargetGCI = safe(pa?.gci_target) || (safe(pgRes.data?.annual_gci_goal) / 4);
      const avgComm = safe(pa?.avg_commission) || 15000;
      const hasTarget = qTargetGCI > 0 && avgComm > 0;
      const closingsGoal = hasTarget ? Math.ceil(qTargetGCI / avgComm) : 0;

      // Carryover: derive prev-Q gap from annual goal / 4
      const annualDealsGoal = safe(agRes.data?.target_value);
      const prevQGoal = annualDealsGoal > 0 ? Math.ceil(annualDealsGoal / 4) : closingsGoal;
      const adjusted = closingsGoal + Math.max(0, prevQGoal - closingsGoal); // simplified carryover

      setAdjustedClosingsNeeded(adjusted);

      const requiredPipeline = hasTarget ? Math.ceil(closingsGoal / 0.30) : 0;
      const currentPipeline = pipelineMetrics.clientsInDateRange;
      setPipelineDeficit(Math.max(0, requiredPipeline - currentPipeline));
    });
  }, [queryUserId, pipelineMetrics.clientsInDateRange]);

  useEffect(() => {
    if (queryUserId) fetchClients();
  }, [queryUserId]);

  useEffect(() => {
    filterClients();
  }, [clients, searchTerm, filterType, filterStage]);

  const fetchClients = async () => {
    if (!queryUserId) return;
    const { data, error } = await supabase
      .from('pipeline_clients')
      .select('*')
      .eq('user_id', queryUserId)
      .order('created_at', { ascending: false });

    if (error) {
      toast({ title: 'Error', description: 'Failed to fetch pipeline clients', variant: 'destructive' });
      return;
    }

    // Map DB rows to PipelineClient (add defaults for client-side fields)
    const mapped: PipelineClient[] = (data || []).map((row: any) => ({
      ...row,
      commission_percent: row.commission_percent ?? 0,
      split_percent: row.split_percent ?? 0,
    }));
    setClients(mapped);
    setLoading(false);
  };

  const filterClients = () => {
    let filtered = [...clients];
    if (searchTerm) {
      filtered = filtered.filter(
        (c) =>
          c.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.phone?.includes(searchTerm)
      );
    }
    if (filterType !== 'all') filtered = filtered.filter((c) => c.client_type === filterType);
    if (filterStage !== 'all') filtered = filtered.filter((c) => c.stage === parseInt(filterStage));
    setFilteredClients(filtered);
  };

  const calculateGCI = (saleAmount: number, commissionPercent: number, splitPercent: number) => {
    return (saleAmount * (commissionPercent / 100) * (splitPercent / 100));
  };

  const handleAddClient = async () => {
    if (!user || !newClient.client_name) {
      toast({ title: 'Error', description: 'Please fill in required fields', variant: 'destructive' });
      return;
    }

    const gci = calculateGCI(newClient.projected_sale_amount, newClient.commission_percent, newClient.split_percent);

    const { error } = await supabase.from('pipeline_clients').insert({
      user_id: user.id,
      client_name: newClient.client_name,
      client_type: newClient.client_type,
      stage: newClient.stage,
      source: newClient.source,
      phone: newClient.phone,
      email: newClient.email,
      notes: newClient.notes,
      projected_sale_amount: newClient.projected_sale_amount,
      projected_gci: gci,
      expected_pending_date: newClient.expected_pending_date || null,
      property_address: newClient.client_type === 'seller' ? (newClient.property_address || null) : null,
    });

    if (error) {
      toast({ title: 'Error', description: 'Failed to add client', variant: 'destructive' });
      return;
    }

    toast({ title: 'Success', description: 'Client added to pipeline' });
    setAddDialogOpen(false);
    setNewClient({ client_name: '', client_type: 'buyer', stage: 1, source: '', phone: '', email: '', notes: '', projected_sale_amount: 0, commission_percent: 0, split_percent: 0, expected_pending_date: '', property_address: '' });
    fetchClients();
  };

  const handleUpdateClient = async () => {
    if (!editingClient) return;

    const { error } = await supabase
      .from('pipeline_clients')
      .update({
        client_name: editingClient.client_name,
        client_type: editingClient.client_type,
        stage: editingClient.stage,
        source: editingClient.source,
        phone: editingClient.phone,
        email: editingClient.email,
        notes: editingClient.notes,
        projected_sale_amount: editingClient.projected_sale_amount,
        projected_gci: editingClient.projected_gci,
        expected_pending_date: editingClient.expected_pending_date || null,
        property_address: editingClient.client_type === 'seller' ? (editingClient.property_address || null) : null,
      })
      .eq('id', editingClient.id);

    if (error) {
      console.error('Pipeline update error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update client', variant: 'destructive' });
      return;
    }

    toast({ title: 'Success', description: 'Client updated' });
    setEditingClient(null);
    fetchClients();
  };

  const handleDeleteClient = async (id: string) => {
    const { error } = await supabase.from('pipeline_clients').delete().eq('id', id);
    if (error) { toast({ title: 'Error', description: 'Failed to delete client', variant: 'destructive' }); return; }
    toast({ title: 'Success', description: 'Client removed from pipeline' });
    fetchClients();
  };

  const handleFUBSelect = (client: { id: number; name: string; email?: string; phone?: string }) => {
    setNewClient({
      ...newClient,
      client_name: client.name || '',
      email: client.email || '',
      phone: client.phone || '',
      fub_person_id: client.id,
    });
  };

  const totalProjectedGCI = filteredClients.reduce((sum, c) => sum + c.projected_gci, 0);
  const totalProjectedVolume = filteredClients.reduce((sum, c) => sum + c.projected_sale_amount, 0);
  const buyers = filteredClients.filter((c) => c.client_type === 'buyer');
  const sellers = filteredClients.filter((c) => c.client_type === 'seller');
  const buyerGCI = buyers.reduce((sum, c) => sum + c.projected_gci, 0);
  const sellerGCI = sellers.reduce((sum, c) => sum + c.projected_gci, 0);

  const qMonth = new Date().getMonth();
  const qIndex = Math.floor(qMonth / 3);
  const quarters = [
    { name: 'Q1', months: [0, 1, 2], label: 'Jan-Mar' },
    { name: 'Q2', months: [3, 4, 5], label: 'Apr-Jun' },
    { name: 'Q3', months: [6, 7, 8], label: 'Jul-Sep' },
    { name: 'Q4', months: [9, 10, 11], label: 'Oct-Dec' },
  ];

  const quarterlyProjections = quarters.map((quarter, index) => {
    const quarterClients = filteredClients.filter((client) => {
      if (!client.expected_pending_date) return false;
      const pendingMonth = new Date(client.expected_pending_date).getMonth();
      return quarter.months.includes(pendingMonth);
    });
    return { ...quarter, projectedGci: quarterClients.reduce((sum, c) => sum + c.projected_gci, 0), dealCount: quarterClients.length, isPast: index < qIndex, isCurrent: index === qIndex };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground font-display">Pipeline</h1>
          <p className="text-muted-foreground">Manage your active clients and pipeline</p>
        </div>
        {!isReadOnly && (
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold hover:bg-gold/90"><Plus className="h-4 w-4 mr-2" />Add Client</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Add Pipeline Client</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Search Follow Up Boss</Label>
                <FUBClientSearch onSelectClient={handleFUBSelect} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Client Name *</Label>
                  <Input value={newClient.client_name} onChange={(e) => setNewClient({ ...newClient, client_name: e.target.value })} placeholder="John Doe" />
                </div>
                <div>
                  <Label>Client Type *</Label>
                  <Select value={newClient.client_type} onValueChange={(value: 'buyer' | 'seller' | 'tenant' | 'landlord') => setNewClient({ ...newClient, client_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="tenant">Tenant</SelectItem>
                      <SelectItem value="landlord">Landlord</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} placeholder="(555) 123-4567" /></div>
                <div><Label>Email</Label><Input value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} placeholder="john@example.com" /></div>
              </div>

              {newClient.client_type === 'seller' && (
                <div>
                  <Label>Property Address</Label>
                  <Input value={newClient.property_address} onChange={(e) => setNewClient({ ...newClient, property_address: e.target.value })} placeholder="123 Main St, City" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stage *</Label>
                  <Select value={newClient.stage.toString()} onValueChange={(value) => setNewClient({ ...newClient, stage: parseInt(value) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(stageLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source</Label>
                  <Select value={newClient.source} onValueChange={(value) => setNewClient({ ...newClient, source: value })}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((source) => (
                        <SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div><Label>Projected Sale Amount</Label><Input type="number" value={newClient.projected_sale_amount || ''} onChange={(e) => setNewClient({ ...newClient, projected_sale_amount: parseFloat(e.target.value) || 0 })} placeholder="500000" /></div>
                <div><Label>Commission %</Label><Input type="number" step="0.1" value={newClient.commission_percent || ''} onChange={(e) => setNewClient({ ...newClient, commission_percent: parseFloat(e.target.value) || 0 })} placeholder="3" /></div>
                <div><Label>Split %</Label><Input type="number" step="1" value={newClient.split_percent || ''} onChange={(e) => setNewClient({ ...newClient, split_percent: parseFloat(e.target.value) || 0 })} placeholder="70" /></div>
              </div>

              <div><Label>Expected Pending Date</Label><Input type="date" value={newClient.expected_pending_date} onChange={(e) => setNewClient({ ...newClient, expected_pending_date: e.target.value })} /></div>

              <div><Label>Notes</Label><Textarea value={newClient.notes} onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })} placeholder="Additional notes..." rows={3} /></div>

              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Projected GCI:</span>
                  <span className="text-xl font-bold text-green-400">{formatCurrency(calculateGCI(newClient.projected_sale_amount, newClient.commission_percent, newClient.split_percent))}</span>
                </div>
              </div>

              <Button onClick={handleAddClient} className="w-full bg-gold hover:bg-gold/90">Add to Pipeline</Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div><p className="text-xs text-muted-foreground">Total Clients</p><p className="text-xl font-bold text-foreground">{filteredClients.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Home className="h-5 w-5 text-blue-400" /></div>
              <div><p className="text-xs text-muted-foreground">Total Volume</p><p className="text-xl font-bold text-gold">{formatCurrency(totalProjectedVolume)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gold/10"><DollarSign className="h-5 w-5 text-gold" /></div>
              <div><p className="text-xs text-muted-foreground">Total Projected GCI</p><p className="text-xl font-bold text-gold">{formatCurrency(totalProjectedGCI)}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Users className="h-5 w-5 text-blue-400" /></div>
              <div><p className="text-xs text-muted-foreground">Buyers ({buyers.length})</p><p className="text-lg font-bold text-blue-400">{formatCurrency(buyerGCI)} GCI</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quarterly Projections */}
      <Card className="border-gold/20">
        <CardHeader>
          <CardTitle className="text-gold font-display flex items-center gap-2"><Target className="h-5 w-5" />Quarterly Projections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {quarterlyProjections.map((quarter) => (
              <div key={quarter.name} className={`p-4 rounded-lg border ${quarter.isCurrent ? 'bg-gold/10 border-gold/30' : quarter.isPast ? 'bg-muted/50 border-border' : 'bg-card border-border'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-foreground">{quarter.name}</h3>
                  {quarter.isCurrent && <Badge className="bg-gold">Current</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mb-3">{quarter.label}</p>
                <div className="space-y-2">
                 <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Clients</span><span className="font-medium text-foreground">{quarter.dealCount}</span></div>
                  <div className="flex justify-between items-center"><span className="text-sm text-muted-foreground">Projected GCI</span><span className="text-green-500 font-medium">{formatCurrency(quarter.projectedGci)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Pipeline Breakdown */}
      {(() => {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const monthlyData = monthNames.map((name, idx) => {
          const monthClients = filteredClients.filter(c => {
            if (!c.expected_pending_date) return false;
            return new Date(c.expected_pending_date).getMonth() === idx;
          });
          return { name, idx, clients: monthClients, gci: monthClients.reduce((s, c) => s + c.projected_gci, 0) };
        });
        const unassigned = filteredClients.filter(c => !c.expected_pending_date);
        const currentMonthIdx = new Date().getMonth();

        return (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-foreground font-display flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />Monthly Pipeline Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
                {monthlyData.map((m) => (
                  <div
                    key={m.name}
                    className={`p-3 rounded-lg border transition-colors ${m.idx === currentMonthIdx ? 'bg-gold/10 border-gold/30' : m.idx < currentMonthIdx ? 'bg-muted/30 border-border/50' : 'bg-card border-border'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">{m.name.slice(0, 3)}</span>
                      {m.idx === currentMonthIdx && <Badge className="bg-gold text-xs py-0 px-1.5">Now</Badge>}
                    </div>
                    <div className="text-lg font-bold text-foreground">{m.clients.length}</div>
                    <div className="text-xs text-muted-foreground">{formatCurrency(m.gci)}</div>
                  </div>
                ))}
              </div>

              {/* Expanded client list per month */}
              <div className="space-y-4 mt-4">
                {monthlyData.filter(m => m.clients.length > 0).map((m) => (
                  <div key={m.name}>
                    <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      {m.name}
                      <Badge variant="outline" className="text-xs">{m.clients.length} client{m.clients.length !== 1 ? 's' : ''}</Badge>
                      <span className="text-xs text-muted-foreground ml-auto">{formatCurrency(m.gci)} GCI</span>
                    </h4>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 text-left">
                            <th className="px-3 py-2 font-medium text-muted-foreground">Client</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Type</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Stage</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-right">Volume</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-right">GCI</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Expected Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.clients.map((c) => (
                            <tr key={c.id} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium text-foreground">
                                <div>{c.client_name}</div>
                                {c.client_type === 'seller' && c.property_address && (
                                  <div className="text-xs text-muted-foreground font-normal">{c.property_address}</div>
                                )}
                              </td>
                              <td className="px-3 py-2"><Badge variant={c.client_type === 'buyer' ? 'default' : 'secondary'} className="text-xs">{c.client_type}</Badge></td>
                              <td className="px-3 py-2 text-muted-foreground">{stageLabels[c.stage]}</td>
                              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(c.projected_sale_amount)}</td>
                              <td className="px-3 py-2 text-right text-green-500 font-medium">{formatCurrency(c.projected_gci)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{safeFormatDate(c.expected_pending_date)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                {unassigned.length > 0 && (
                  <div>
                    <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                      No Date Assigned
                      <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">{unassigned.length} client{unassigned.length !== 1 ? 's' : ''}</Badge>
                    </h4>
                    <div className="rounded-lg border border-amber-500/20 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-amber-500/5 text-left">
                            <th className="px-3 py-2 font-medium text-muted-foreground">Client</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Type</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground">Stage</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-right">Volume</th>
                            <th className="px-3 py-2 font-medium text-muted-foreground text-right">GCI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unassigned.map((c) => (
                            <tr key={c.id} className="border-t border-border/50 hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium text-foreground">
                                <div>{c.client_name}</div>
                                {c.client_type === 'seller' && c.property_address && (
                                  <div className="text-xs text-muted-foreground font-normal">{c.property_address}</div>
                                )}
                              </td>
                              <td className="px-3 py-2"><Badge variant={c.client_type === 'buyer' ? 'default' : 'secondary'} className="text-xs">{c.client_type}</Badge></td>
                              <td className="px-3 py-2 text-muted-foreground">{stageLabels[c.stage]}</td>
                              <td className="px-3 py-2 text-right text-foreground">{formatCurrency(c.projected_sale_amount)}</td>
                              <td className="px-3 py-2 text-right text-green-500 font-medium">{formatCurrency(c.projected_gci)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Pace Tracker + Coach Mode */}
      <PaceTracker
        userId={queryUserId}
        pipelineDeficit={pipelineDeficit}
        currentPipelineCount={pipelineMetrics.totalClients}
        conversionRates={conversionRates}
        isReadOnly={isReadOnly}
      />

      {/* Activity Requirements Engine */}
      <ActivityRequirementsEngine
        pipelineDeficit={pipelineDeficit}
        quarter={currentQuarter}
        conversionRates={conversionRates}
        userId={queryUserId}
        isReadOnly={isReadOnly}
        adjustedClosingsNeeded={adjustedClosingsNeeded}
      />

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search clients..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
              <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Filter by type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="buyer">Buyers</SelectItem>
                <SelectItem value="seller">Sellers</SelectItem>
                <SelectItem value="tenant">Tenants</SelectItem>
                <SelectItem value="landlord">Landlords</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Filter by stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {Object.entries(stageLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Client List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filteredClients.map((client) => (
          <Card key={client.id} className="border-border/50 hover:border-gold/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{client.client_name}</h3>
                    <Badge variant={client.client_type === 'buyer' ? 'default' : 'secondary'}>{client.client_type}</Badge>
                    <Badge variant="outline">{stageLabels[client.stage]}</Badge>
                  </div>
                  {client.client_type === 'seller' && client.property_address && (
                    <p className="text-xs text-muted-foreground">{client.property_address}</p>
                  )}
                  {client.source && <p className="text-xs text-muted-foreground">Source: {client.source}</p>}
                </div>
                <div className="flex gap-2">
                  {!isReadOnly && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditingClient(client)}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteClient(client.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                {client.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /><span>{client.phone}</span></div>}
                {client.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="h-3 w-3" /><span className="truncate">{client.email}</span></div>}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground mb-3">
                <span>Stage: {stageLabels[client.stage] || `Stage ${client.stage}`}</span>
                <span>Source: {client.source || 'N/A'}</span>
                <span>Value: {formatCurrency(client.projected_sale_amount)}</span>
                <span>GCI: {formatCurrency(client.projected_gci)}</span>
              </div>
              {client.expected_pending_date && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /><span>Expected: {safeFormatDate(client.expected_pending_date)}</span>
                </div>
              )}
              {client.notes && <p className="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded">{client.notes}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No clients found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || filterType !== 'all' || filterStage !== 'all' ? 'Try adjusting your filters' : 'Add your first client to get started'}
            </p>
            {!searchTerm && filterType === 'all' && filterStage === 'all' && (
              <Button onClick={() => setAddDialogOpen(true)} className="bg-gold hover:bg-gold/90"><Plus className="h-4 w-4 mr-2" />Add Client</Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingClient} onOpenChange={() => setEditingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          {editingClient && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Client Name *</Label><Input value={editingClient.client_name} onChange={(e) => setEditingClient({ ...editingClient, client_name: e.target.value })} /></div>
                <div>
                  <Label>Client Type *</Label>
                  <Select value={editingClient.client_type} onValueChange={(value: 'buyer' | 'seller' | 'tenant' | 'landlord') => setEditingClient({ ...editingClient, client_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="buyer">Buyer</SelectItem><SelectItem value="seller">Seller</SelectItem><SelectItem value="tenant">Tenant</SelectItem><SelectItem value="landlord">Landlord</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input value={editingClient.phone || ''} onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })} /></div>
                <div><Label>Email</Label><Input value={editingClient.email || ''} onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })} /></div>
              </div>
              {editingClient.client_type === 'seller' && (
                <div>
                  <Label>Property Address</Label>
                  <Input value={editingClient.property_address || ''} onChange={(e) => setEditingClient({ ...editingClient, property_address: e.target.value })} placeholder="123 Main St, City" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Stage *</Label>
                  <Select value={editingClient.stage.toString()} onValueChange={(value) => setEditingClient({ ...editingClient, stage: parseInt(value) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(stageLabels).map(([value, label]) => (<SelectItem key={value} value={value}>{label}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Source</Label>
                  <Select value={editingClient.source || ''} onValueChange={(value) => setEditingClient({ ...editingClient, source: value })}>
                    <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((source) => (<SelectItem key={source.value} value={source.value}>{source.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>Projected Sale Amount</Label><Input type="number" value={editingClient.projected_sale_amount || ''} onChange={(e) => setEditingClient({ ...editingClient, projected_sale_amount: parseFloat(e.target.value) || 0 })} /></div>
                <div><Label>Commission %</Label><Input type="number" step="0.1" value={editingClient.commission_percent || ''} onChange={(e) => setEditingClient({ ...editingClient, commission_percent: parseFloat(e.target.value) || 0 })} /></div>
                <div><Label>Split %</Label><Input type="number" step="1" value={editingClient.split_percent || ''} onChange={(e) => setEditingClient({ ...editingClient, split_percent: parseFloat(e.target.value) || 0 })} /></div>
              </div>
              <div><Label>Expected Pending Date</Label><Input type="date" value={editingClient.expected_pending_date || ''} onChange={(e) => setEditingClient({ ...editingClient, expected_pending_date: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={editingClient.notes || ''} onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })} rows={3} /></div>
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Projected GCI:</span>
                  <span className="text-xl font-bold text-green-400">{formatCurrency(calculateGCI(editingClient.projected_sale_amount, editingClient.commission_percent, editingClient.split_percent))}</span>
                </div>
              </div>
              <Button onClick={handleUpdateClient} className="w-full bg-gold hover:bg-gold/90">Update Client</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pipeline;

