import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useHasFUB } from '@/hooks/useHasFUB';
import { usePriorYearActuals, usePriorYearGoal, PriorYearActuals, PriorYearGoal } from './usePriorYearActuals';

export interface AgentActuals { id: string; name: string; a: PriorYearActuals; g: PriorYearGoal | null }

/** Invisible per-agent loader so each agent's 2026 numbers come from the same logic as their own page. */
function Probe({ id, name, fubId, hasFUB, onData }: { id: string; name: string; fubId: number | null; hasFUB: boolean; onData: (d: AgentActuals) => void }) {
  const a = usePriorYearActuals(id, fubId, hasFUB, name);
  const g = usePriorYearGoal(id);
  useEffect(() => { if (!a.loading && g) onData({ id, name, a, g }); }, [a.loading, g, a.gci, a.appointments]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function useTeamActuals(agentIds: string[]) {
  const { hasFUB } = useHasFUB();
  const [people, setPeople] = useState<{ id: string; full_name: string | null; fub_user_id: number | null }[]>([]);
  const [data, setData] = useState<Record<string, AgentActuals>>({});
  const key = agentIds.join(',');
  useEffect(() => {
    if (!agentIds.length) { setPeople([]); return; }
    supabase.from('profiles').select('id, full_name, fub_user_id').in('id', agentIds)
      .then(({ data }) => setPeople((data as any[]) ?? []));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const onData = useCallback((d: AgentActuals) => setData(s => ({ ...s, [d.id]: d })), []);

  const probes = people.map(p => <Probe key={p.id} id={p.id} name={p.full_name ?? ''} fubId={p.fub_user_id} hasFUB={hasFUB} onData={onData} />);
  const list = useMemo(() => people.map(p => data[p.id]).filter(Boolean) as AgentActuals[], [people, data]);
  const loading = people.length === 0 ? agentIds.length > 0 : list.length < people.length;

  const totals = useMemo(() => {
    const t = { gci: 0, gciSales: 0, volume: 0, closings: 0, sales: 0, appts: 0, leads: 0, convos: 0, goalGci: 0, goalDeals: 0, goalVolume: 0 };
    for (const { a, g } of list) {
      t.gci += a.gci; t.gciSales += a.gciSales; t.volume += a.volume; t.closings += a.closings; t.sales += a.closedSales;
      t.appts += a.appointments; t.leads += a.leads; t.convos += a.conversations;
      t.goalGci += g?.gci ?? 0; t.goalDeals += g?.deals ?? 0; t.goalVolume += g?.volume ?? 0;
    }
    const r1 = (v: number) => Math.round(v * 10) / 10;
    return {
      ...t,
      defaults: {
        avg_sale_price: t.sales ? Math.round(t.volume / t.sales) : null,
        commission_rate: t.volume ? r1((t.gciSales / t.volume) * 100) : null,
        appt_to_close_rate: t.appts ? r1((t.closings / t.appts) * 100) : null,
        lead_to_appt_rate: t.leads ? r1((t.appts / t.leads) * 100) : null,
      },
    };
  }, [list]);

  return { probes, list, loading, totals };
}
