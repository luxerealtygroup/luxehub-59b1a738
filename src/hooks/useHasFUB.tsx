import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useHasFUB() {
  const { user } = useAuth();
  const [hasFUB, setHasFUB] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHasFUB(null);
      setLoading(false);
      return;
    }

    const check = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('fub_user_id')
        .eq('id', user.id)
        .maybeSingle();

      setHasFUB(!!data?.fub_user_id);
      setLoading(false);
    };

    check();
  }, [user]);

  return { hasFUB: hasFUB ?? false, loading };
}
