import { Navigate, Link } from 'react-router-dom';
import { useOrgTier } from '@/hooks/useOrgTier';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Lock } from 'lucide-react';

type FeatureKey =
  | 'canAccessCRMConnections'
  | 'canAccessClientPortals'
  | 'canAccessCompanyDashboard'
  | 'canAccessCompanyBusinessPlanning'
  | 'canAccessBranding'
  | 'canAccessNominations';

interface TierGuardProps {
  feature: FeatureKey;
  children: React.ReactNode;
  /** If set, unauthorized users are redirected there. */
  redirectTo?: string;
  /** If true (default when no redirectTo), show an inline upgrade prompt instead of redirecting. */
  featureName?: string;
  requiredTierLabel?: string;
}

export function TierGuard({
  feature,
  children,
  redirectTo,
  featureName = 'this feature',
  requiredTierLabel = 'Pro+ or Team',
}: TierGuardProps) {
  const tier = useOrgTier();
  if (tier.loading) return null;
  if (tier[feature]) return <>{children}</>;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card className="border-gold/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-gold/10 flex items-center justify-center">
              <Lock className="h-5 w-5 text-gold" />
            </div>
            <div>
              <CardTitle className="font-display text-xl">
                Upgrade to unlock {featureName}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Available on the {requiredTierLabel} plan.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your current plan doesn't include {featureName}. Upgrade to get access
            along with everything else on the higher tier.
          </p>
          <Button asChild className="bg-gold hover:bg-gold/90 text-gold-foreground">
            <Link to="/dashboard/upgrade">
              <Sparkles className="h-4 w-4 mr-2" /> View upgrade options
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}