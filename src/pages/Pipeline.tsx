import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Phone, Mail, Search, Trash2, Edit2, Loader2, DollarSign, Home, Users, Calendar, RefreshCw } from 'lucide-react';
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
}

interface FUBPerson {
  id: number;
  firstName: string;
  lastName: string;
  stage: string;
  emails: { value: string }[];
  phones: { value: string }[];
  created: string;
}

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

const years = ['2025', '2026', '2027', '2028', '2029', '2030'];

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
  
  // FUB Active clients state
  const [fubActiveBuyers, setFubActiveBuyers] = useState<FUBPerson[]>([]);
  const [fubActiveSellers, setFubActiveSellers] = useState<FUBPerson[]>([]);
  const [fubLoading, setFubLoading] = useState(false);
  
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
    expected_pending_date: ''
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

  const fetchFUBActiveClients = async () => {
    setFubLoading(true);
    try {
      // Fetch Active Buyers from FUB
      const buyersResponse = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'get_people_by_stage',
          params: { stage: 'Active Buyers', limit: 50 }
        }
      });
      
      if (buyersResponse.data?.success && buyersResponse.data?.data?.people) {
        setFubActiveBuyers(buyersResponse.data.data.people);
      }

      // Fetch Active Listings (Sellers) from FUB
      const sellersResponse = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'get_people_by_stage',
          params: { stage: 'Active Listings', limit: 50 }
        }
      });
      
      if (sellersResponse.data?.success && sellersResponse.data?.data?.people) {
        setFubActiveSellers(sellersResponse.data.data.people);
      }
    } catch (error) {
      console.error('Error fetching FUB active clients:', error);
    }
    setFubLoading(false);
  };

  useEffect(() => {
    fetchClients();
    fetchFUBActiveClients();
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
          expected_pending_date: newClient.expected_pending_date || null
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
        expected_pending_date: newClient.expected_pending_date || null
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
      projected_sale_amount: '', commission_percent: '3', split_percent: '100', expected_pending_date: ''
    });
  };

  const openAddDialog = () => {
    setNewClient({ 
      client_name: '', email: '', phone: '', notes: '', 
      property_interest: '', source: '', client_type: activeTab,
      projected_sale_amount: '', commission_percent: '3', split_percent: '100', expected_pending_date: ''
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
      expected_pending_date: client.expected_pending_date || ''
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

  const handleFUBClientSelect = (client: { name: string; email?: string; phone?: string }) => {
    setNewClient({
      ...newClient,
      client_name: client.name,
      email: client.email || newClient.email,
      phone: client.phone || newClient.phone,
      source: 'Follow Up Boss'
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
                <Select value={newClient.client_type} onValueChange={(v: 'buyer' | 'seller') => setNewClient({ ...newClient, client_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
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
                      setNewClient({ ...newClient, expected_pending_date: monthYearToDateString(m, year || '2025') });
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

      {/* FUB Active Clients Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-blue-500/20 bg-gradient-to-br from-card to-blue-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-400" />
                Active Buyers
                <Badge variant="outline" className="ml-2 border-blue-500/30 text-blue-400">
                  FUB
                </Badge>
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={fetchFUBActiveClients}
                disabled={fubLoading}
              >
                <RefreshCw className={`h-4 w-4 ${fubLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">From Follow Up Boss "Active Buyers" stage</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              {fubLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                </div>
              ) : fubActiveBuyers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No active buyers in FUB</p>
              ) : (
                <div className="space-y-2">
                  {fubActiveBuyers.map((person) => (
                    <div key={person.id} className="p-3 rounded-lg bg-background/50 border border-blue-500/10 hover:border-blue-500/30 transition-colors">
                      <p className="font-medium text-sm">{person.firstName} {person.lastName}</p>
                      {person.emails?.[0]?.value && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {person.emails[0].value}
                        </p>
                      )}
                      {person.phones?.[0]?.value && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {person.phones[0].value}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="border-emerald-500/20 bg-gradient-to-br from-card to-emerald-500/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-display flex items-center gap-2">
                <Home className="h-5 w-5 text-emerald-400" />
                Active Listings
                <Badge variant="outline" className="ml-2 border-emerald-500/30 text-emerald-400">
                  FUB
                </Badge>
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8" 
                onClick={fetchFUBActiveClients}
                disabled={fubLoading}
              >
                <RefreshCw className={`h-4 w-4 ${fubLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">From Follow Up Boss "Active Listings" stage</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              {fubLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                </div>
              ) : fubActiveSellers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No active listings in FUB</p>
              ) : (
                <div className="space-y-2">
                  {fubActiveSellers.map((person) => (
                    <div key={person.id} className="p-3 rounded-lg bg-background/50 border border-emerald-500/10 hover:border-emerald-500/30 transition-colors">
                      <p className="font-medium text-sm">{person.firstName} {person.lastName}</p>
                      {person.emails?.[0]?.value && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {person.emails[0].value}
                        </p>
                      )}
                      {person.phones?.[0]?.value && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {person.phones[0].value}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

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
                              updateExpectedPendingDate(client.id, monthYearToDateString(m, year || '2025'));
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