import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FubStageSelect } from '@/components/openhouse/FubStageSelect';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** When guests go over to Follow Up Boss without anybody pressing anything. */
export const SEND_TIMING_KEY = 'open_house_fub_send_timing';
/** The stage used when a guest's row and the hosting agent have no preference. */
export const TEAM_STAGE_KEY = 'open_house_fub_default_stage';

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
  const [timing, setTiming] = useState<'end' | 'signin'>('signin');
  const [teamStage, setTeamStage] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

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
      const { data: rows } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', [SEND_TIMING_KEY, TEAM_STAGE_KEY]);
      for (const r of rows || []) {
        if (r.key === SEND_TIMING_KEY) setTiming(r.value === 'end' ? 'end' : 'signin');
        if (r.key === TEAM_STAGE_KEY && r.value) setTeamStage(r.value as string);
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

  const savePrefs = async (nextTiming: 'end' | 'signin', nextStage: string | null) => {
    setTiming(nextTiming);
    setTeamStage(nextStage);
    setSavingPrefs(true);
    const rows: { key: string; value: string }[] = [{ key: SEND_TIMING_KEY, value: nextTiming }];
    if (nextStage) rows.push({ key: TEAM_STAGE_KEY, value: nextStage });
    const { error } = await supabase.from('app_settings').upsert(rows, { onConflict: 'org_id,key' });
    setSavingPrefs(false);
    if (error) toast.error('Could not save that setting', { description: error.message });
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

            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label>When guests go over</Label>
              <RadioGroup
                value={timing}
                onValueChange={(v) => savePrefs(v as 'end' | 'signin', teamStage)}
                className="gap-2"
              >
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="end" id="fub-timing-end" className="mt-1" />
                  <Label htmlFor="fub-timing-end" className="font-normal">
                    When the open house ends
                    <span className="block text-xs text-muted-foreground">
                      Slower, but one tidy note per guest with everything you learned in it.
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="signin" id="fub-timing-signin" className="mt-1" />
                  <Label htmlFor="fub-timing-signin" className="font-normal">
                    As they sign in
                    <span className="block text-xs text-muted-foreground">
                      Recommended — your Follow Up Boss automation starts straight away. The first
                      note has their five answers; anything you add later follows as an update to
                      the same person.
                    </span>
                  </Label>
                </div>
              </RadioGroup>
              {savingPrefs && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Saving…
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Stage to use when nothing else is chosen</Label>
              <FubStageSelect
                value={teamStage}
                onChange={(s) => savePrefs(timing, s)}
                className="h-10 w-full"
              />
              <p className="text-xs text-muted-foreground">
Automatic sends use the hosting agent's usual stage, since nobody has chosen one yet at
                sign-in; this stage is the backstop when they haven't set one. Change a guest's stage
                later and it moves in Follow Up Boss too — unless they're already being worked.
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
