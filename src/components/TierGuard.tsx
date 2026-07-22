import { Navigate } from 'react-router-dom';
import { useOrgTier } from '@/hooks/useOrgTier';

type FeatureKey = 'canAccessCRMConnections' | 'canAccessCompanyDashboard' | 'canAccessBranding';

interface TierGuardProps {
  feature: FeatureKey;
  children: React.ReactNode;
  redirectTo?: string;
}

/**
 * Hides a route behind an organization tier feature flag.
 * While the tier is loading we render nothing to avoid a flash of blocked content.
 */
export function TierGuard({ feature, children, redirectTo = '/dashboard' }: TierGuardProps) {
  const tier = useOrgTier();
  if (tier.loading) return null;
  if (!tier[feature]) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}