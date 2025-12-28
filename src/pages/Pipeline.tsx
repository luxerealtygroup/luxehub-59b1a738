import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type DealStage = 'lead' | 'contacted' | 'showing' | 'offer' | 'under_contract' | 'closed' | 'lost';

interface Deal {
  id: string;
  client_name: string;
  property_address: string | null;
  deal_value: number | null;
  stage: DealStage;
  expected_close_date: string | null;
  commission_rate: number | null;
  notes: string | null;
  created_at: string;
}

const stageColors: Record<DealStage, string> = {
  lead: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  contacted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  showing: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  offer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  under_contract: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  closed: 'bg-green-500/20 text-green-400 border-green-500/30',
  lost: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const stageOrder: DealStage[] = ['lead', 'contacted', 'showing', 'offer', 'under_contract', 'closed', 'lost'];

const Pipeline = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  const [newDeal, setNewDeal] = useState({
    client_name: '',
    property_address: '',
    deal_value: '',
    stage: 'lead' as DealStage,
    commission_rate: '3',
    notes: ''
  });

  const fetchDeals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setDeals(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeals();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { error } = await supabase.from('deals').insert({
      user_id: user.id,
      client_name: newDeal.client_name,
      property_address: newDeal.property_address || null,
      deal_value: newDeal.deal_value ? parseFloat(newDeal.deal_value) : null,
      stage: newDeal.stage,
      commission_rate: parseFloat(newDeal.commission_rate),
      notes: newDeal.notes || null
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deal added to pipeline!' });
      setDialogOpen(false);
      setNewDeal({ client_name: '', property_address: '', deal_value: '', stage: 'lead', commission_rate: '3', notes: '' });
      fetchDeals();
    }
  };

  const updateStage = async (dealId: string, newStage: DealStage) => {
    const { error } = await supabase
      .from('deals')
      .update({ stage: newStage })
      .eq('id', dealId);
    
    if (!error) {
      fetchDeals();
      toast({ title: `Deal moved to ${newStage.replace('_', ' ')}` });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gold animate-pulse">Loading pipeline...</div>;
  }

  const dealsByStage = stageOrder.reduce((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<DealStage, Deal[]>);

  const totalPipelineValue = deals
    .filter(d => !['closed', 'lost'].includes(d.stage))
    .reduce((sum, d) => sum + (d.deal_value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Total pipeline value: <span className="text-gold font-semibold">${totalPipelineValue.toLocaleString()}</span>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Plus className="h-4 w-4 mr-2" /> Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="border-gold/20 bg-card">
            <DialogHeader>
              <DialogTitle className="text-gold font-display">Add New Deal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                placeholder="Client name *"
                value={newDeal.client_name}
                onChange={(e) => setNewDeal({ ...newDeal, client_name: e.target.value })}
                required
              />
              <Input
                placeholder="Property address"
                value={newDeal.property_address}
                onChange={(e) => setNewDeal({ ...newDeal, property_address: e.target.value })}
              />
              <Input
                type="number"
                placeholder="Deal value ($)"
                value={newDeal.deal_value}
                onChange={(e) => setNewDeal({ ...newDeal, deal_value: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={newDeal.stage} onValueChange={(v) => setNewDeal({ ...newDeal, stage: v as DealStage })}>
                  <SelectTrigger><SelectValue placeholder="Stage" /></SelectTrigger>
                  <SelectContent>
                    {stageOrder.map(s => (
                      <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="Commission %"
                  value={newDeal.commission_rate}
                  onChange={(e) => setNewDeal({ ...newDeal, commission_rate: e.target.value })}
                />
              </div>
              <Input
                placeholder="Notes"
                value={newDeal.notes}
                onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
              />
              <Button type="submit" className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
                Add Deal
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 overflow-x-auto">
        {stageOrder.map((stage) => (
          <Card key={stage} className="border-gold/10 bg-card/50 min-w-[200px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize flex items-center justify-between">
                <span>{stage.replace('_', ' ')}</span>
                <Badge variant="outline" className="border-gold/30 text-gold">
                  {dealsByStage[stage].length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dealsByStage[stage].map((deal) => (
                <div 
                  key={deal.id} 
                  className="p-3 rounded-lg bg-background/50 border border-gold/10 hover:border-gold/30 transition-colors"
                >
                  <p className="font-medium text-foreground text-sm truncate">{deal.client_name}</p>
                  {deal.property_address && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <Building2 className="h-3 w-3" /> {deal.property_address}
                    </p>
                  )}
                  {deal.deal_value && (
                    <p className="text-xs text-gold flex items-center gap-1 mt-1">
                      <DollarSign className="h-3 w-3" /> {deal.deal_value.toLocaleString()}
                    </p>
                  )}
                  <Select value={deal.stage} onValueChange={(v) => updateStage(deal.id, v as DealStage)}>
                    <SelectTrigger className="mt-2 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stageOrder.map(s => (
                        <SelectItem key={s} value={s} className="text-xs">{s.replace('_', ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {dealsByStage[stage].length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No deals</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Pipeline;
