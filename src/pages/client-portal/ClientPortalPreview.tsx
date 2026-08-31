import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { PortalPreviewProvider } from '@/hooks/usePortalPreview';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Eye, X, Loader2 } from 'lucide-react';
import ClientDashboard from './ClientDashboard';

/**
 * Read-only "Preview as client" wrapper. Renders the real client portal with a
 * given portal's real data. Access: admins/owners, or the portal's assigned
 * agent (client_accounts.invited_by).
 */
export default function ClientPortalPreview() {
  const { portalId } = useParams<{ portalId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [state, setState] = useState<'checking' | 'allowed' | 'denied'>('checking');
  const [clientName, setClientName] = useState<string | null>(null);

  useEffect(() => {
    if (!portalId || !user || roleLoading) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('client_accounts')
        .select('id, full_name, email, invited_by')
        .eq('id', portalId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        setState('denied');
        return;
      }
      const allowed = isAdmin || data.invited_by === user.id;
      setClientName(data.full_name || data.email);
      setState(allowed ? 'allowed' : 'denied');
    })();
    return () => {
      cancelled = true;
    };
  }, [portalId, user, isAdmin, roleLoading]);

  const exit = () => navigate('/dashboard/admin/client-portals');

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading preview…
        <Skeleton className="hidden" />
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Preview unavailable</h1>
        <p className="text-muted-foreground max-w-md">
          You can only preview portals you are assigned to. Ask an admin if you need access.
        </p>
        <Button onClick={exit}>Back to Client Portals</Button>
      </div>
    );
  }

  return (
    <PortalPreviewProvider clientName={clientName}>
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-50 flex items-center justify-center gap-3 border-b border-primary/20 bg-primary/10 px-4 py-1.5 text-center text-sm">
          <Eye className="h-4 w-4 text-primary shrink-0" />
          <span>
            Viewing: <span className="text-primary font-semibold">Client ({clientName || 'Unknown'})</span>
            <span className="text-muted-foreground ml-2">(Read-only)</span>
          </span>
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={exit}>
            <X className="h-3.5 w-3.5" />
            Exit preview
          </Button>
        </div>
        <div className="flex-1">
          <ClientDashboard previewPortalId={portalId!} />
        </div>
      </div>
    </PortalPreviewProvider>
  );
}
