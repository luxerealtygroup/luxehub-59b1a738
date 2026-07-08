import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ExternalLink, Loader2, Unlink } from 'lucide-react';

interface Status {
  connected: boolean;
  google_email?: string | null;
  updated_at?: string | null;
}

const REDIRECT_PATH = '/agent/google-drive/callback';

export function GoogleDriveConnect({ onChange }: { onChange?: (connected: boolean) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const loadStatus = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('google-drive-files', {
      body: { action: 'status' },
    });
    if (error) {
      toast({ title: 'Could not load Drive status', description: error.message, variant: 'destructive' });
      setStatus({ connected: false });
    } else {
      const s = data as Status;
      setStatus(s);
      onChange?.(!!s?.connected);
    }
    setLoading(false);
  }, [toast, onChange]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const connect = async () => {
    setBusy(true);
    const redirectUri = `${window.location.origin}${REDIRECT_PATH}`;
    const { data, error } = await supabase.functions.invoke('google-drive-files', {
      body: { action: 'get_auth_url', redirect_uri: redirectUri },
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Could not start Google auth', description: error.message, variant: 'destructive' });
      return;
    }
    sessionStorage.setItem('gdrive_return_to', window.location.href);
    window.location.href = (data as { auth_url: string }).auth_url;
  };

  const disconnect = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke('google-drive-files', {
      body: { action: 'disconnect' },
    });
    setBusy(false);
    if (error) {
      toast({ title: 'Disconnect failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Google Drive disconnected' });
    await loadStatus();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking Google Drive…
      </div>
    );
  }

  if (status?.connected) {
    return (
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          Google Drive connected{status.google_email ? ` as ${status.google_email}` : ''}
        </div>
        <Button size="sm" variant="ghost" onClick={disconnect} disabled={busy} className="gap-1">
          <Unlink className="h-3.5 w-3.5" /> Disconnect
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={connect} disabled={busy} className="gap-2">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
      Connect Google Drive
    </Button>
  );
}