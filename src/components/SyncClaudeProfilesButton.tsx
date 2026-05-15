import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const SyncClaudeProfilesButton = () => {
  const [loading, setLoading] = useState(false);

  const handleSync = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-claude-profiles', { body: {} });
      if (error) throw error;
      const synced = data?.synced ?? 0;
      const total = data?.total ?? 0;
      const errs = data?.errors?.length ?? 0;
      toast.success(`Synced ${synced}/${total} agent profiles${errs ? ` (${errs} errors)` : ''}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to sync profiles');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSync} disabled={loading} variant="outline" className="border-gold/40 text-gold hover:bg-gold/10">
      {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
      Sync Claude Profiles
    </Button>
  );
};

export default SyncClaudeProfilesButton;