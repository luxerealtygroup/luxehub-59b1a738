import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { FUBDeal } from '@/lib/api/followUpBoss';
import { dealAddressPrefill, deriveSideFromPipeline, looksLikeAddress } from '@/lib/fubDeal';
import { PropertyRole, ROLE_LABEL, TransactionSide } from '@/hooks/usePortalProperties';
import { blockPortalWrite } from '@/hooks/usePortalPreview';

interface Props {
  portalId: string;
  deal: FUBDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

/**
 * Agent-confirmed import of a FUB deal into a portal property + transaction.
 * Everything is prefilled from the deal but nothing is written until the agent
 * accepts the address — FUB deal names are free text and are wrong ~8% of the time.
 */
export function FubDealImportDialog({ portalId, deal, open, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [address, setAddress] = useState('');
  const [role, setRole] = useState<PropertyRole>('purchase');
  const [side, setSide] = useState<TransactionSide>('buy');
  const [price, setPrice] = useState('');
  const [closing, setClosing] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const namedAfterPerson = deal ? !looksLikeAddress(deal.name) && !deal.propertyStreet : false;

  useEffect(() => {
    if (!deal || !open) return;
    const derived = deriveSideFromPipeline(deal.pipelineName);
    setAddress(dealAddressPrefill(deal));
    setRole(derived.role);
    setSide(derived.side);
    setPrice(deal.price ? String(Math.round(deal.price)) : '');
    setClosing(deal.projectedCloseDate ? deal.projectedCloseDate.slice(0, 10) : '');
    setAccepted(false);
  }, [deal, open]);

  const save = async () => {
    if (!deal) return;
    if (blockPortalWrite('Adding properties')) return;
    if (!address.trim()) {
      toast({ title: 'Address required', description: 'Type the address before saving.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    // Does a transaction for this FUB deal already exist on this portal?
    const { data: existingTx } = await supabase
      .from('portal_transactions')
      .select('id,property_id')
      .eq('portal_id', portalId)
      .eq('fub_deal_id', deal.id)
      .maybeSingle();

    let propertyId = existingTx?.property_id ?? null;

    if (propertyId) {
      const { error } = await supabase
        .from('portal_properties')
        .update({ address: address.trim(), role })
        .eq('id', propertyId);
      if (error) {
        setSaving(false);
        toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
        return;
      }
    } else {
      const { count } = await supabase
        .from('portal_properties')
        .select('id', { count: 'exact', head: true })
        .eq('portal_id', portalId);
      const { data: created, error } = await supabase
        .from('portal_properties')
        .insert({
          portal_id: portalId,
          address: address.trim(),
          role,
          display_order: count ?? 0,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();
      if (error || !created) {
        setSaving(false);
        toast({ title: 'Save failed', description: error?.message ?? 'Unknown error', variant: 'destructive' });
        return;
      }
      propertyId = created.id;
    }

    const txPayload = {
      portal_id: portalId,
      property_id: propertyId,
      side,
      status: 'active',
      price: price ? Number(price) : null,
      closing_date: closing || null,
      fub_deal_id: deal.id,
    };
    const txRes = existingTx
      ? await supabase.from('portal_transactions').update(txPayload).eq('id', existingTx.id)
      : await supabase.from('portal_transactions').insert({ ...txPayload, created_by: user?.id ?? null });
    if (txRes.error) {
      setSaving(false);
      toast({ title: 'Save failed', description: txRes.error.message, variant: 'destructive' });
      return;
    }

    // Remember this deal + the stage we acted on, so the suggestion doesn't repeat.
    await supabase.from('portal_fub_deals').upsert(
      {
        portal_id: portalId,
        fub_deal_id: deal.id,
        deal_name: deal.name,
        pipeline_name: deal.pipelineName,
        last_seen_stage: deal.stageName,
        dismissed_stage: deal.stageName,
        linked_property_id: propertyId,
      },
      { onConflict: 'portal_id,fub_deal_id' },
    );

    setSaving(false);
    toast({ title: 'Property added', description: `${address.trim()} is now on this portal.` });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add property from Follow Up Boss</DialogTitle>
          <DialogDescription>
            Prefilled from the deal “{deal?.name ?? ''}”. Check the address before saving — the client sees it.
          </DialogDescription>
        </DialogHeader>

        {namedAfterPerson && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>This deal is named after a person, not an address — set the address manually.</span>
          </div>
        )}

        <div className="grid gap-3">
          <div className="space-y-1">
            <Label>Property address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St, Guelph" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PropertyRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABEL) as PropertyRole[]).map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Side</Label>
              <Select value={side} onValueChange={(v) => setSide(v as TransactionSide)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buying</SelectItem>
                  <SelectItem value="sell">Selling</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Price</Label>
              <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Closing date</Label>
              <Input type="date" value={closing} onChange={(e) => setClosing(e.target.value)} />
            </div>
          </div>
          <label className="flex items-start gap-2 rounded-lg border border-border/60 p-3 text-sm">
            <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(Boolean(v))} className="mt-0.5" />
            <span>
              I've checked this address and it's correct for this client.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!accepted || saving || !address.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
