import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Phone, DollarSign, Target, Users, Search, Loader2, Plus, UserPlus } from 'lucide-react';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { followUpBossApi, FUBPerson } from '@/lib/api/followUpBoss';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

interface Stats {
  totalDeals: number;
  activeDeals: number;
  totalCommissions: number;
  pendingCommissions: number;
  activitiesThisWeek: number;
  goalsProgress: number;
}

const stageDefinitions: Record<number, { description: string }> = {
  10: { description: 'Next 30 days' },
  9: { description: 'Next 60 days' },
  8: { description: 'Next 90 days' },
  7: { description: 'Next 120 days' },
  6: { description: 'Next 6 months' },
  5: { description: 'Next 9 months' },
  4: { description: 'Next 12 months' },
  3: { description: '12-18 months' },
  2: { description: '18-24 months' },
  1: { description: '24+ months' },
};

const stageOrder = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats>({
    totalDeals: 0,
    activeDeals: 0,
    totalCommissions: 0,
    pendingCommissions: 0,
    activitiesThisWeek: 0,
    goalsProgress: 0
  });
  const [loading, setLoading] = useState(true);
  const [fubClients, setFubClients] = useState<FUBPerson[]>([]);
  const [fubLoading, setFubLoading] = useState(false);
  const [fubError, setFubError] = useState<string | null>(null);
  
  // Add client dialog state
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncToFUB, setSyncToFUB] = useState(true);
  const [newClient, setNewClient] = useState({
    client_name: '',
    email: '',
    phone: '',
    stage: '5',
    notes: '',
    property_interest: '',
    source: ''
  });

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      const [dealsRes, commissionsRes, activitiesRes, goalsRes] = await Promise.all([
        supabase.from('deals').select('*').eq('user_id', user.id),
        supabase.from('commissions').select('*').eq('user_id', user.id),
        supabase.from('agent_activities').select('*').eq('user_id', user.id),
        supabase.from('agent_goals').select('*').eq('user_id', user.id)
      ]);

      const deals = dealsRes.data || [];
      const commissions = commissionsRes.data || [];
      const goals = goalsRes.data || [];

      const activeStages = ['lead', 'contacted', 'showing', 'offer', 'under_contract'];
      const activeDeals = deals.filter(d => activeStages.includes(d.stage));
      
      const totalCommissions = commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + Number(c.amount), 0);
      
      const pendingCommissions = commissions
        .filter(c => c.status === 'pending')
        .reduce((sum, c) => sum + Number(c.amount), 0);

      const avgGoalProgress = goals.length > 0
        ? goals.reduce((sum, g) => sum + (Number(g.current_value) / Number(g.target_value) * 100), 0) / goals.length
        : 0;

      setStats({
        totalDeals: deals.length,
        activeDeals: activeDeals.length,
        totalCommissions,
        pendingCommissions,
        activitiesThisWeek: (activitiesRes.data || []).length,
        goalsProgress: Math.round(avgGoalProgress)
      });
      setLoading(false);
    };

    const fetchFUBClients = async () => {
      setFubLoading(true);
      setFubError(null);
      try {
        const response = await followUpBossApi.getPeople(10);
        if (response.success && response.data?.people) {
          setFubClients(response.data.people);
        } else {
          setFubError(response.error || 'Could not load Follow Up Boss clients');
        }
      } catch (error) {
        console.error('FUB error:', error);
        setFubError('Failed to connect to Follow Up Boss');
      } finally {
        setFubLoading(false);
      }
    };

    fetchStats();
    fetchFUBClients();
  }, [user]);

  const syncClientToFUB = async (clientData: typeof newClient) => {
    try {
      const nameParts = clientData.client_name.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      const stageNum = parseInt(clientData.stage);
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
            tags: [stageTag, timelineTag, 'pipeline_client'],
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

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setSubmitting(true);

    const { error } = await supabase.from('pipeline_clients').insert({
      user_id: user.id,
      client_name: newClient.client_name,
      email: newClient.email || null,
      phone: newClient.phone || null,
      stage: parseInt(newClient.stage),
      notes: newClient.notes || null,
      property_interest: newClient.property_interest || null,
      source: newClient.source || null
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
        });
      }
    } else {
      toast({ title: 'Client added to pipeline!' });
    }
    
    setAddClientOpen(false);
    setNewClient({ client_name: '', email: '', phone: '', stage: '5', notes: '', property_interest: '', source: '' });
    setSyncToFUB(true);
    setSubmitting(false);
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

  const statCards = [
    { title: 'Active Deals', value: stats.activeDeals, icon: Building2, subtitle: `${stats.totalDeals} total` },
    { title: 'Activities', value: stats.activitiesThisWeek, icon: Phone, subtitle: 'This week' },
    { title: 'Earned Commissions', value: `$${stats.totalCommissions.toLocaleString()}`, icon: DollarSign, subtitle: `$${stats.pendingCommissions.toLocaleString()} pending` },
    { title: 'Goals Progress', value: `${stats.goalsProgress}%`, icon: Target, subtitle: 'Average completion' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gold animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">Here's your real estate performance overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="border-gold/10 bg-card/50 backdrop-blur hover:border-gold/30 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-5 w-5 text-gold" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader>
            <CardTitle className="text-gold font-display">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            <a href="/dashboard/activities" className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center">
              <Phone className="h-6 w-6 mx-auto text-gold mb-2" />
              <span className="text-sm text-foreground">Log Activity</span>
            </a>
            <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
              <DialogTrigger asChild>
                <button className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center w-full">
                  <UserPlus className="h-6 w-6 mx-auto text-gold mb-2" />
                  <span className="text-sm text-foreground">Add Client</span>
                </button>
              </DialogTrigger>
              <DialogContent className="border-primary/20 bg-card max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-primary font-display">Add Client to Pipeline</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddClient} className="space-y-4">
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
                    <Label>Buying Timeline Stage</Label>
                    <Select value={newClient.stage} onValueChange={(v) => setNewClient({ ...newClient, stage: v })}>
                      <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                      <SelectContent>
                        {stageOrder.map(s => (
                          <SelectItem key={s} value={s.toString()}>
                            Stage {s} - {stageDefinitions[s].description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="sync-fub-dashboard" 
                      checked={syncToFUB} 
                      onCheckedChange={(checked) => setSyncToFUB(checked === true)}
                    />
                    <Label htmlFor="sync-fub-dashboard" className="text-sm text-muted-foreground cursor-pointer">
                      Also add to Follow Up Boss
                    </Label>
                  </div>
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
                      'Add Client'
                    )}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card className="border-gold/10 bg-card/50">
          <CardHeader>
            <CardTitle className="text-gold font-display">Performance Tip</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Agents who log their activities daily close 40% more deals. Keep tracking your calls and appointments to stay on top of your pipeline!
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Follow Up Boss Section */}
      <Card className="border-gold/10 bg-card/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-gold" />
            <CardTitle className="text-gold font-display">Follow Up Boss Clients</CardTitle>
          </div>
          <FUBClientSearch 
            onSelectClient={(client) => console.log('Selected:', client)}
            trigger={
              <Button variant="outline" size="sm" className="border-gold/30 text-gold hover:bg-gold/10">
                <Search className="h-4 w-4 mr-2" /> Search Clients
              </Button>
            }
          />
        </CardHeader>
        <CardContent>
          {fubLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-gold animate-spin" />
              <span className="ml-2 text-muted-foreground">Loading clients...</span>
            </div>
          ) : fubError ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">{fubError}</p>
              <p className="text-xs text-muted-foreground mt-2">Make sure your Follow Up Boss API key is configured</p>
            </div>
          ) : fubClients.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-10 w-10 mx-auto text-gold/30 mb-2" />
              <p className="text-muted-foreground">No clients found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {fubClients.slice(0, 6).map((client) => (
                <div 
                  key={client.id}
                  className="p-3 rounded-lg bg-gold/5 border border-gold/10 hover:border-gold/30 transition-colors"
                >
                  <p className="font-medium text-foreground truncate">
                    {client.name || `${client.firstName} ${client.lastName}`}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground truncate">
                      {client.emails?.[0]?.value || client.phones?.[0]?.value || 'No contact'}
                    </span>
                    {client.stage && (
                      <Badge variant="outline" className="text-xs border-gold/30 text-gold">
                        {client.stage}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
