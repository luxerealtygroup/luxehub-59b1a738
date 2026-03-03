import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useHasFUB } from '@/hooks/useHasFUB';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, TrendingUp, Clock, CheckCircle, RefreshCw } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { formatCurrency } from '@/lib/utils';
import { ManualModeBadge } from '@/components/ManualModeBadge';

interface FUBDealDisplay {
  id: number;
  clientName: string;
  propertyAddress: string;
  stageName: string;
  dealValue: number;
  grossCommission: number;
  createdAt: string;
  status: string;
  source: string;
}

const Commissions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { hasFUB } = useHasFUB();
  const { isViewingAsAgent, effectiveFubUserId } = useViewAsAgent();
  const [fubDeals, setFUBDeals] = useState<FUBDeal[]>([]);
  const [fubDealsDisplay, setFUBDealsDisplay] = useState<FUBDealDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [fubLoading, setFubLoading] = useState(false);

  // Fetch FUB deals – scoped to effective agent when in agent view
  useEffect(() => {
    const fetchFUBDeals = async () => {
      if (!hasFUB) { setLoading(false); return; }
      setFubLoading(true);
      try {
        const response = await followUpBossApi.getDeals(200, 0);
        if (response.success && response.data?.deals) {
          let deals = response.data.deals;

          // If viewing as a specific agent, filter by their fub_user_id
          if (isViewingAsAgent && effectiveFubUserId) {
            deals = deals.filter(d => d.users?.some(u => u.id === effectiveFubUserId));
          } else if (!isAdmin) {
            // Non-admin agent: get their own fub_user_id from profile
            const { data: profile } = await supabase
              .from('profiles')
              .select('fub_user_id')
              .eq('id', user?.id)
              .maybeSingle();
            if (profile?.fub_user_id) {
              deals = deals.filter(d => d.users?.some(u => u.id === profile.fub_user_id));
            }
          }

          setFUBDeals(deals);
        }
      } catch (error) {
        console.error('Error fetching FUB deals:', error);
      } finally {
        setFubLoading(false);
        setLoading(false);
      }
    };

    fetchFUBDeals();
  }, [hasFUB, isAdmin, isViewingAsAgent, effectiveFubUserId, user]);

  useEffect(() => {
    const displayDeals = fubDeals
      .filter((deal) => deal.agentCommission)
      .map((deal) => ({
        id: deal.id,
        clientName: deal.people?.[0]?.name || deal.name || 'Unknown Client',
        propertyAddress: [deal.propertyStreet, deal.propertyCity, deal.propertyState]
          .filter(Boolean)
          .join(', ') || 'Address TBD',
        stageName: deal.stageName || 'Unknown Stage',
        dealValue: deal.price || 0,
        grossCommission: deal.agentCommission || 0,
        createdAt: deal.createdAt || '',
        status: deal.stageName || 'Unknown',
        source: 'fub',
      }));

    setFUBDealsDisplay(displayDeals);
  }, [fubDeals]);

  const refreshFUBDeals = async () => {
    if (!hasFUB) return;
    setFubLoading(true);
    try {
      const response = await followUpBossApi.getDeals(200, 0);
      if (response.success && response.data?.deals) {
        let deals = response.data.deals;

        if (isViewingAsAgent && effectiveFubUserId) {
          deals = deals.filter(d => d.users?.some(u => u.id === effectiveFubUserId));
        } else if (!isAdmin) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('fub_user_id')
            .eq('id', user?.id)
            .maybeSingle();
          if (profile?.fub_user_id) {
            deals = deals.filter(d => d.users?.some(u => u.id === profile.fub_user_id));
          }
        }

        setFUBDeals(deals);
      }
    } catch (error) {
      console.error('Error fetching FUB deals:', error);
    } finally {
      setFubLoading(false);
    }
  };

  // Helper to classify FUB stage names
  const classifyStage = (status: string): 'closed' | 'pending' | 'conditional' | 'other' => {
    const s = status.toLowerCase();
    if (s.includes('closed') || s.includes('won') || s.includes('sold')) return 'closed';
    if (s.includes('pending') || s.includes('under contract')) return 'pending';
    if (s.includes('offer') || s.includes('conditional')) return 'conditional';
    return 'other';
  };

  // All GCI metrics derived from the same fubDealsDisplay shown in the table
  const totalClosed = fubDealsDisplay
    .filter((deal) => classifyStage(deal.status) === 'closed')
    .reduce((sum, deal) => sum + deal.grossCommission, 0);

  const totalPending = fubDealsDisplay
    .filter((deal) => classifyStage(deal.status) === 'pending')
    .reduce((sum, deal) => sum + deal.grossCommission, 0);

  const totalConditional = fubDealsDisplay
    .filter((deal) => classifyStage(deal.status) === 'conditional')
    .reduce((sum, deal) => sum + deal.grossCommission, 0);

  const now = new Date();
  const thisMonth = fubDealsDisplay
    .filter((deal) => {
      if (classifyStage(deal.status) !== 'closed') return false;
      if (!deal.createdAt) return false;
      const d = parseISO(deal.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, deal) => sum + deal.grossCommission, 0);

  return (
    <div className="container py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold text-foreground">{isViewingAsAgent ? 'Agent Transactions' : 'Commissions'}</h1>
          {!hasFUB && <ManualModeBadge />}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Closed (GCI)</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-400" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-400">{formatCurrency(totalClosed)}</div></CardContent>
        </Card>
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending (GCI)</CardTitle>
            <Clock className="h-5 w-5 text-amber-400" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-amber-400">{formatCurrency(totalPending)}</div></CardContent>
        </Card>
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conditional (GCI)</CardTitle>
            <Clock className="h-5 w-5 text-orange-400" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-orange-400">{formatCurrency(totalConditional)}</div></CardContent>
        </Card>
        <Card className="border-gold/10 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
            <TrendingUp className="h-5 w-5 text-gold" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-gold">{formatCurrency(thisMonth)}</div></CardContent>
        </Card>
      </div>

      {/* FUB Transactions */}
      <Card className="border-gold/10 bg-card/50 mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-gold font-display">My Transactions</CardTitle>
          <Button variant="outline" size="sm" onClick={refreshFUBDeals} className="border-gold/30 text-gold hover:bg-gold/10">
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">GCI</TableHead>
                  <TableHead>Closing Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fubDealsDisplay.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {fubLoading ? 'Loading deals...' : 'No deals found. Add deals in Follow Up Boss to see them here.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  fubDealsDisplay.map((deal) => (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">{deal.clientName}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{deal.propertyAddress}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          classifyStage(deal.status) === 'closed'
                            ? 'border-green-500/30 text-green-400'
                            : classifyStage(deal.status) === 'pending'
                            ? 'border-amber-500/30 text-amber-400'
                            : 'border-orange-500/30 text-orange-400'
                        }>
                          {deal.stageName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(deal.dealValue)}</TableCell>
                      <TableCell className="text-right font-bold text-gold">{formatCurrency(deal.grossCommission)}</TableCell>
                      <TableCell>
                        {deal.createdAt ? format(parseISO(deal.createdAt), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Commissions;
