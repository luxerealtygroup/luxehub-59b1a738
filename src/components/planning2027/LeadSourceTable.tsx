import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info, RefreshCw } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';

interface Row { source: string; leads: number; closed_sales: number; closed_leases: number; closed_gci: number; pending: number; pending_leases: number; pending_gci: number }
const n = (v: number) => Math.round(v).toLocaleString();
const $ = (v: number) => `$${n(v)}`;

/** 2026 by-source table using the one shared attribution rule (computed server-side). */
export default function LeadSourceTable({ compact = false }: { compact?: boolean }) {
  const { orgId } = useTenant();
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase.from('lead_attribution_cache' as any).select('result, computed_at').eq('org_id', orgId).maybeSingle();
    setRes((data as any)?.result ?? null); return (data as any)?.computed_at as string | undefined;
  }, [orgId]);
  const refresh = async () => {
    setBusy(true);
    const before = res?.as_of;
    await supabase.functions.invoke('lead-attribution', { body: {} });
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 4000)); const at = await load(); if (at && at !== before) break; }
    setBusy(false);
  };
  useEffect(() => { load(); }, [load]);

  const rows: Row[] = res?.table ?? [];
  const tot = rows.reduce((t, r) => ({ leads: t.leads + r.leads, cs: t.cs + r.closed_sales, cl: t.cl + r.closed_leases, cg: t.cg + r.closed_gci, p: t.p + r.pending, pg: t.pg + r.pending_gci }), { leads: 0, cs: 0, cl: 0, cg: 0, p: 0, pg: 0 });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">2026 by lead source</CardTitle>
          <Popover>
            <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground"><Info className="h-3.5 w-3.5" />Attribution rule</Button></PopoverTrigger>
            <PopoverContent className="w-80 text-sm">{res?.rule ?? 'Realtor.ca if any client on the deal has a Realtor.ca inquiry/event or tag; otherwise the first client\'s source. Agent referrals are separate. Vendors excluded.'}</PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {res?.as_of && <span>As of {new Date(res.as_of).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>}
          <Button size="sm" variant="outline" className="h-7 gap-1" onClick={refresh} disabled={busy}><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />{busy ? 'Refreshing…' : 'Refresh'}</Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!rows.length ? <p className="text-sm text-muted-foreground">{busy ? 'Reading Follow Up Boss timelines… this takes about a minute.' : 'No results yet — press Refresh.'}</p> : (
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b">
              <th className="py-2 text-left font-medium">Source</th><th className="text-right font-medium">Leads</th><th className="text-right font-medium">Closed sales</th>
              <th className="text-right font-medium">Closed leases</th><th className="text-right font-medium">Closed GCI</th><th className="text-right font-medium">Pending</th><th className="text-right font-medium">Pending GCI</th>
            </tr></thead>
            <tbody>
              {rows.filter(r => !compact || r.leads + r.closed_sales + r.closed_leases + r.pending > 0).map(r => (
                <tr key={r.source} className="border-b last:border-0">
                  <td className="py-2">{r.source}</td><td className="text-right">{n(r.leads)}</td><td className="text-right">{r.closed_sales}</td>
                  <td className="text-right">{r.closed_leases}</td><td className="text-right">{$(r.closed_gci)}</td><td className="text-right">{r.pending}</td><td className="text-right">{$(r.pending_gci)}</td>
                </tr>))}
              <tr className="font-semibold"><td className="py-2">Total</td><td className="text-right">{n(tot.leads)}</td><td className="text-right">{tot.cs}</td><td className="text-right">{tot.cl}</td><td className="text-right">{$(tot.cg)}</td><td className="text-right">{tot.p}</td><td className="text-right">{$(tot.pg)}</td></tr>
            </tbody>
          </table>)}
      </CardContent>
    </Card>
  );
}
