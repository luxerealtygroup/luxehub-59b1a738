import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
import { DollarSign, TrendingUp, Clock, CheckCircle, Plus, Search, Loader2, Download, Users } from 'lucide-react';
import { format } from 'date-fns';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { useToast } from '@/hooks/use-toast';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';

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

const initialDealState = {
  client_name: '',
  property_address: '',
  deal_value: '',
  gross_commission: '',
  agent_split_percent: '70',
  team_split_percent: '0',
  brokerage_split_percent: '30',
  referral_amount: '0',
  other_deductions: '0',
  transaction_side: 'buyer',
  commission_status: 'pending',
  stage: 'closed',
  notes: '',
  email: '',
  phone: ''
};

const Commissions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncToFUB, setSyncToFUB] = useState(false);
  const [newDeal, setNewDeal] = useState(initialDealState);
  
  const [importingFUB, setImportingFUB] = useState(false);
  const [fubDeals, setFubDeals] = useState<FUBDeal[]>([]);
  const [showFUBImport, setShowFUBImport] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchCommissions();
  }, [user]);

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
    const agentPercent = parseFloat(deal.agent_split_percent) || 0;
    const teamPercent = parseFloat(deal.team_split_percent) || 0;
    const brokeragePercent = parseFloat(deal.brokerage_split_percent) || 0;
    const referral = parseFloat(deal.referral_amount) || 0;
    const other = parseFloat(deal.other_deductions) || 0;
    
    // Calculate: gross - brokerage cut - team cut - referral - other = agent net
    const afterBrokerage = gross * (1 - brokeragePercent / 100);
    const afterTeam = afterBrokerage * (1 - teamPercent / 100);
    const netCommission = (afterTeam * agentPercent / 100) - referral - other;
    
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
    
    setSubmitting(true);
    const netCommission = calculateNetCommission(newDeal);

    const { data: dealData, error: dealError } = await supabase.from('deals').insert({
      user_id: user.id,
      client_name: newDeal.client_name,
      property_address: newDeal.property_address || null,
      deal_value: newDeal.deal_value ? parseFloat(newDeal.deal_value) : null,
      stage: newDeal.stage as 'lead' | 'contacted' | 'showing' | 'offer' | 'under_contract' | 'closed' | 'lost',
      notes: newDeal.notes || null
    }).select().single();

    if (dealError) {
      toast({ title: 'Error creating deal', description: dealError.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    const { error: commissionError } = await supabase.from('commissions').insert({
      user_id: user.id,
      deal_id: dealData.id,
      amount: netCommission,
      gross_commission: parseFloat(newDeal.gross_commission) || null,
      agent_split_percent: parseFloat(newDeal.agent_split_percent) || null,
      team_split_percent: parseFloat(newDeal.team_split_percent) || null,
      brokerage_split_percent: parseFloat(newDeal.brokerage_split_percent) || null,
      referral_amount: parseFloat(newDeal.referral_amount) || null,
      other_deductions: parseFloat(newDeal.other_deductions) || null,
      transaction_side: newDeal.transaction_side,
      status: newDeal.commission_status
    });

    if (commissionError) {
      toast({ title: 'Error creating commission', description: commissionError.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    
    if (syncToFUB) {
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
    
    setNewDeal({
      ...initialDealState,
      client_name: clientName,
      property_address: deal.name || '',
      deal_value: deal.price?.toString() || '',
      gross_commission: (deal.agentCommission || deal.commissionValue)?.toString() || '',
      stage: deal.stageName?.toLowerCase().includes('closed') ? 'closed' : 'under_contract'
    });
    setShowFUBImport(false);
    setAddDealOpen(true);
  };

  const totalEarned = commissions
    .filter(c => c.status === 'paid')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalPending = commissions
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);

  const thisMonth = commissions
    .filter(c => {
      const date = new Date(c.created_at);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + c.amount, 0);

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
                  {fubDeals.map((deal) => (
                    <div key={deal.id} className="p-3 rounded-lg bg-gold/5 border border-gold/10 flex justify-between items-center">
                      <div>
                        <p className="font-medium">{deal.people?.[0]?.name || deal.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {deal.pipelineName} • {deal.stageName} {deal.price ? `• $${deal.price.toLocaleString()}` : ''}
                        </p>
                        {deal.agentCommission && (
                          <p className="text-xs text-gold">Commission: ${deal.agentCommission.toLocaleString()}</p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => importFUBDeal(deal)}>Import</Button>
                    </div>
                  ))}
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
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Brokerage Split (%)</Label>
                      <Input
                        type="number"
                        placeholder="30"
                        value={newDeal.brokerage_split_percent}
                        onChange={(e) => setNewDeal({ ...newDeal, brokerage_split_percent: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Team Split (%)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newDeal.team_split_percent}
                        onChange={(e) => setNewDeal({ ...newDeal, team_split_percent: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Your Split (%)</Label>
                      <Input
                        type="number"
                        placeholder="70"
                        value={newDeal.agent_split_percent}
                        onChange={(e) => setNewDeal({ ...newDeal, agent_split_percent: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Referral Fee ($)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={newDeal.referral_amount}
                        onChange={(e) => setNewDeal({ ...newDeal, referral_amount: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Other Deductions ($)</Label>
                    <Input
                      type="number"
                      placeholder="TC fees, marketing, etc."
                      value={newDeal.other_deductions}
                      onChange={(e) => setNewDeal({ ...newDeal, other_deductions: e.target.value })}
                    />
                  </div>
                  <div className="pt-2 border-t border-gold/20">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Your Net Commission:</span>
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
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="under_contract">Under Contract</SelectItem>
                        <SelectItem value="offer">Offer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Status</Label>
                    <Select value={newDeal.commission_status} onValueChange={(v) => setNewDeal({ ...newDeal, commission_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  placeholder="Notes (optional)"
                  value={newDeal.notes}
                  onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
                  rows={2}
                />
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Earned</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-400">${totalEarned.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">${totalPending.toLocaleString()}</div>
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

      <Card className="border-gold/10 bg-card/50">
        <CardHeader>
          <CardTitle className="text-gold font-display">Commission History</CardTitle>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 mx-auto text-gold/30 mb-4" />
              <p className="text-muted-foreground">No commissions yet</p>
              <p className="text-sm text-muted-foreground mt-1">Close deals to start earning!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-gold/10">
                  <TableHead>Deal</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Gross</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((commission) => (
                  <TableRow key={commission.id} className="border-gold/10">
                    <TableCell className="font-medium">
                      {commission.deals?.client_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {commission.deals?.property_address || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {commission.gross_commission ? `$${commission.gross_commission.toLocaleString()}` : '-'}
                    </TableCell>
                    <TableCell className="text-gold font-semibold">
                      ${commission.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={commission.status === 'paid' 
                          ? 'border-green-500/30 text-green-400' 
                          : 'border-amber-500/30 text-amber-400'
                        }
                      >
                        {commission.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(commission.created_at), 'MMM d, yyyy')}
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