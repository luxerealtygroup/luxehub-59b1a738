import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Building2, DollarSign, Users, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

type DealStage = 'lead' | 'contacted' | 'showing' | 'offer' | 'under_contract' | 'closed' | 'lost';

interface Deal {
  id: string;
  client_name: string;
  property_address: string | null;
  deal_value: number | null;
  stage: DealStage;
  expected_close_date: string | null;
  commission_rate: number | null;
  company_split_percentage: number | null;
  notes: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
}

interface DealParticipant {
  id: string;
  deal_id: string;
  user_id: string;
  role: string;
  split_percentage: number | null;
  profiles?: Profile;
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
  const [teamMembers, setTeamMembers] = useState<Profile[]>([]);
  const [participants, setParticipants] = useState<Record<string, DealParticipant[]>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  
  const [newDeal, setNewDeal] = useState({
    client_name: '',
    property_address: '',
    deal_value: '',
    stage: 'lead' as DealStage,
    commission_rate: '3',
    company_split_percentage: '30',
    notes: ''
  });

  const [newParticipant, setNewParticipant] = useState({
    user_id: '',
    role: 'co_agent',
    split_percentage: '50'
  });

  const fetchDeals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setDeals((data as Deal[]) || []);
    
    // Fetch participants for all deals
    if (data && data.length > 0) {
      const dealIds = data.map(d => d.id);
      const { data: participantsData } = await supabase
        .from('deal_participants')
        .select('*')
        .in('deal_id', dealIds);
      
      const participantsByDeal: Record<string, DealParticipant[]> = {};
      participantsData?.forEach(p => {
        if (!participantsByDeal[p.deal_id]) participantsByDeal[p.deal_id] = [];
        participantsByDeal[p.deal_id].push(p);
      });
      setParticipants(participantsByDeal);
    }
    setLoading(false);
  };

  const fetchTeamMembers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name');
    setTeamMembers((data as Profile[]) || []);
  };

  useEffect(() => {
    fetchDeals();
    fetchTeamMembers();
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
      company_split_percentage: parseFloat(newDeal.company_split_percentage),
      notes: newDeal.notes || null
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Deal added to pipeline!' });
      setDialogOpen(false);
      setNewDeal({ client_name: '', property_address: '', deal_value: '', stage: 'lead', commission_rate: '3', company_split_percentage: '30', notes: '' });
      fetchDeals();
    }
  };

  const handleAddParticipant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeal || !newParticipant.user_id) return;

    const { error } = await supabase.from('deal_participants').insert({
      deal_id: selectedDeal.id,
      user_id: newParticipant.user_id,
      role: newParticipant.role,
      split_percentage: newParticipant.role === 'co_agent' ? parseFloat(newParticipant.split_percentage) : 0
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: `${newParticipant.role === 'co_agent' ? 'Co-agent' : 'Referral'} added!` });
      setParticipantDialogOpen(false);
      setNewParticipant({ user_id: '', role: 'co_agent', split_percentage: '50' });
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

  const openParticipantDialog = (deal: Deal) => {
    setSelectedDeal(deal);
    setParticipantDialogOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-primary animate-pulse">Loading pipeline...</div>;
  }

  const dealsByStage = stageOrder.reduce((acc, stage) => {
    acc[stage] = deals.filter(d => d.stage === stage);
    return acc;
  }, {} as Record<DealStage, Deal[]>);

  const totalPipelineValue = deals
    .filter(d => !['closed', 'lost'].includes(d.stage))
    .reduce((sum, d) => sum + (d.deal_value || 0), 0);

  const getParticipantNames = (dealId: string) => {
    const dealParticipants = participants[dealId] || [];
    return dealParticipants.map(p => {
      const member = teamMembers.find(m => m.id === p.user_id);
      return { name: member?.full_name || 'Unknown', role: p.role, split: p.split_percentage };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Pipeline</h1>
          <p className="text-muted-foreground mt-1">
            Total pipeline value: <span className="text-primary font-semibold">${totalPipelineValue.toLocaleString()}</span>
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4 mr-2" /> Add Deal
            </Button>
          </DialogTrigger>
          <DialogContent className="border-primary/20 bg-card">
            <DialogHeader>
              <DialogTitle className="text-primary font-display">Add New Deal</DialogTitle>
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
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Company Split %</Label>
                <Input
                  type="number"
                  step="1"
                  placeholder="Company split %"
                  value={newDeal.company_split_percentage}
                  onChange={(e) => setNewDeal({ ...newDeal, company_split_percentage: e.target.value })}
                />
              </div>
              <Input
                placeholder="Notes"
                value={newDeal.notes}
                onChange={(e) => setNewDeal({ ...newDeal, notes: e.target.value })}
              />
              <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                Add Deal
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Participant Dialog */}
      <Dialog open={participantDialogOpen} onOpenChange={setParticipantDialogOpen}>
        <DialogContent className="border-primary/20 bg-card">
          <DialogHeader>
            <DialogTitle className="text-primary font-display">
              Add Team Member to Deal
            </DialogTitle>
          </DialogHeader>
          {selectedDeal && (
            <div className="mb-4 p-3 bg-muted rounded-lg">
              <p className="font-medium">{selectedDeal.client_name}</p>
              <p className="text-sm text-muted-foreground">{selectedDeal.property_address}</p>
            </div>
          )}
          <form onSubmit={handleAddParticipant} className="space-y-4">
            <div className="space-y-2">
              <Label>Team Member</Label>
              <Select value={newParticipant.user_id} onValueChange={(v) => setNewParticipant({ ...newParticipant, user_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
                <SelectContent>
                  {teamMembers.filter(m => m.id !== user?.id).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || 'Unnamed Agent'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newParticipant.role} onValueChange={(v) => setNewParticipant({ ...newParticipant, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="co_agent">Co-Listing Agent (splits commission)</SelectItem>
                  <SelectItem value="referral">Referral Credit (no split)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {newParticipant.role === 'co_agent' && (
              <div className="space-y-2">
                <Label>Their Split of Agent Commission %</Label>
                <Input
                  type="number"
                  value={newParticipant.split_percentage}
                  onChange={(e) => setNewParticipant({ ...newParticipant, split_percentage: e.target.value })}
                />
              </div>
            )}
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Add to Deal
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 overflow-x-auto">
        {stageOrder.map((stage) => (
          <Card key={stage} className="border-primary/10 bg-card/50 min-w-[200px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium capitalize flex items-center justify-between">
                <span>{stage.replace('_', ' ')}</span>
                <Badge variant="outline" className="border-primary/30 text-primary">
                  {dealsByStage[stage].length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dealsByStage[stage].map((deal) => {
                const dealParticipants = getParticipantNames(deal.id);
                return (
                  <div 
                    key={deal.id} 
                    className="p-3 rounded-lg bg-background/50 border border-primary/10 hover:border-primary/30 transition-colors"
                  >
                    <p className="font-medium text-foreground text-sm truncate">{deal.client_name}</p>
                    {deal.property_address && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Building2 className="h-3 w-3" /> {deal.property_address}
                      </p>
                    )}
                    {deal.deal_value && (
                      <p className="text-xs text-primary flex items-center gap-1 mt-1">
                        <DollarSign className="h-3 w-3" /> {deal.deal_value.toLocaleString()}
                      </p>
                    )}
                    {deal.company_split_percentage && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Company: {deal.company_split_percentage}%
                      </p>
                    )}
                    {dealParticipants.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {dealParticipants.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs mr-1">
                            {p.name} ({p.role === 'co_agent' ? `${p.split}%` : 'ref'})
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Select value={deal.stage} onValueChange={(v) => updateStage(deal.id, v as DealStage)}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stageOrder.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">{s.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        size="icon" 
                        variant="outline" 
                        className="h-7 w-7" 
                        onClick={() => openParticipantDialog(deal)}
                      >
                        <UserPlus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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