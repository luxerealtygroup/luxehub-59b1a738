import { Navigate } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';

interface RoleGuardProps {
  children: React.ReactNode;
  /** Roles that are ALLOWED to access this route */
  allowedRoles?: ('owner' | 'admin' | 'agent')[];
  /** If true, planning_access users are blocked (default: true) */
  blockPlanning?: boolean;
}

/**
 * Route-level guard that blocks planning_access users from restricted pages.
 * Must be used inside ProtectedRoute (user is already authenticated).
 */
const RoleGuard = ({ children, allowedRoles, blockPlanning = true }: RoleGuardProps) => {
  const { isOwner, isAdmin, isAgent, isPlanningAccess, isLoading } = useUserRole();

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-gold animate-pulse">Loading...</div>
      </div>
    );
  }

  const isPlanningOnly = isPlanningAccess && !isAgent && !isAdmin && !isOwner;

  // Block planning-only users from restricted routes
  if (blockPlanning && isPlanningOnly) {
    return <Navigate to="/dashboard" replace />;
  }

  // If specific roles are required, check them
  if (allowedRoles) {
    const hasAllowed =
      (allowedRoles.includes('owner') && isOwner) ||
      (allowedRoles.includes('admin') && isAdmin) ||
      (allowedRoles.includes('agent') && isAgent);

    if (!hasAllowed) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};

export default RoleGuard;
