import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DollarSign, TrendingUp, Clock, CheckCircle, Plus, Search, Loader2, Download, Users, X, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { useToast } from '@/hooks/use-toast';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { useGoogleCalendar } from '@/hooks/useGoogleCalendar';

interface AgentProfile {
  id: string;
  full_name: string | null;
  fub_user_id: number | null;
}

interface Commission {
  id: string;
  amount: number;
  gross_commission: number | null;
  agent_split_percent: number | null;
  team_split_percent: number | null;
  brokerage_split_percent: number | null;
  referral_amount: number | null;
  other_deductions: number | null;
  transaction_side: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
  deals: {
    client_name: string;
    property_address: string | null;
    deal_value: number | null;
  } | null;
}

interface Condition {
  id: string;
  name: string;
  deadline: string;
}

// FUB deal transformed for display
interface FUBDealDisplay {
  id: number;
  clientName: string;
  propertyAddress: string;
  dealValue: number;
  grossCommission: number;
  status: 'conditional' | 'pending' | 'closed';
  stageName: string;
  createdAt: string;
  source: 'fub';
}

const initialDealState = {
  client_name: '',
  property_address: '',
  deal_value: '',
  gross_commission: '',
  brokerage_split_percent: '20',
  transaction_side: 'buyer',
  commission_status: 'pending',
  stage: 'pending',
  closing_date: '',
  conditions: [] as Condition[],
  notes: '',
  email: '',
  phone: '',
  source: ''
};

