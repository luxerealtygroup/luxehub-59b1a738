import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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

interface PipelineClient {
  id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  stage: number;
  notes: string | null;
  property_interest: string | null;
  source: string | null;
  created_at: string;
  client_type: 'buyer' | 'seller';
  projected_sale_amount: number | null;
  projected_gci: number | null;
  expected_pending_date: string | null;
  status: string | null;
}

// Status options based on client type
const buyerStatusOptions = [
  { value: 'appointment_set', label: 'Appointment Set', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'appointment_held', label: 'Appointment Held', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'under_contract', label: 'Under Contract', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
];

const sellerStatusOptions = [
  { value: 'appointment_set', label: 'Appointment Set', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'appointment_held', label: 'Appointment Held', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  { value: 'active_listing', label: 'Active/Exclusive Listing', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
];

const getStatusLabel = (status: string | null, clientType: 'buyer' | 'seller'): { label: string; color: string } | null => {
  if (!status) return null;
  const options = clientType === 'buyer' ? buyerStatusOptions : sellerStatusOptions;
  return options.find(o => o.value === status) || null;
};

// Calculate stage based on days until expected pending date
const calculateStageFromDate = (expectedPendingDate: string | null): number => {
  if (!expectedPendingDate) return 5;
  const daysUntil = differenceInDays(parseISO(expectedPendingDate), new Date());
  
  if (daysUntil <= 30) return 10;
  if (daysUntil <= 60) return 9;
  if (daysUntil <= 90) return 8;
  if (daysUntil <= 120) return 7;
  if (daysUntil <= 180) return 6;
  if (daysUntil <= 270) return 5;
  if (daysUntil <= 365) return 4;
  if (daysUntil <= 540) return 3;
  if (daysUntil <= 730) return 2;
  return 1;
};

// Convert month/year to first day of that month as date string
const monthYearToDateString = (month: string, year: string): string => {
  if (!month || !year) return '';
  return `${year}-${month.padStart(2, '0')}-01`;
};

// Parse date string to get month and year
const getMonthYearFromDate = (dateStr: string | null): { month: string; year: string } => {
  if (!dateStr) return { month: '', year: '' };
  const date = parseISO(dateStr);
  return {
    month: (date.getMonth() + 1).toString(),
    year: date.getFullYear().toString()
  };
};

const months = [
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

const years = ['2026', '2027', '2028', '2029', '2030'];

// Stage definitions with timeline descriptions
const stageDefinitions: Record<number, { label: string; description: string; color: string }> = {
  10: { label: '10', description: 'Next 30 days', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  9: { label: '9', description: 'Next 60 days', color: 'bg-green-500/20 text-green-400 border-green-500/30' },
  8: { label: '8', description: 'Next 90 days', color: 'bg-lime-500/20 text-lime-400 border-lime-500/30' },
  7: { label: '7', description: 'Next 120 days', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  6: { label: '6', description: 'Next 6 months', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  5: { label: '5', description: 'Next 9 months', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  4: { label: '4', description: 'Next 12 months', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  3: { label: '3', description: '12-18 months', color: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  2: { label: '2', description: '18-24 months', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' },
  1: { label: '1', description: '24+ months', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
};

const stageOrder = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const Pipeline = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<PipelineClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editClient, setEditClient] = useState<PipelineClient | null>(null);
  const [syncToFUB, setSyncToFUB] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'buyer' | 'seller'>('buyer');
  
  // Goal-related state for pipeline requirements
  const [goalSettings, setGoalSettings] = useState({
    fallout_rate: 50,
    monthlyDeals: Array(12).fill(0) as number[]
  });
  
  const [newClient, setNewClient] = useState({
    client_name: '',
    email: '',
    phone: '',
    notes: '',
    property_interest: '',
    source: '',
    client_type: 'buyer' as 'buyer' | 'seller',
    projected_sale_amount: '',
    commission_percent: '3',
    split_percent: '100',
    expected_pending_date: '',
    status: ''
  });

  // Auto-calculate GCI from sale amount, commission %, and split %
  const calculateGCI = (saleAmount: string, commissionPercent: string, splitPercent: string): number => {
    const sale = parseFloat(saleAmount) || 0;
    const commission = parseFloat(commissionPercent) || 0;
    const split = parseFloat(splitPercent) || 0;
    return sale * (commission / 100) * (split / 100);
  };

  const fetchClients = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('pipeline_clients')
      .select('*')
      .eq('user_id', user.id)
      .order('stage', { ascending: false });
    
    if (error) {
      console.error('Error fetching clients:', error);
    } else {
      setClients((data as PipelineClient[]) || []);
    }
    setLoading(false);
  };

  const fetchGoalSettings = async () => {
    if (!user) return;
    
    const currentYear = 2026;
    
    // Fetch goal calculation values from localStorage
    const savedCalcValues = localStorage.getItem(`goalCalcValues_${user.id}_${currentYear}`);
    const falloutRate = savedCalcValues ? JSON.parse(savedCalcValues).fallout_rate ?? 50 : 50;
    
    // Fetch monthly goals from localStorage
    const savedMonthlyGoals = localStorage.getItem(`monthlyGoals_${user.id}_${currentYear}`);
    let monthlyDeals = Array(12).fill(0);
    
    if (savedMonthlyGoals) {
      const parsed = JSON.parse(savedMonthlyGoals);
      monthlyDeals = parsed.map((m: { deals: number }) => m.deals || 0);
    } else {
      // Try to get from agent_goals if no monthly breakdown exists
      const { data } = await supabase
        .from('agent_goals')
        .select('target_value')
        .eq('user_id', user.id)
        .eq('period', 'yearly')
        .eq('goal_type', 'deals_closed')
        .maybeSingle();
      
      if (data?.target_value) {
        const evenMonthly = data.target_value / 12;
        monthlyDeals = Array(12).fill(evenMonthly);
      }
    }
    
    setGoalSettings({ fallout_rate: falloutRate, monthlyDeals });
  };

  useEffect(() => {
    fetchClients();
    fetchGoalSettings();
  }, [user]);

  const syncClientToFUB = async (clientData: typeof newClient) => {
    try {
      const nameParts = clientData.client_name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const stageNum = calculateStageFromDate(clientData.expected_pending_date || null);
      const stageTag = `pipeline_stage_${stageNum}`;
      const timelineTag = `timeline_${stageDefinitions[stageNum]?.description || 'unknown'}`;
      
      const { data, error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_person',
          params: {
            firstName,
            lastName,
            email: clientData.email || undefined,
            phone: clientData.phone || undefined,
            source: clientData.source || 'Lovable Pipeline',
            tags: [stageTag, timelineTag, 'pipeline_client', clientData.client_type],
            notes: [clientData.notes, clientData.property_interest].filter(Boolean).join(' | ')
          }
        }
      });
      
      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error syncing to FUB:', error);
      return { success: false, error };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSubmitting(true);
    const calculatedStage = calculateStageFromDate(newClient.expected_pending_date || null);

    const calculatedGCI = calculateGCI(newClient.projected_sale_amount, newClient.commission_percent, newClient.split_percent);

    if (editClient) {
      const { error } = await supabase
        .from('pipeline_clients')
        .update({
          client_name: newClient.client_name,
          email: newClient.email || null,
          phone: newClient.phone || null,
          stage: calculatedStage,
          notes: newClient.notes || null,
          property_interest: newClient.property_interest || null,
          source: newClient.source || null,
          client_type: newClient.client_type,
          projected_sale_amount: parseFloat(newClient.projected_sale_amount) || 0,
          projected_gci: calculatedGCI,
          expected_pending_date: newClient.expected_pending_date || null,
          status: newClient.status || null
        })
        .eq('id', editClient.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Client updated!' });
        closeDialog();
        fetchClients();
      }
    } else {
      const { error } = await supabase.from('pipeline_clients').insert({
        user_id: user.id,
        client_name: newClient.client_name,
        email: newClient.email || null,
        phone: newClient.phone || null,
        stage: calculatedStage,
        notes: newClient.notes || null,
        property_interest: newClient.property_interest || null,
        source: newClient.source || null,
        client_type: newClient.client_type,
        projected_sale_amount: parseFloat(newClient.projected_sale_amount) || 0,
        projected_gci: calculatedGCI,
        expected_pending_date: newClient.expected_pending_date || null,
        status: newClient.status || null
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        setSubmitting(false);
        return;
      }
      
      if (syncToFUB) {
        const fubResult = await syncClientToFUB(newClient);
        if (fubResult.success) {
          toast({ title: 'Client added & synced to Follow Up Boss!' });
        } else {
          toast({ 
            title: 'Client added to pipeline', 
            description: 'Note: Could not sync to Follow Up Boss',
            variant: 'default'
          });
        }
      } else {
        toast({ title: 'Client added to pipeline!' });
      }
      
      closeDialog();
      fetchClients();
    }
    
    setSubmitting(false);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditClient(null);
    setSyncToFUB(true);
    setNewClient({ 
      client_name: '', email: '', phone: '', notes: '', 
      property_interest: '', source: '', client_type: activeTab,
      projected_sale_amount: '', commission_percent: '3', split_percent: '100', expected_pending_date: '', status: ''
    });
  };

  const openAddDialog = () => {
    setNewClient({ 
      client_name: '', email: '', phone: '', notes: '', 
      property_interest: '', source: '', client_type: activeTab,
      projected_sale_amount: '', commission_percent: '3', split_percent: '100', expected_pending_date: '', status: ''
    });
    setDialogOpen(true);
  };

  const openEditDialog = (client: PipelineClient) => {
    setEditClient(client);
    setNewClient({
      client_name: client.client_name,
      email: client.email || '',
      phone: client.phone || '',
      notes: client.notes || '',
      property_interest: client.property_interest || '',
      source: client.source || '',
      client_type: client.client_type,
      projected_sale_amount: client.projected_sale_amount?.toString() || '',
      commission_percent: '3',
      split_percent: '100',
      expected_pending_date: client.expected_pending_date || '',
      status: client.status || ''
    });
    setDialogOpen(true);
  };

  const updateExpectedPendingDate = async (clientId: string, newDate: string) => {
    const newStage = calculateStageFromDate(newDate);
    const { error } = await supabase
      .from('pipeline_clients')
      .update({ expected_pending_date: newDate, stage: newStage })
      .eq('id', clientId);
    
    if (!error) {
      fetchClients();
      toast({ title: `Expected pending date updated` });
    }
  };

  const deleteClient = async (clientId: string) => {
    const { error } = await supabase
      .from('pipeline_clients')
      .delete()
      .eq('id', clientId);
    
    if (!error) {
      fetchClients();
      toast({ title: 'Client removed from pipeline' });
    }
  };

  const handleFUBClientSelect = (client: { name: string; email?: string; phone?: string; source?: string }) => {
    setNewClient({
      ...newClient,
      client_name: client.name,
      email: client.email || newClient.email,
      phone: client.phone || newClient.phone,
      source: client.source || 'Follow Up Boss'
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-primary animate-pulse">Loading pipeline...</div>;
  }

  const buyers = clients.filter(c => c.client_type === 'buyer');
  const sellers = clients.filter(c => c.client_type === 'seller');
  const activeClients = activeTab === 'buyer' ? buyers : sellers;

  const clientsByStage = stageOrder.reduce((acc, stage) => {
    acc[stage] = activeClients.filter(c => c.stage === stage);
    return acc;
  }, {} as Record<number, PipelineClient[]>);

  // Calculate totals
  const totalProjectedVolume = clients.reduce((sum, c) => sum + (c.projected_sale_amount || 0), 0);
  const totalProjectedGCI = clients.reduce((sum, c) => sum + (c.projected_gci || 0), 0);
  const buyerVolume = buyers.reduce((sum, c) => sum + (c.projected_sale_amount || 0), 0);
  const buyerGCI = buyers.reduce((sum, c) => sum + (c.projected_gci || 0), 0);
  const sellerVolume = sellers.reduce((sum, c) => sum + (c.projected_sale_amount || 0), 0);
  const sellerGCI = sellers.reduce((sum, c) => sum + (c.projected_gci || 0), 0);

  const hotLeads = activeClients.filter(c => c.stage >= 8).length;

  // Pipeline requirement calculations
  const conversionRate = (100 - goalSettings.fallout_rate) / 100;
  const totalDealsGoal = goalSettings.monthlyDeals.reduce((sum, d) => sum + d, 0);
  
  const getQuarterlyDeals = (qIndex: number) => {
    const startMonth = qIndex * 3;
    return goalSettings.monthlyDeals.slice(startMonth, startMonth + 3).reduce((sum, d) => sum + d, 0);
  };
  
  const getPipelineNeeded = (deals: number) => {
    if (conversionRate <= 0) return 0;
    return Math.ceil(deals / conversionRate);
  };

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Get clients by quarter based on expected_pending_date
  const getClientsInQuarter = (qIndex: number) => {
    const currentYear = 2026;
    const startMonth = qIndex * 3; // 0, 3, 6, 9
    const endMonth = startMonth + 2; // 2, 5, 8, 11
    
    return clients.filter(c => {
      if (!c.expected_pending_date) return false;
      const date = parseISO(c.expected_pending_date);
      const month = date.getMonth();
      const year = date.getFullYear();
      return year === currentYear && month >= startMonth && month <= endMonth;
    }).length;
  };

  // Get clients by month based on expected_pending_date
  const getClientsInMonth = (monthIndex: number) => {
    const currentYear = 2026;
    return clients.filter(c => {
      if (!c.expected_pending_date) return false;
      const date = parseISO(c.expected_pending_date);
      return date.getFullYear() === currentYear && date.getMonth() === monthIndex;
    }).length;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Client Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            {clients.length} clients in pipeline • {buyers.length} buyers • {sellers.length} sellers
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); else openAddDialog(); }}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-primary font-display">
                {editClient ? 'Edit Client' : 'Add Client to Pipeline'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Client Type</Label>
                <Select value={newClient.client_type} onValueChange={(v: 'buyer' | 'seller') => setNewClient({ ...newClient, client_type: v, status: '' })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={newClient.status || 'none'} onValueChange={(v) => setNewClient({ ...newClient, status: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select status (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Status</SelectItem>
                    {(newClient.client_type === 'buyer' ? buyerStatusOptions : sellerStatusOptions).map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Client name *"
                  value={newClient.client_name}
                  onChange={(e) => setNewClient({ ...newClient, client_name: e.target.value })}
                  required
                  className="flex-1"
                />
                <FUBClientSearch 
                  onSelectClient={handleFUBClientSelect}
                  trigger={
                    <Button type="button" variant="outline" size="icon" title="Import from Follow Up Boss">
                      <Search className="h-4 w-4" />
                    </Button>
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="email"
                  placeholder="Email"
                  value={newClient.email}
                  onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                />
                <Input
                  type="tel"
                  placeholder="Phone"
                  value={newClient.phone}
                  onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Expected Pending Month</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select 
                    value={getMonthYearFromDate(newClient.expected_pending_date).month} 
                    onValueChange={(m) => {
                      const { year } = getMonthYearFromDate(newClient.expected_pending_date);
                      setNewClient({ ...newClient, expected_pending_date: monthYearToDateString(m, year || '2026') });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {months.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select 
                    value={getMonthYearFromDate(newClient.expected_pending_date).year} 
                    onValueChange={(y) => {
                      const { month } = getMonthYearFromDate(newClient.expected_pending_date);
                      setNewClient({ ...newClient, expected_pending_date: monthYearToDateString(month || '1', y) });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Year" /></SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newClient.expected_pending_date && (
                  <p className="text-xs text-muted-foreground">
                    Auto-assigned to Stage {calculateStageFromDate(newClient.expected_pending_date)} ({stageDefinitions[calculateStageFromDate(newClient.expected_pending_date)]?.description})
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Projected Sale Amount</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 500000"
                    value={newClient.projected_sale_amount}
                    onChange={(e) => setNewClient({ ...newClient, projected_sale_amount: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Commission %</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="3"
                      value={newClient.commission_percent}
                      onChange={(e) => setNewClient({ ...newClient, commission_percent: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Your Split %</Label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="100"
                      value={newClient.split_percent}
                      onChange={(e) => setNewClient({ ...newClient, split_percent: e.target.value })}
                    />
                  </div>
                </div>
                {newClient.projected_sale_amount && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-sm text-muted-foreground">Projected GCI</p>
                    <p className="text-xl font-bold text-green-400">
                      ${calculateGCI(newClient.projected_sale_amount, newClient.commission_percent, newClient.split_percent).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
              </div>
              <Input
                placeholder="Property interest (e.g., 3BR in Downtown)"
                value={newClient.property_interest}
                onChange={(e) => setNewClient({ ...newClient, property_interest: e.target.value })}
              />
              <Input
                placeholder="Source (e.g., Referral, Open House)"
                value={newClient.source}
                onChange={(e) => setNewClient({ ...newClient, source: e.target.value })}
              />
              <Textarea
                placeholder="Notes"
                value={newClient.notes}
                onChange={(e) => setNewClient({ ...newClient, notes: e.target.value })}
                rows={3}
              />
              {!editClient && (
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="sync-fub" 
                    checked={syncToFUB} 
                    onCheckedChange={(checked) => setSyncToFUB(checked === true)}
                  />
                  <Label htmlFor="sync-fub" className="text-sm text-muted-foreground cursor-pointer">
                    Also add to Follow Up Boss
                  </Label>
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {syncToFUB ? 'Adding & Syncing...' : 'Adding...'}
                  </>
                ) : (
                  editClient ? 'Update Client' : 'Add Client'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pipeline Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gold/10">
                <Home className="h-5 w-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Volume</p>
                <p className="text-xl font-bold text-gold">${totalProjectedVolume.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-gold/20 bg-gradient-to-br from-card to-gold/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gold/10">
                <DollarSign className="h-5 w-5 text-gold" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Projected GCI</p>
                <p className="text-xl font-bold text-gold">${totalProjectedGCI.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buyers ({buyers.length})</p>
                <p className="text-lg font-bold text-blue-400">${buyerGCI.toLocaleString()} GCI</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-primary/10 bg-card/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Home className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sellers ({sellers.length})</p>
                <p className="text-lg font-bold text-emerald-400">${sellerGCI.toLocaleString()} GCI</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Requirements Card */}
      {totalDealsGoal > 0 && (
        <Card className="border-gold/20 bg-gradient-to-br from-card to-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-display text-foreground flex items-center gap-2">
              <Target className="h-5 w-5 text-gold" />
              Pipeline Requirements
              <span className="text-xs font-normal text-muted-foreground ml-2">
                ({goalSettings.fallout_rate}% fallout = {100 - goalSettings.fallout_rate}% conversion)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Names needed in pipeline to hit your deal goals:
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Current:</span>
                <span className={`text-lg font-bold ${clients.length >= getPipelineNeeded(totalDealsGoal) ? 'text-green-400' : 'text-amber-400'}`}>
                  {clients.length}
                </span>
                <span className="text-sm text-muted-foreground">/ {getPipelineNeeded(totalDealsGoal)} needed</span>
              </div>
            </div>
            
            {/* Annual Total */}
            <div className="p-3 rounded-lg bg-gold/10 border border-gold/30 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gold">Annual Total</p>
                <p className="text-xs text-muted-foreground">for {totalDealsGoal.toFixed(1)} deals</p>
              </div>
              <p className="text-3xl font-bold text-gold">{getPipelineNeeded(totalDealsGoal)}</p>
            </div>

            {/* Quarterly Breakdown */}
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Quarterly Breakdown</p>
              <div className="grid grid-cols-4 gap-2">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, qIndex) => {
                  const quarterDeals = getQuarterlyDeals(qIndex);
                  const pipelineNeeded = getPipelineNeeded(quarterDeals);
                  const currentInQuarter = getClientsInQuarter(qIndex);
                  const isOnTrack = currentInQuarter >= pipelineNeeded;
                  return (
                    <div key={quarter} className={`p-3 rounded-lg border text-center ${isOnTrack ? 'bg-green-500/10 border-green-500/30' : 'bg-background/50 border-gold/20'}`}>
                      <p className="text-xs text-muted-foreground mb-1">{quarter}</p>
                      <div className="flex items-center justify-center gap-1">
                        <span className={`text-lg font-bold ${isOnTrack ? 'text-green-400' : 'text-amber-400'}`}>
                          {currentInQuarter}
                        </span>
                        <span className="text-muted-foreground">/</span>
                        <span className="text-lg font-bold text-gold">{pipelineNeeded}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">for {quarterDeals.toFixed(1)} deals</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Monthly Breakdown */}
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Monthly Breakdown</p>
              <div className="grid grid-cols-6 md:grid-cols-12 gap-1">
                {monthNames.map((month, mIndex) => {
                  const monthDeals = goalSettings.monthlyDeals[mIndex] || 0;
                  const pipelineNeeded = getPipelineNeeded(monthDeals);
                  const currentInMonth = getClientsInMonth(mIndex);
                  const isOnTrack = currentInMonth >= pipelineNeeded;
                  return (
                    <div key={month} className={`p-2 rounded border text-center ${isOnTrack ? 'bg-green-500/10 border-green-500/30' : 'bg-background/50 border-primary/10'}`}>
                      <p className="text-xs text-muted-foreground">{month}</p>
                      <p className={`text-xs font-bold ${isOnTrack ? 'text-green-400' : 'text-amber-400'}`}>
                        {currentInMonth}/{pipelineNeeded}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Buyer/Seller Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'buyer' | 'seller')}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="buyer" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
            Buyers ({buyers.length})
          </TabsTrigger>
          <TabsTrigger value="seller" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            Sellers ({sellers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4 space-y-4">
          {/* Stage Legend */}
          <div className="flex flex-wrap gap-2">
            {stageOrder.map(stage => (
              <Badge key={stage} className={`${stageDefinitions[stage].color} text-xs`}>
                {stage}: {stageDefinitions[stage].description}
              </Badge>
            ))}
          </div>

          {/* Hot leads indicator */}
          <p className="text-sm text-muted-foreground">
            <span className="text-primary font-semibold">{hotLeads} hot leads</span> (Stage 8+)
          </p>

          {/* Pipeline Grid */}
          <ScrollArea className="w-full">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-4 min-w-[800px] pb-4">
              {stageOrder.map((stage) => (
                <Card key={stage} className="border-primary/10 bg-card/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center justify-between">
                      <div>
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs font-bold ${stageDefinitions[stage].color}`}>
                          {stage}
                        </span>
                        <span className="text-muted-foreground text-xs">{stageDefinitions[stage].description}</span>
                      </div>
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        {clientsByStage[stage].length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {clientsByStage[stage].map((client) => (
                      <div 
                        key={client.id} 
                        className="p-3 rounded-lg bg-background/50 border border-primary/10 hover:border-primary/30 transition-colors group"
                      >
                        <div className="flex items-start justify-between">
                          <p className="font-medium text-foreground text-sm truncate flex-1">{client.client_name}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              onClick={() => openEditDialog(client)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => deleteClient(client.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {(() => {
                          const statusInfo = getStatusLabel(client.status, client.client_type);
                          return statusInfo ? (
                            <Badge className={`${statusInfo.color} text-xs mt-1`}>
                              {statusInfo.label}
                            </Badge>
                          ) : null;
                        })()}
                        {client.projected_sale_amount && client.projected_sale_amount > 0 && (
                          <p className="text-xs text-gold font-medium">
                            ${client.projected_sale_amount.toLocaleString()}
                          </p>
                        )}
                        {client.projected_gci && client.projected_gci > 0 && (
                          <p className="text-xs text-green-400">
                            GCI: ${client.projected_gci.toLocaleString()}
                          </p>
                        )}
                        {client.email && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {client.email}
                          </p>
                        )}
                        {client.phone && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {client.phone}
                          </p>
                        )}
                        {client.property_interest && (
                          <p className="text-xs text-primary mt-1 truncate">
                            {client.property_interest}
                          </p>
                        )}
                        {client.source && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {client.source}
                          </Badge>
                        )}
                        {client.expected_pending_date && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Pending: {format(parseISO(client.expected_pending_date), 'MMM yyyy')}
                          </p>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-1">
                          <Select 
                            value={getMonthYearFromDate(client.expected_pending_date).month} 
                            onValueChange={(m) => {
                              const { year } = getMonthYearFromDate(client.expected_pending_date);
                              updateExpectedPendingDate(client.id, monthYearToDateString(m, year || '2026'));
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Mo" /></SelectTrigger>
                            <SelectContent>
                              {months.map(mo => (
                                <SelectItem key={mo.value} value={mo.value}>{mo.label.slice(0, 3)}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select 
                            value={getMonthYearFromDate(client.expected_pending_date).year} 
                            onValueChange={(y) => {
                              const { month } = getMonthYearFromDate(client.expected_pending_date);
                              updateExpectedPendingDate(client.id, monthYearToDateString(month || '1', y));
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Yr" /></SelectTrigger>
                            <SelectContent>
                              {years.map(yr => (
                                <SelectItem key={yr} value={yr}>{yr}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                    {clientsByStage[stage].length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">No clients</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Pipeline;