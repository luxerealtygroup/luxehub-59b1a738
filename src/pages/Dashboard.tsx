import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Phone, DollarSign, Target, Users, Search, Loader2 } from 'lucide-react';
import { FUBClientSearch } from '@/components/FUBClientSearch';
import { followUpBossApi, FUBPerson } from '@/lib/api/followUpBoss';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Stats {
  totalDeals: number;
  activeDeals: number;
  totalCommissions: number;
  pendingCommissions: number;
  activitiesThisWeek: number;
  goalsProgress: number;
}

const Dashboard = () => {
  const { user } = useAuth();
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
            <a href="/dashboard/pipeline" className="p-4 rounded-lg bg-gold/10 hover:bg-gold/20 transition-colors text-center">
              <Building2 className="h-6 w-6 mx-auto text-gold mb-2" />
              <span className="text-sm text-foreground">Add Deal</span>
            </a>
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
