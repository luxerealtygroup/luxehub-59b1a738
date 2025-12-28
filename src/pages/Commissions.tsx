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
import { DollarSign, TrendingUp, Clock, CheckCircle, Plus, Search, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { useToast } from '@/hooks/use-toast';

interface Commission {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  deals: {
    client_name: string;
    property_address: string | null;
    deal_value: number | null;
  } | null;
}

const Commissions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Add deal dialog state
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncToFUB, setSyncToFUB] = useState(true);
  const [newDeal, setNewDeal] = useState({
    client_name: '',
    property_address: '',
    deal_value: '',
    commission_amount: '',
    commission_status: 'pending',
    stage: 'closed',
    notes: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    if (!user) return;

    const fetchCommissions = async () => {
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

    fetchCommissions();
  }, [user]);

  const syncDealToFUB = async (dealData: typeof newDeal) => {
    try {
      const nameParts = dealData.client_name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const { data, error } = await supabase.functions.invoke('follow-up-boss', {
        body: {
          action: 'create_person',
          params: {
            firstName,
            lastName,
            email: dealData.email || undefined,
            phone: dealData.phone || undefined,
            source: 'Closed Deal',
            tags: ['closed_deal', 'commission_tracked'],
            notes: `Property: ${dealData.property_address || 'N/A'} | Deal Value: $${dealData.deal_value || 0} | Commission: $${dealData.commission_amount || 0}`
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

  const handleAddDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSubmitting(true);

    // Create deal
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

    // Create commission
    const { error: commissionError } = await supabase.from('commissions').insert({
      user_id: user.id,
      deal_id: dealData.id,
      amount: parseFloat(newDeal.commission_amount),
      status: newDeal.commission_status
    });

    if (commissionError) {
      toast({ title: 'Error creating commission', description: commissionError.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }
    
    if (syncToFUB) {
      const fubResult = await syncDealToFUB(newDeal);
      if (fubResult.success) {
        toast({ title: 'Deal added & synced to Follow Up Boss!' });
      } else {
        toast({ 
          title: 'Deal added', 
          description: 'Note: Could not sync to Follow Up Boss',
        });
      }
    } else {
      toast({ title: 'Deal and commission added!' });
    }
    
    // Refresh commissions
    const { data } = await supabase
      .from('commissions')
      .select(`*, deals (client_name, property_address, deal_value)`)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setCommissions(data || []);
    
    setAddDealOpen(false);
    setNewDeal({ client_name: '', property_address: '', deal_value: '', commission_amount: '', commission_status: 'pending', stage: 'closed', notes: '', email: '', phone: '' });
    setSyncToFUB(true);
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

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading commissions...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Commissions</h1>
          <p className="text-muted-foreground mt-1">Track your earnings and pending payments</p>
        </div>
        <Dialog open={addDealOpen} onOpenChange={setAddDealOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card max-w-md">
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
                  <Label>Commission Amount ($) *</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 15000"
                    value={newDeal.commission_amount}
                    onChange={(e) => setNewDeal({ ...newDeal, commission_amount: e.target.value })}
                    required
                  />
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
                  <Label>Commission Status</Label>
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
                disabled={submitting || !newDeal.client_name || !newDeal.commission_amount}
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
                  <TableHead>Amount</TableHead>
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
