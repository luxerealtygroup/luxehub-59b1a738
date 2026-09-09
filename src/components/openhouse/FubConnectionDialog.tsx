import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Write-only. The key is stored encrypted on the server and is never sent back
 * here — not in full, not masked. All we ever learn is whether one is set.
 */
export function FubConnectionDialog({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<{ ok: boolean; message: string } | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('openhouse-fub', { body });
    if (error) {
      // The function returns the real reason in the body on a non-2xx.
      const detail = (data as { error?: string } | null)?.error;
      throw new Error(detail || error.message);
    }
    return data as { configured?: boolean; live?: { ok: boolean; message: string } | null; error?: string };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await call({ action: 'status' });
        setConfigured(Boolean(data.configured));
      } catch {
        setConfigured(false);
      }
      setLoading(false);
    })();
  }, [call]);

  const save = async () => {
    if (!value.trim()) {
      toast.error('Paste your Follow Up Boss API key first');
      return;
    }
    setBusy(true);
    try {
      const data = await call({ action: 'save_key', value: value.trim() });
      setValue('');
      setConfigured(true);
      setLive(data.live ?? null);
      toast.success('Follow Up Boss connected');
    } catch (e) {
      toast.error('Could not save that key', { description: (e as Error).message });
    }
    setBusy(false);
  };

  const test = async () => {
    setBusy(true);
    try {
      const data = await call({ action: 'test' });
      setLive(data.live ?? null);
      if (data.live?.ok) toast.success(data.live.message);
      else toast.error(data.live?.message || 'Not connected');
    } catch (e) {
      toast.error('Test failed', { description: (e as Error).message });
    }
    setBusy(false);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Follow Up Boss connection</DialogTitle></DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {configured ? (
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Key saved
                </Badge>
              ) : (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  <AlertCircle className="mr-1 h-3 w-3" /> No key saved
                </Badge>
              )}
              {live && (
                <span className={live.ok ? 'text-sm text-emerald-500' : 'text-sm text-destructive'}>
                  {live.message}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{configured ? 'Replace the key' : 'Follow Up Boss API key'}</Label>
              <Input
                type="password"
                autoComplete="off"
                placeholder="Paste the key from Follow Up Boss → Admin → API"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Saved encrypted on the server and never shown again. Sign-ins are sent from the
                server only — the key never reaches this browser.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={test} disabled={busy || loading || !configured}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Test connection
          </Button>
          <Button onClick={save} disabled={busy || loading}>
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