const Commissions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { isConnected: calendarConnected, createEvent } = useGoogleCalendar();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [fubDealsDisplay, setFubDealsDisplay] = useState<FUBDealDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFubId, setUserFubId] = useState<number | null>(null);
  
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncToFUB, setSyncToFUB] = useState(false);
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [newDeal, setNewDeal] = useState(initialDealState);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  
  const [importingFUB, setImportingFUB] = useState(false);
  const [fubDeals, setFubDeals] = useState<FUBDeal[]>([]);
  const [showFUBImport, setShowFUBImport] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchUserProfile();
    fetchCommissions();
    if (isAdmin) {
      fetchAgents();
    }
  }, [user, isAdmin]);

  // Fetch FUB deals when we have the user's fub_user_id
  useEffect(() => {
    if (userFubId) {
      fetchMyFUBDeals();
    }
  }, [userFubId]);

  const fetchUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('fub_user_id')
      .eq('id', user.id)
      .single();
    if (data?.fub_user_id) {
      setUserFubId(data.fub_user_id);
    }
  };

  const fetchMyFUBDeals = async () => {
    if (!userFubId) return;
    try {
      const response = await followUpBossApi.getDeals(200);
      if (response.success && response.data?.deals) {
        // Filter deals to only those where current user is assigned
        const myDeals = response.data.deals.filter((deal: FUBDeal) => 
          deal.users?.some(u => u.id === userFubId)
        );
        
        // Transform to display format and deduplicate by deal ID and normalized client name
        const seenDealIds = new Set<number>();
        const seenClientKeys = new Set<string>();
        const displayDeals: FUBDealDisplay[] = [];
        
        myDeals.forEach((deal: FUBDeal) => {
          // Skip if we've already seen this deal ID
          if (seenDealIds.has(deal.id)) {
            return;
          }
          
          const clientName = deal.people?.[0]?.name || deal.name || 'Unknown';
          const propertyAddress = deal.name || '';
          
          // Normalize client name: remove "and", extra spaces, lowercase for comparison
          const normalizedClientName = clientName.toLowerCase().replace(/\s+and\s+/g, ' ').replace(/\s+/g, ' ').trim();
          const normalizedAddress = propertyAddress.toLowerCase().replace(/\s+/g, ' ').trim();
          const dedupeKey = `${normalizedClientName}-${normalizedAddress}`;
          
          // Skip if we've already seen this client+property combination
          if (seenClientKeys.has(dedupeKey)) {
            return;
          }
          
          seenDealIds.add(deal.id);
          seenClientKeys.add(dedupeKey);
          
          let status: 'conditional' | 'pending' | 'closed' = 'pending';
          const stageLower = deal.stageName?.toLowerCase() || '';
          
          if (stageLower === 'won' || stageLower.includes('closed') || deal.status?.toLowerCase() === 'won') {
            status = 'closed';
          } else if (stageLower === 'offer' || stageLower.includes('conditional')) {
            status = 'conditional';
          } else if (stageLower === 'pending') {
            status = 'pending';
          }

          displayDeals.push({
            id: deal.id,
            clientName,
            propertyAddress,
            dealValue: deal.price || 0,
            grossCommission: deal.commissionValue || deal.agentCommission || 0,
            status,
            stageName: deal.stageName || '',
            createdAt: deal.createdAt || new Date().toISOString(),
            source: 'fub' as const
          });
        });
        
        setFubDealsDisplay(displayDeals);
      }
    } catch (error) {
      console.error('Error fetching FUB deals:', error);
    }
  };

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, fub_user_id')
      .order('full_name');
    setAgents(data || []);
  };

  const fetchCommissions = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('commissions')
      .select(`
        *,
        deals (
          client_name,
          property_address,
          deal_value
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setCommissions(data || []);
    setLoading(false);
  };

  const calculateNetCommission = (deal: typeof newDeal) => {
    const gross = parseFloat(deal.gross_commission) || 0;
    const brokeragePercent = parseFloat(deal.brokerage_split_percent) || 0;
    
    // Calculate: gross - brokerage cut = agent net
    const netCommission = gross * (1 - brokeragePercent / 100);
    
    return Math.max(0, netCommission);
  };

  const syncDealToFUB = async (dealData: typeof newDeal) => {
    try {
      const nameParts = dealData.client_name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const { error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_person',
          params: {
            firstName,
            lastName,
            email: dealData.email || undefined,
            phone: dealData.phone || undefined,
            source: 'Closed Deal',
            tags: ['closed_deal', 'commission_tracked'],
            notes: `Property: ${dealData.property_address || 'N/A'} | Deal Value: $${dealData.deal_value || 0}`
          }
        }
      });
      
      if (error) throw error;
      return { success: true };
    } catch (error) {
      console.error('Error syncing to FUB:', error);
      return { success: false, error };
    }
  };

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Use selected agent for admins, otherwise use current user
    const targetUserId = (isAdmin && selectedAgentId) ? selectedAgentId : user.id;
    
    setSubmitting(true);
    const netCommission = calculateNetCommission(newDeal);

    const { data: dealData, error: dealError } = await supabase.from('deals').insert({
      user_id: targetUserId,
      client_name: newDeal.client_name,
      property_address: newDeal.property_address || null,
      deal_value: newDeal.deal_value ? parseFloat(newDeal.deal_value) : null,
      expected_close_date: newDeal.closing_date || null,
      stage: newDeal.stage as 'lead' | 'contacted' | 'showing' | 'offer' | 'under_contract' | 'closed' | 'lost',
      notes: newDeal.notes || null,
      source: newDeal.source || null
    }).select().single();

    if (dealError) {
      toast({ title: 'Error creating deal', description: dealError.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Map stage to commission status
    let commissionStatus = newDeal.commission_status;
    if (newDeal.stage === 'offer') {
      commissionStatus = 'conditional';
    }

    // Format conditions for storage
    const earliestDeadline = newDeal.conditions.length > 0 
      ? newDeal.conditions.filter(c => c.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0]?.deadline 
      : null;
    const conditionNotes = newDeal.conditions.length > 0
      ? newDeal.conditions.map(c => `${c.name}: ${c.deadline || 'No deadline'}`).join('; ')
      : null;

    const { error: commissionError } = await supabase.from('commissions').insert({
      user_id: targetUserId,
      deal_id: dealData.id,
      amount: netCommission,
      gross_commission: parseFloat(newDeal.gross_commission) || null,
      brokerage_split_percent: parseFloat(newDeal.brokerage_split_percent) || null,
      transaction_side: newDeal.transaction_side,
      status: commissionStatus,
      condition_deadline: earliestDeadline,
      condition_notes: conditionNotes
    });

    if (commissionError) {
      toast({ title: 'Error creating commission', description: commissionError.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    
    // Add conditions to calendar if connected and checkbox is checked
    if (addToCalendar && calendarConnected && newDeal.conditions.length > 0) {
      try {
        for (const condition of newDeal.conditions) {
          if (condition.deadline && condition.name) {
            const deadlineDate = new Date(condition.deadline);
            // Create all-day event for condition deadline
            await createEvent({
              summary: `🏠 ${condition.name} - ${newDeal.client_name}`,
              description: `Condition deadline for ${newDeal.client_name}\nProperty: ${newDeal.property_address || 'N/A'}\nDeal Value: $${newDeal.deal_value || 0}`,
              start: { dateTime: deadlineDate.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              end: { dateTime: new Date(deadlineDate.getTime() + 60 * 60 * 1000).toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            });
          }
        }
        toast({ title: 'Deal added with calendar reminders!' });
      } catch (calError) {
        console.error('Calendar error:', calError);
        toast({ 
          title: 'Deal added',
          description: 'Note: Could not add to calendar',
        });
      }
    } else if (syncToFUB) {
      const fubResult = await syncDealToFUB(newDeal);
      toast({ 
        title: fubResult.success ? 'Deal added & synced to Follow Up Boss!' : 'Deal added',
        description: fubResult.success ? undefined : 'Note: Could not sync to Follow Up Boss',
      });
    } else {
      toast({ title: 'Deal and commission added!' });
    }
    
    await fetchCommissions();
    setAddDealOpen(false);
    setNewDeal(initialDealState);
    setSyncToFUB(false);
    setAddToCalendar(false);
    setSelectedAgentId('');
    setSubmitting(false);
  };

  const handleFUBClientSelect = (client: { name: string; email?: string; phone?: string }) => {
    setNewDeal({
      ...newDeal,
      client_name: client.name,
      email: client.email || '',
      phone: client.phone || ''
    });
  };

  const handleImportFUBDeals = async () => {
    setImportingFUB(true);
    try {
      // Fetch all deals from FUB (buyers and sellers)
      const response = await followUpBossApi.getDeals(100);
      if (response.success && response.data?.deals) {
        setFubDeals(response.data.deals);
        if (response.data.deals.length === 0) {
          toast({ title: 'No deals found in Follow Up Boss' });
        }
      } else {
        toast({ title: 'Error', description: response.error || 'Could not fetch deals', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error connecting to Follow Up Boss', variant: 'destructive' });
    } finally {
      setImportingFUB(false);
    }
  };

  const importFUBDeal = (deal: FUBDeal) => {
    const clientName = deal.people?.[0]?.name || deal.name || '';
    
    // Parse closing date from FUB
    const closingDate = deal.projectedCloseDate 
      ? deal.projectedCloseDate.split('T')[0] 
      : '';
    
    // Get source from deal or first person
    const dealSource = deal.source || deal.people?.[0]?.source || deal.pipelineName || 'Follow Up Boss';
    
    // Determine stage based on FUB stage name
    let stage = 'under_contract';
    if (deal.stageName?.toLowerCase().includes('closed') || deal.stageName?.toLowerCase().includes('won')) {
      stage = 'closed';
    } else if (deal.stageName?.toLowerCase() === 'offer' || deal.stageName?.toLowerCase().includes('conditional')) {
      stage = 'offer';
    }
    
    setNewDeal({
      ...initialDealState,
      client_name: clientName,
      property_address: deal.name || '',
      deal_value: deal.price?.toString() || '',
      gross_commission: (deal.agentCommission || deal.commissionValue)?.toString() || '',
      closing_date: closingDate,
      stage,
      source: dealSource
    });
    setShowFUBImport(false);
    setAddDealOpen(true);
  };

  // Calculate totals from both local commissions AND FUB deals
  const fubClosedTotal = fubDealsDisplay
    .filter(d => d.status === 'closed')
    .reduce((sum, d) => sum + d.grossCommission, 0);
  
  const fubPendingTotal = fubDealsDisplay
    .filter(d => d.status === 'pending')
    .reduce((sum, d) => sum + d.grossCommission, 0);
  
  const fubConditionalTotal = fubDealsDisplay
    .filter(d => d.status === 'conditional')
    .reduce((sum, d) => sum + d.grossCommission, 0);

  const localEarned = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + (c.gross_commission || c.amount), 0);

  const localPending = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + (c.gross_commission || c.amount), 0);

  // Combine FUB and local totals
  const totalEarned = fubClosedTotal || localEarned;
  const totalPending = fubPendingTotal || localPending;
  const totalConditional = fubConditionalTotal;

  const totalNetPending = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);

  // This month from FUB deals
  const thisMonthFUB = fubDealsDisplay
    .filter(d => {
      const date = new Date(d.createdAt);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, d) => sum + d.grossCommission, 0);

  const thisMonthLocal = commissions
    .filter(c => {
      const date = new Date(c.created_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + (c.gross_commission || c.amount), 0);

  const thisMonth = thisMonthFUB || thisMonthLocal;

  const netPreview = calculateNetCommission(newDeal);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading commissions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Commissions</h1>
          <p className="text-muted-foreground mt-1">Track your earnings and pending payments</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showFUBImport} onOpenChange={setShowFUBImport}>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-gold/30 text-gold hover:bg-gold/10" onClick={handleImportFUBDeals}>
                {importingFUB ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Import from FUB
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-primary font-display flex items-center gap-2">
                  <Users className="h-5 w-5" /> Follow Up Boss Deals
                </DialogTitle>
              </DialogHeader>
              {importingFUB ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gold" />
                </div>
              ) : fubDeals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No deals found in Follow Up Boss.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {fubDeals.map((deal) => {
                    const dealSource = deal.source || deal.people?.[0]?.source || deal.pipelineName;
                    return (
                      <div key={deal.id} className="p-3 rounded-lg bg-gold/5 border border-gold/10 flex justify-between items-center">
                        <div>
                          <p className="font-medium">{deal.people?.[0]?.name || deal.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {deal.pipelineName} • {deal.stageName} {deal.price ? `• $${deal.price.toLocaleString()}` : ''}
                          </p>
                          {dealSource && (
                            <p className="text-xs text-blue-400">Source: {dealSource}</p>
                          )}
                          {deal.agentCommission && (
                            <p className="text-xs text-gold">Commission: ${deal.agentCommission.toLocaleString()}</p>
                          )}
                        </div>
                        <Button size="sm" onClick={() => importFUBDeal(deal)}>Import</Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </DialogContent>
          </Dialog>
          
          <Dialog open={addDealOpen} onOpenChange={setAddDealOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4 mr-2" /> Add Deal
              </Button>
            </DialogTrigger>
            <DialogContent className="border-primary/20 bg-card max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-primary font-display">Add Deal & Commission</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddDeal} className="space-y-4">
                {isAdmin && (
                  <div className="space-y-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <Label className="text-primary font-medium">Assign to Agent</Label>
                    <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an agent (leave empty for yourself)" />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map(agent => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.full_name || 'Unnamed Agent'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    placeholder="Client name *"
                    value={newDeal.client_name}
                    onChange={(e) => setNewDeal({ ...newDeal, client_name: e.target.value })}
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
                <Input
                  placeholder="Property address"
                  value={newDeal.property_address}
                  onChange={(e) => setNewDeal({ ...newDeal, property_address: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Deal Value ($)</Label>
                    <Input
                      type="number"
                      placeholder="e.g., 500000"
                      value={newDeal.deal_value}
                      onChange={(e) => setNewDeal({ ...newDeal, deal_value: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Closing Date</Label>
                    <Input
                      type="date"
                      value={newDeal.closing_date}
                      onChange={(e) => setNewDeal({ ...newDeal, closing_date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Transaction Side</Label>
                  <Select value={newDeal.transaction_side} onValueChange={(v) => setNewDeal({ ...newDeal, transaction_side: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buyer">Buyer Side</SelectItem>
                      <SelectItem value="seller">Seller Side</SelectItem>
                      <SelectItem value="both">Both Sides</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="border border-gold/20 rounded-lg p-4 space-y-3 bg-gold/5">
                  <h4 className="font-medium text-gold">Commission Breakdown</h4>
                  <div className="space-y-2">
                    <Label>Gross Commission ($) *</Label>
                    <Input
                      type="number"
                      placeholder="Total commission before splits"
                      value={newDeal.gross_commission}
                      onChange={(e) => setNewDeal({ ...newDeal, gross_commission: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Brokerage Split (%)</Label>
                    <Input
                      type="number"
                      placeholder="30"
                      value={newDeal.brokerage_split_percent}
                      onChange={(e) => setNewDeal({ ...newDeal, brokerage_split_percent: e.target.value })}
                    />
                  </div>
                  <div className="pt-2 border-t border-gold/20">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Net After Cap:</span>
                      <span className="text-xl font-bold text-gold">${netPreview.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Deal Stage</Label>
                    <Select value={newDeal.stage} onValueChange={(v) => setNewDeal({ ...newDeal, stage: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="offer">Conditional</SelectItem>
                        <SelectItem value="under_contract">Pending</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Status</Label>
                    <Select value={newDeal.commission_status} onValueChange={(v) => setNewDeal({ ...newDeal, commission_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conditional">Conditional</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {newDeal.stage === 'offer' && (
                  <div className="border border-amber-500/20 rounded-lg p-4 space-y-3 bg-amber-500/5">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-amber-400">Conditions</h4>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                        onClick={() => {
                          setNewDeal({
                            ...newDeal,
                            conditions: [...newDeal.conditions, { id: crypto.randomUUID(), name: '', deadline: '' }]
                          });
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Condition
                      </Button>
                    </div>
                    {newDeal.conditions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No conditions added. Click "Add Condition" to track deadlines.</p>
                    ) : (
                      <div className="space-y-3">
                        {newDeal.conditions.map((condition, index) => (
                          <div key={condition.id} className="flex gap-2 items-start">
                            <div className="flex-1 space-y-2">
                              <Input
                                placeholder="Condition name (e.g., Financing, Inspection)"
                                value={condition.name}
                                onChange={(e) => {
                                  const updated = [...newDeal.conditions];
                                  updated[index] = { ...updated[index], name: e.target.value };
                                  setNewDeal({ ...newDeal, conditions: updated });
                                }}
                              />
                            </div>
                            <div className="w-40">
                              <Input
                                type="date"
                                value={condition.deadline}
                                onChange={(e) => {
                                  const updated = [...newDeal.conditions];
                                  updated[index] = { ...updated[index], deadline: e.target.value };
                                  setNewDeal({ ...newDeal, conditions: updated });
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive/80"
                              onClick={() => {
                                setNewDeal({
                                  ...newDeal,
                                  conditions: newDeal.conditions.filter((_, i) => i !== index)
                                });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Lead Source</Label>
                  <Input
                    placeholder="e.g., Zillow, Referral, Open House"
                    value={newDeal.source}
                    onChange={(e) => setNewDeal({ ...newDeal, source: e.target.value })}
                  />
                </div>
                <Textarea
                  placeholder="Notes (optional)"
                  value={newDeal.notes}
                  onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
                  rows={2}
                />
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="sync-fub-commission" 
                      checked={syncToFUB} 
                      onCheckedChange={(checked) => setSyncToFUB(checked === true)}
                    />
                    <Label htmlFor="sync-fub-commission" className="text-sm text-muted-foreground cursor-pointer">
                      Also add client to Follow Up Boss
                    </Label>
                  </div>
                  {newDeal.stage === 'offer' && newDeal.conditions.length > 0 && calendarConnected && (
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="add-to-calendar" 
                        checked={addToCalendar} 
                        onCheckedChange={(checked) => setAddToCalendar(checked === true)}
                      />
                      <Label htmlFor="add-to-calendar" className="text-sm text-muted-foreground cursor-pointer">
                        Add condition deadlines to Google Calendar
                      </Label>
                    </div>
                  )}
                </div>
                <Button 
                  type="submit" 
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={submitting || !newDeal.client_name || !newDeal.gross_commission}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {syncToFUB ? 'Adding & Syncing...' : 'Adding...'}
                    </>
                  ) : (
                    'Add Deal & Commission'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Closed (GCI)</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">${totalEarned.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending (GCI)</CardTitle>
            <Clock className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">${totalPending.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conditional (GCI)</CardTitle>
            <Clock className="h-5 w-5 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-400">${totalConditional.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
            <TrendingUp className="h-5 w-5 text-gold" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gold">${thisMonth.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* FUB Transactions - Primary source */}
      <Card className="border-gold/10 bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-gold font-display">My Transactions</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchMyFUBDeals}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {fubDealsDisplay.length === 0 && commissions.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 mx-auto text-gold/30 mb-4" />
              <p className="text-muted-foreground">No transactions yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                {userFubId ? 'Your deals from Follow Up Boss will appear here' : 'Link your FUB profile to see your deals'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gold/10">
                  <TableHead>Client</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Deal Value</TableHead>
                  <TableHead>GCI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Show FUB deals first */}
                {fubDealsDisplay.map((deal) => (
                  <TableRow key={`fub-${deal.id}`} className="border-gold/10">
                    <TableCell className="font-medium">{deal.clientName}</TableCell>
                    <TableCell className="text-muted-foreground">{deal.propertyAddress || '-'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {deal.dealValue ? `$${deal.dealValue.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="text-gold font-semibold">
                      ${deal.grossCommission.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={
                          deal.status === 'closed' 
                            ? 'border-green-500/30 text-green-400' 
                            : deal.status === 'conditional'
                            ? 'border-orange-500/30 text-orange-400'
                            : 'border-amber-500/30 text-amber-400'
                        }
                      >
                        {deal.stageName || deal.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-blue-500/30 text-blue-400">FUB</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Show local commissions that aren't duplicated from FUB */}
                {commissions.map((commission) => (
                  <TableRow key={commission.id} className="border-gold/10">
                    <TableCell className="font-medium">
                      {commission.deals?.client_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {commission.deals?.property_address || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {commission.deals?.deal_value ? `$${commission.deals.deal_value.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="text-gold font-semibold">
                      ${(commission.gross_commission || commission.amount).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={
                          commission.status === 'paid' 
                            ? 'border-green-500/30 text-green-400' 
                            : commission.status === 'conditional'
                            ? 'border-orange-500/30 text-orange-400'
                            : 'border-amber-500/30 text-amber-400'
                        }
                      >
                        {commission.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">Local</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Commissions;