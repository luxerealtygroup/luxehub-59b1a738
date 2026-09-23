import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { FUB_TIERS, FubTier, Guest, guestName, tierTemperature } from '@/lib/openHouse/guests';

/**
 * End-of-day review: one tier per guest, then send. Each tier goes to Follow
 * Up Boss as its own update on that one person — this is what starts the
 * agent's follow-up automation.
 */
export function ReviewGuestsDialog({
  guests,
  onClose,
  onDone,
}: {
  guests: Guest[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [tiers, setTiers] = useState<Record<string, FubTier | ''>>({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const init: Record<string, FubTier | ''> = {};
    guests.forEach((g) => { init[g.id] = g.fub_tier ?? ''; });
    setTiers(init);
  }, [guests]);

  const pending = guests.filter((g) => tiers[g.id] && (tiers[g.id] !== g.fub_tier || !g.fub_tier_sent_at));

  const send = async () => {
    const payload: Record<string, string> = {};
    pending.forEach((g) => { payload[g.id] = tiers[g.id] as string; });
    if (!Object.keys(payload).length) {
      toast.error('Set a tier on at least one guest first.');
      return;
    }
    setSending(true);
    // Keep the seller report counts in step before sending.
    await Promise.all(
      pending.map((g) =>
        supabase
          .from('open_house_visitors')
          .update({ fub_tier: payload[g.id], temperature: tierTemperature(payload[g.id] as FubTier) })
          .eq('id', g.id),
      ),
    );
    const { data, error } = await supabase.functions.invoke('openhouse-fub', {
      body: { action: 'send_tier', tiers: payload },
    });
    setSending(false);
    if (error || data?.error) {
      toast.error(data?.error || 'Could not send the tiers.');
    } else if (data.failed) {
      toast.warning(`${data.sent} sent, ${data.failed} need another try — see each guest.`);
    } else {
      toast.success(`${data.sent} guest${data.sent === 1 ? '' : 's'} sent with their tier.`);
    }
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review guests</DialogTitle>
          <DialogDescription>
            Pick one tier for each guest, then send. This starts their follow-up in Follow Up Boss.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {guests.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{guestName(g)}</p>
                <p className="text-xs text-muted-foreground">
                  {g.fub_tier_sent_at ? `Sent as ${g.fub_tier}` : g.fub_sent_at ? 'In Follow Up Boss, no tier yet' : 'Not sent yet'}
                </p>
              </div>
              <Select value={tiers[g.id] || undefined} onValueChange={(v) => setTiers((t) => ({ ...t, [g.id]: v as FubTier }))}>
                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Pick a tier" /></SelectTrigger>
                <SelectContent>
                  {FUB_TIERS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <Button onClick={send} disabled={sending || pending.length === 0} className="w-full">
          {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          Send {pending.length} to Follow Up Boss
        </Button>
      </DialogContent>
    </Dialog>
  );
}
