import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { clearDealsCache, dealDate, loadDeals } from '@/lib/firmDeals';

type Row = { id: number; name: string; date: string; gci: number; personal: boolean; doubleEnd: boolean };

/** Mark deals as "Personal transaction (no commission)" or "Double-end" so they stop being flagged. */
export function DealFlagsEditor({ orgId }: { orgId: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    loadDeals().then(({ deals, flags }) => {
      const closed = deals.filter(d => String(d.stageName).toLowerCase() === 'closed' && dealDate(d).startsWith('2026'));
      const names = new Map<string, number>();
      for (const d of closed) names.set(String(d.name).trim().toLowerCase(), (names.get(String(d.name).trim().toLowerCase()) ?? 0) + 1);
      setRows(closed.filter(d => !Number(d.commissionValue) || names.get(String(d.name).trim().toLowerCase())! > 1 || flags.has(Number(d.id)))
        .map(d => ({ id: Number(d.id), name: d.name, date: dealDate(d), gci: Number(d.commissionValue || 0), personal: !!flags.get(Number(d.id))?.personal, doubleEnd: !!flags.get(Number(d.id))?.doubleEnd }))
        .sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, []);
  const set = async (r: Row, k: 'personal' | 'doubleEnd', v: boolean) => {
    if (!orgId) return;
    const next = { ...r, [k]: v };
    const { error } = await supabase.from('deal_metadata').upsert({ fub_deal_id: r.id, org_id: orgId, personal_transaction: next.personal, double_end: next.doubleEnd } as any, { onConflict: 'fub_deal_id' });
    if (error) { toast.error(error.message); return; }
    clearDealsCache();
    setRows(rs => rs.map(x => (x.id === r.id ? next : x)));
  };
  if (!rows.length) return null;
  return (
    <div className="col-span-2 space-y-2">
      <Label className="text-xs">Deal flags (2026 closed deals with $0 commission or a repeated address)</Label>
      <div className="rounded-md border border-border divide-y divide-border">
        {rows.map(r => (
          <div key={r.id} className="p-2 text-sm space-y-1">
            <p className="font-medium break-words">{r.name} <span className="text-xs font-normal text-muted-foreground">· {r.date} · {formatCurrency(r.gci)}</span></p>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={r.personal} onCheckedChange={c => set(r, 'personal', !!c)} />Personal transaction (no commission)</label>
              <label className="flex items-center gap-2 text-xs"><Checkbox checked={r.doubleEnd} onCheckedChange={c => set(r, 'doubleEnd', !!c)} />Double-end</label>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Personal transactions count as the agent's closed units but are left out of GCI-per-deal and Luxe-revenue-per-deal averages. A double-end counts as 2 units, one per side.</p>
    </div>
  );
}
