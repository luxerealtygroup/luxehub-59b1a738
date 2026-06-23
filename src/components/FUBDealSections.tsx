import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { useUserRole } from '@/hooks/useUserRole';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { inferDealSide, isActiveListingDeal } from '@/hooks/useFubDealMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RefreshCw, Home, Clock, Sparkles, ExternalLink, Loader2, AlertTriangle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import { formatCurrency } from '@/lib/utils';

interface AgentOption {
  id: string;
  full_name: string;
  fub_user_id: number | null;
}

/**
 * Heuristic: a deal name that has no digits (no street number / unit) and no
 * structured property address is probably missing its address in FUB.
 * e.g. "Esther" → flagged; "78 Esther Ave" → not flagged.
 */
const hasIncompleteAddress = (deal: FUBDeal): boolean => {
  const hasStructured = Boolean(deal.propertyStreet || deal.propertyCity);
  if (hasStructured) return false;
  const name = (deal.name || '').trim();
  if (!name) return true;
  return !/\d/.test(name);
};

const classifyDealSection = (deal: FUBDeal): 'active_listing' | 'coming_soon' | 'buyer_under_contract' | 'other' => {
  const pipeline = (deal.pipelineName || '').toLowerCase();
  const stage = (deal.stageName || '').toLowerCase();

  const isSeller = pipeline.includes('seller') || pipeline.includes('listing');
  const isBuyer = pipeline.includes('buyer');

  // Use shared active listing logic (handles offer stage with side check)
  if (isActiveListingDeal(deal)) return 'active_listing';

  if (isSeller && (stage.includes('coming soon') || stage.includes('pre-market') || stage.includes('pre-mls'))) return 'coming_soon';
  if (isBuyer && (stage.includes('pending') || stage.includes('under contract') || stage.includes('conditional'))) return 'buyer_under_contract';

  // Buyer-side offers go to buyer_under_contract
  if (stage.includes('offer') && (isBuyer || inferDealSide(deal) === 'buyer')) return 'buyer_under_contract';

  return 'other';
};

const DealTable = ({ deals, emptyMessage }: { deals: FUBDeal[]; emptyMessage: string }) => {
  if (deals.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Property / Deal</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead>Expected Close</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deals.map((deal) => {
            const address = [deal.propertyStreet, deal.propertyCity, deal.propertyState]
              .filter(Boolean)
              .join(', ');
            const displayName = address || deal.name || 'Unnamed Deal';
            const clientName = deal.people?.[0]?.name || '—';
            const agentName = deal.users?.[0]?.name || '—';
            const incomplete = hasIncompleteAddress(deal);

            return (
              <TableRow key={deal.id}>
                <TableCell className="font-medium max-w-[220px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{displayName}</span>
                    {incomplete && (
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle
                              className="h-3.5 w-3.5 text-amber-400 flex-shrink-0"
                              aria-label="Incomplete address"
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            This deal's name in Follow Up Boss appears to be missing a street
                            number / full address. Update the deal name in FUB for a clearer
                            label here.
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </TableCell>
                <TableCell>{clientName}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{agentName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {deal.stageName}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{deal.price ? formatCurrency(deal.price) : '—'}</TableCell>
                <TableCell>
                  {deal.projectedCloseDate
                    ? format(parseISO(deal.projectedCloseDate), 'MMM d, yyyy')
                    : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export const FUBDealSections = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { isViewingAsAgent, effectiveFubUserId, agentOptions } = useViewAsAgent();
  const [allDeals, setAllDeals] = useState<FUBDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminFilterAgentId, setAdminFilterAgentId] = useState<string>('all');

  const fetchDeals = async () => {
    setLoading(true);
    try {
      const response = await followUpBossApi.getDeals(200, 0);
      if (response.success && response.data?.deals) {
        setAllDeals(response.data.deals);
      }
    } catch (err) {
      console.error('Error fetching FUB deals for pipeline sections:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeals();
  }, []);

  // Determine scoped deals based on user role and view mode
  const getScopedDeals = (): FUBDeal[] => {
    // Admin viewing as specific agent
    if (isViewingAsAgent && effectiveFubUserId) {
      return allDeals.filter(d => d.users?.some(u => u.id === effectiveFubUserId));
    }

    // Admin in company view with agent filter
    if (isAdmin && !isViewingAsAgent) {
      if (adminFilterAgentId === 'all') return allDeals;
      const selectedAgent = (agentOptions as AgentOption[]).find(a => a.id === adminFilterAgentId);
      if (selectedAgent?.fub_user_id) {
        return allDeals.filter(d => d.users?.some(u => u.id === selectedAgent.fub_user_id));
      }
      return allDeals;
    }

    // Regular agent: filter by their own fub_user_id
    // We need to get the user's fub_user_id - fetch it
    return allDeals; // Will be filtered in useEffect below
  };

  // For non-admin agents, we need their fub_user_id
  const [userFubId, setUserFubId] = useState<number | null>(null);
  useEffect(() => {
    if (!isAdmin && user) {
      supabase
        .from('profiles')
        .select('fub_user_id')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => setUserFubId(data?.fub_user_id || null));
    }
  }, [isAdmin, user]);

  const scopedDeals = (() => {
    if (isViewingAsAgent && effectiveFubUserId) {
      return allDeals.filter(d => d.users?.some(u => u.id === effectiveFubUserId));
    }
    if (isAdmin && !isViewingAsAgent) {
      if (adminFilterAgentId === 'all') return allDeals;
      const selectedAgent = (agentOptions as AgentOption[]).find(a => a.id === adminFilterAgentId);
      if (selectedAgent?.fub_user_id) {
        return allDeals.filter(d => d.users?.some(u => u.id === selectedAgent.fub_user_id));
      }
      return allDeals;
    }
    // Regular agent
    if (userFubId) {
      return allDeals.filter(d => d.users?.some(u => u.id === userFubId));
    }
    return [];
  })();

  const activeListings = scopedDeals.filter(d => classifyDealSection(d) === 'active_listing');
  const comingSoon = scopedDeals.filter(d => classifyDealSection(d) === 'coming_soon');
  const buyersUnderContract = scopedDeals.filter(d => classifyDealSection(d) === 'buyer_under_contract');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground text-sm">Loading FUB deals...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Admin agent filter (only in company view, not "view as agent") */}
      {isAdmin && !isViewingAsAgent && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Filter by Agent:</span>
          <Select value={adminFilterAgentId} onValueChange={setAdminFilterAgentId}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="All Agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {(agentOptions as AgentOption[]).filter(a => a.fub_user_id).map(a => (
                <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={fetchDeals} className="h-8">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
          </Button>
        </div>
      )}

      {/* Active Listings */}
      <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Home className="h-4 w-4 text-green-400" />
              Active Listings
              <Badge variant="secondary" className="ml-1 text-xs">{activeListings.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <DealTable deals={activeListings} emptyMessage="No active listings" />
        </CardContent>
      </Card>

      {/* Coming Soon */}
      <Card className="border-purple-500/20 bg-gradient-to-br from-card to-purple-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              Coming Soon
              <Badge variant="secondary" className="ml-1 text-xs">{comingSoon.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <DealTable deals={comingSoon} emptyMessage="No coming soon listings" />
        </CardContent>
      </Card>

      {/* Buyers Under Contract */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-card to-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-display flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-400" />
              Buyers Under Contract
              <Badge variant="secondary" className="ml-1 text-xs">{buyersUnderContract.length}</Badge>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <DealTable deals={buyersUnderContract} emptyMessage="No buyers under contract" />
        </CardContent>
      </Card>
    </div>
  );
};
