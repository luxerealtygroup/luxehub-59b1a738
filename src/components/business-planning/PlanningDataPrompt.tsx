import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  userId: string;
  year: number;
  quarter: number;
  /** Skip prompt when admin is impersonating someone */
  disabled?: boolean;
  onComplete?: () => void;
}

interface FormState {
  annual_gci_goal: string;
  annual_units_goal: string;
  gci_target: string;
  avg_commission: string;
  avg_sale_price: string;
  split_percent: string;
}

const empty: FormState = {
  annual_gci_goal: '',
  annual_units_goal: '',
  gci_target: '',
  avg_commission: '',
  avg_sale_price: '',
  split_percent: '70',
};

export const PlanningDataPrompt: React.FC<Props> = ({ userId, year, quarter, disabled, onComplete }) => {
  const { toast } = useToast();
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(empty);
  const [missing, setMissing] = useState<{ production: boolean; assumptions: boolean }>({ production: false, assumptions: false });

  useEffect(() => {
    if (disabled || !userId) { setChecking(false); return; }
    let cancelled = false;
    (async () => {
      const [prodRes, assumpRes] = await Promise.all([
        supabase.from('production_goals').select('annual_gci_goal, annual_units_goal').eq('user_id', userId).eq('year', year).maybeSingle(),
        supabase.from('planning_assumptions').select('gci_target, avg_commission, avg_sale_price, split_percent').eq('user_id', userId).eq('year', year).eq('quarter', quarter).maybeSingle(),
      ]);
      if (cancelled) return;
      const prodMissing = !prodRes.data || !prodRes.data.annual_gci_goal || Number(prodRes.data.annual_gci_goal) <= 0;
      const assumpMissing = !assumpRes.data
        || !assumpRes.data.gci_target || Number(assumpRes.data.gci_target) <= 0
        || !assumpRes.data.avg_commission || Number(assumpRes.data.avg_commission) <= 0
        || !assumpRes.data.avg_sale_price || Number(assumpRes.data.avg_sale_price) <= 0;
      setMissing({ production: prodMissing, assumptions: assumpMissing });
      // Pre-fill with anything we already have
      setForm(f => ({
        ...f,
        annual_gci_goal: prodRes.data?.annual_gci_goal ? String(prodRes.data.annual_gci_goal) : '',
        annual_units_goal: prodRes.data?.annual_units_goal ? String(prodRes.data.annual_units_goal) : '',
        gci_target: assumpRes.data?.gci_target ? String(assumpRes.data.gci_target) : '',
        avg_commission: assumpRes.data?.avg_commission ? String(assumpRes.data.avg_commission) : '',
        avg_sale_price: assumpRes.data?.avg_sale_price ? String(assumpRes.data.avg_sale_price) : '',
        split_percent: assumpRes.data?.split_percent ? String(assumpRes.data.split_percent) : '70',
      }));
      setOpen(prodMissing || assumpMissing);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [userId, year, quarter, disabled]);

  const num = (s: string) => {
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const canSubmit = () => {
    if (missing.production && num(form.annual_gci_goal) <= 0) return false;
    if (missing.assumptions) {
      if (num(form.gci_target) <= 0) return false;
      if (num(form.avg_commission) <= 0) return false;
      if (num(form.avg_sale_price) <= 0) return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!canSubmit()) {
      toast({ title: 'Please complete required fields', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const ops: PromiseLike<any>[] = [];
      if (missing.production) {
        ops.push(supabase.from('production_goals').upsert({
          user_id: userId,
          year,
          annual_gci_goal: num(form.annual_gci_goal),
          annual_units_goal: num(form.annual_units_goal) || null,
        }, { onConflict: 'user_id,year' }));
      }
      if (missing.assumptions) {
        ops.push(supabase.from('planning_assumptions').upsert({
          user_id: userId,
          year,
          quarter,
          gci_target: num(form.gci_target),
          avg_commission: num(form.avg_commission),
          avg_sale_price: num(form.avg_sale_price),
          split_percent: num(form.split_percent) || 70,
        }, { onConflict: 'user_id,year,quarter' }));
      }
      const results = await Promise.all(ops);
      const err = results.find(r => r.error)?.error;
      if (err) throw err;
      toast({ title: 'Saved — thanks!', description: 'Your Q3 planning is ready.' });
      setOpen(false);
      onComplete?.();
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message || 'Try again', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (checking || !open) return null;

  return (
    <Dialog open={open} onOpenChange={() => { /* blocking — cannot dismiss */ }}>
      <DialogContent className="max-w-lg" onPointerDownOutside={e => e.preventDefault()} onEscapeKeyDown={e => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Complete your planning data
          </DialogTitle>
          <DialogDescription>
            Before you can use Business Planning, please fill in the numbers below. This drives your gap analysis, carryover, and Q{quarter} targets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {missing.production && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">Annual {year} Goals</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="annual_gci_goal" className="text-xs">Annual GCI Goal *</Label>
                  <Input id="annual_gci_goal" type="number" inputMode="decimal" placeholder="e.g. 200000"
                    value={form.annual_gci_goal} onChange={e => setForm({ ...form, annual_gci_goal: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="annual_units_goal" className="text-xs">Annual Units Goal</Label>
                  <Input id="annual_units_goal" type="number" inputMode="decimal" placeholder="e.g. 24"
                    value={form.annual_units_goal} onChange={e => setForm({ ...form, annual_units_goal: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {missing.assumptions && (
            <div className="space-y-3 rounded-md border border-border p-3">
              <p className="text-sm font-medium text-foreground">Q{quarter} {year} Planning Assumptions</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="gci_target" className="text-xs">Q{quarter} GCI Target *</Label>
                  <Input id="gci_target" type="number" inputMode="decimal" placeholder="e.g. 50000"
                    value={form.gci_target} onChange={e => setForm({ ...form, gci_target: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="avg_sale_price" className="text-xs">Avg Sale Price *</Label>
                  <Input id="avg_sale_price" type="number" inputMode="decimal" placeholder="e.g. 450000"
                    value={form.avg_sale_price} onChange={e => setForm({ ...form, avg_sale_price: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="avg_commission" className="text-xs">Avg Commission ($) *</Label>
                  <Input id="avg_commission" type="number" inputMode="decimal" placeholder="e.g. 9000"
                    value={form.avg_commission} onChange={e => setForm({ ...form, avg_commission: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="split_percent" className="text-xs">Agent Split %</Label>
                  <Input id="split_percent" type="number" inputMode="decimal" placeholder="70"
                    value={form.split_percent} onChange={e => setForm({ ...form, split_percent: e.target.value })} />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || !canSubmit()} className="w-full">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save & Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};