import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PLAN_YEAR, RecapRow } from '@/lib/planning2027';

/** Loads the AI coaching recap; compiles the first draft automatically when `autoCompile`. */
export function useRecap(agentId: string, autoCompile: boolean) {
  const [recap, setRecap] = useState<RecapRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const compile = useCallback(async (force: boolean) => {
    setWorking(true);
    const { data, error } = await supabase.functions.invoke('planning-recap', { body: { agent_id: agentId, force } });
    setWorking(false);
    const msg = (data as any)?.error || error?.message;
    if (msg) { toast.error(typeof msg === 'string' ? msg : 'Could not compile the recap'); return null; }
    setRecap((data as any).recap);
    if (force) toast.success('Coaching recap regenerated');
    return (data as any).recap as RecapRow;
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from('planning_recaps').select('*').eq('agent_id', agentId).eq('plan_year', PLAN_YEAR).maybeSingle();
      if (cancelled) return;
      setRecap((data as RecapRow) ?? null);
      setLoading(false);
      if (!data && autoCompile) await compile(false);
    })();
    return () => { cancelled = true; };
  }, [agentId, autoCompile, compile]);

  return { recap, loading: loading || (working && !recap), working, regenerate: () => compile(true) };
}
