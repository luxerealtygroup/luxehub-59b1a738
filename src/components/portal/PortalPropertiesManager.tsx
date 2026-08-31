import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  PortalProperty,
  PortalTransaction,
  PropertyRole,
  ROLE_LABEL,
  propertyLabel,
  usePortalProperties,
} from '@/hooks/usePortalProperties';
import { blockPortalWrite } from '@/hooks/usePortalPreview';
import { PortalConditionsEditor } from '@/components/portal/PortalConditionsEditor';

interface Props {
  portalId: string;
}

const STATUSES = ['active', 'under_contract', 'pending', 'closed', 'lost'];

/** Agent/admin management of a portal's properties and their transactions. */
export function PortalPropertiesManager({ portalId }: Props) {
  const { properties, transactionsByProperty, loading, reload } = usePortalProperties(portalId);
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const fail = (error: { message: string } | null) => {
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    return !!error;
  };

  const addProperty = async () => {
    if (blockPortalWrite('Adding properties')) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('portal_properties').insert({
      portal_id: portalId,
      role: 'listing',
      display_order: properties.length,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (!fail(error)) reload();
  };

  const patchProperty = async (id: string, patch: Partial<PortalProperty>) => {
    if (blockPortalWrite('Editing properties')) return;
    const { error } = await supabase.from('portal_properties').update(patch).eq('id', id);
    if (!fail(error)) reload();
  };

  const removeProperty = async (p: PortalProperty) => {
    if (blockPortalWrite('Removing properties')) return;
    if (!confirm(`Remove "${propertyLabel(p)}"? Its transactions are removed too; documents and photos stay on the portal.`)) return;
    const { error } = await supabase.from('portal_properties').delete().eq('id', p.id);
    if (!fail(error)) reload();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (blockPortalWrite('Reordering properties')) return;
    const a = properties[index];
    const b = properties[index + dir];
    if (!a || !b) return;
    await supabase.from('portal_properties').update({ display_order: index + dir }).eq('id', a.id);
    await supabase.from('portal_properties').update({ display_order: index }).eq('id', b.id);
    reload();
  };

  const addTransaction = async (property: PortalProperty) => {
    if (blockPortalWrite('Adding transactions')) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('portal_transactions').insert({
      portal_id: portalId,
      property_id: property.id,
      side: property.role === 'purchase' ? 'buy' : 'sell',
      status: 'active',
      created_by: user?.id ?? null,
    });
    if (!fail(error)) reload();
  };

  const patchTransaction = async (id: string, patch: Partial<PortalTransaction>) => {
    if (blockPortalWrite('Editing transactions')) return;
    const { error } = await supabase.from('portal_transactions').update(patch).eq('id', id);
    if (!fail(error)) reload();
  };

  const removeTransaction = async (id: string) => {
    if (blockPortalWrite('Removing transactions')) return;
    const { error } = await supabase.from('portal_transactions').delete().eq('id', id);
    if (!fail(error)) reload();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading properties…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          A portal can hold several properties — a sale and a purchase can run side by side.
        </p>
        <Button size="sm" onClick={addProperty} disabled={busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add property
        </Button>
      </div>

      {properties.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No properties yet. Add one to start scoping documents, photos and tasks to it.
        </div>
      )}

      {properties.map((p, i) => {
        const txs = transactionsByProperty.get(p.id) ?? [];
        return (
          <div key={p.id} className="rounded-xl border border-border/70 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Address</Label>
                  <Input
                    defaultValue={p.address ?? ''}
                    placeholder="123 Main St"
                    onBlur={(e) => e.target.value !== (p.address ?? '') && patchProperty(p.id, { address: e.target.value.trim() || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>MLS number</Label>
                  <Input
                    defaultValue={p.mls_number ?? ''}
                    onBlur={(e) => e.target.value !== (p.mls_number ?? '') && patchProperty(p.id, { mls_number: e.target.value.trim() || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Property type</Label>
                  <Input
                    defaultValue={p.property_type ?? ''}
                    placeholder="Detached, condo…"
                    onBlur={(e) => e.target.value !== (p.property_type ?? '') && patchProperty(p.id, { property_type: e.target.value.trim() || null })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={p.role} onValueChange={(v) => patchProperty(p.id, { role: v as PropertyRole })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ROLE_LABEL) as PropertyRole[]).map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Cover photo URL</Label>
                  <Input
                    defaultValue={p.cover_photo_url ?? ''}
                    placeholder="https://…"
                    onBlur={(e) => e.target.value !== (p.cover_photo_url ?? '') && patchProperty(p.id, { cover_photo_url: e.target.value.trim() || null })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" disabled={i === properties.length - 1} onClick={() => move(i, 1)} title="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => removeProperty(p)} title="Remove property">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            {p.role === 'watching' ? (
              <Badge variant="outline" className="text-xs">Saved / watching — no transaction tracked</Badge>
            ) : (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Transactions</Label>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => addTransaction(p)}>
                    <Plus className="h-3.5 w-3.5" /> Add transaction
                  </Button>
                </div>
                {txs.length === 0 && (
                  <p className="text-xs text-muted-foreground">No transaction yet for this property.</p>
                )}
                {txs.map((t) => (
                  <div key={t.id} className="grid gap-2 sm:grid-cols-4 items-end rounded-lg bg-muted/40 p-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Side</Label>
                      <Select value={t.side} onValueChange={(v) => patchTransaction(t.id, { side: v as 'buy' | 'sell' })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Stage</Label>
                      <Select value={t.status} onValueChange={(v) => patchTransaction(t.id, { status: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price</Label>
                      <Input
                        className="h-9"
                        type="number"
                        defaultValue={t.price ?? ''}
                        onBlur={(e) => patchTransaction(t.id, { price: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">FUB deal ID</Label>
                      <Input
                        className="h-9"
                        type="number"
                        defaultValue={t.fub_deal_id ?? ''}
                        onBlur={(e) => patchTransaction(t.id, { fub_deal_id: e.target.value ? Number(e.target.value) : null })}
                      />
                    </div>
                    {([
                      ['offer_date', 'Offer'],
                      ['deposit_due_date', 'Deposit due'],
                      ['conditions_date', 'Conditions'],
                      ['firm_date', 'Firm'],
                      ['requisition_date', 'Requisition'],
                      ['closing_date', 'Closing'],
                    ] as const).map(([field, label]) => (
                      <div key={field} className="space-y-1">
                        <Label className="text-xs">{label}</Label>
                        <Input
                          className="h-9"
                          type="date"
                          defaultValue={t[field] ?? ''}
                          onBlur={(e) => patchTransaction(t.id, { [field]: e.target.value || null } as Partial<PortalTransaction>)}
                        />
                      </div>
                    ))}
                    <div className="sm:col-span-4 flex justify-end">
                      <Button size="sm" variant="ghost" className="gap-2" onClick={() => removeTransaction(t.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" /> Remove transaction
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
