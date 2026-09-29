import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/** Whether the signed-in person may use Script Boss (agents, owners/admins, or trainee flag). */
export function useScriptBossAccess() {
  const { user } = useAuth();
  const [state, setState] = useState<{ loading: boolean; allowed: boolean }>({ loading: true, allowed: false });

  useEffect(() => {
    let cancelled = false;
    if (!user) { setState({ loading: false, allowed: false }); return; }
    setState(s => ({ ...s, loading: true }));
    supabase.rpc('can_use_script_boss' as never, { _uid: user.id } as never).then(({ data }) => {
      if (!cancelled) setState({ loading: false, allowed: Boolean(data) });
    });
    return () => { cancelled = true; };
  }, [user]);

  return state;
}
