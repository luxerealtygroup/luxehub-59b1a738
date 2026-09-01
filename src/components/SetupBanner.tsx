import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AlertCircle } from 'lucide-react';

/**
 * Owner-only nudge shown when this instance has no integrations connected yet.
 * Agents and clients never render this: the role check gates the request too,
 * and the endpoint itself is owner-only.
 */
export const SetupBanner = () => {
  const { isOwner, isLoading } = useUserRole();
  const location = useLocation();
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke('instance-setup', {
        body: { action: 'summary' },
      });
      if (cancelled || error) return;
      const list = (data?.integrations ?? []) as { configured: boolean }[];
      setNeedsSetup(list.length > 0 && list.every((i) => !i.configured));
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  if (isLoading || !isOwner || !needsSetup) return null;
  if (location.pathname.startsWith('/dashboard/setup')) return null;

  return (
    <div className="border-b border-gold/30 bg-gold/10 px-4 py-2 text-center">
      <span className="text-xs font-medium text-foreground">
        <AlertCircle className="h-3 w-3 inline mr-1.5 -mt-0.5 text-gold" />
        Finish setting up your hub — connect Follow Up Boss and Slack.{' '}
        <Link to="/dashboard/setup" className="underline font-semibold text-gold">
          Open setup
        </Link>
      </span>
    </div>
  );
};

export default SetupBanner;
