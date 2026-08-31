import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { followUpBossApi, FUBDeal } from '@/lib/api/followUpBoss';
import { isActiveListingDeal } from '@/hooks/useFubDealMetrics';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Home, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Props {
  /** Max listings to show before the "View all" link. */
  limit?: number;
}

/**
 * Compact, address-first list of the effective agent's active listings (from FUB).
 * Presentation-only: reuses the same scoping/classification rules as the Pipeline page.
 */
export const ActiveListingsCard = ({ limit = 5 }: Props) => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { isViewingAsAgent, effectiveFubUserId } = useViewAsAgent();
  const navigate = useNavigate();
  const [listings, setListings] = useState<FUBDeal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await followUpBossApi.getDeals(200, 0);
        let deals: FUBDeal[] = response.success && response.data?.deals ? response.data.deals : [];

        if (isViewingAsAgent && effectiveFubUserId) {
          deals = deals.filter((d) => d.users?.some((u) => u.id === effectiveFubUserId));
        } else if (!isAdmin && user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('fub_user_id')
            .eq('id', user.id)
            .maybeSingle();
          const fid = profile?.fub_user_id;
          deals = fid ? deals.filter((d) => d.users?.some((u) => u.id === fid)) : [];
        }

        if (!cancelled) setListings(deals.filter(isActiveListingDeal));
      } catch (err) {
        console.error('Error loading active listings:', err);
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, isAdmin, isViewingAsAgent, effectiveFubUserId]);

  const visible = listings.slice(0, limit);

  return (
    <Card className="border-green-500/20 bg-gradient-to-br from-card to-green-500/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <Home className="h-4 w-4 text-green-400" />
          Active Listings
          <Badge variant="secondary" className="ml-1 text-xs">{listings.length}</Badge>
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => navigate('/dashboard/pipeline')}
        >
          View all
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading listings...
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3">No active listings right now.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((deal) => {
              const address =
                [deal.propertyStreet, deal.propertyCity, deal.propertyState].filter(Boolean).join(', ') ||
                deal.name ||
                'Address TBD';
              return (
                <li key={deal.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{address}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {deal.people?.[0]?.name || '—'}
                      {deal.stageName ? ` · ${deal.stageName}` : ''}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {deal.price ? formatCurrency(deal.price) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && listings.length > visible.length && (
          <p className="text-xs text-muted-foreground pt-2">
            +{listings.length - visible.length} more in Pipeline
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ActiveListingsCard;
