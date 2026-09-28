import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, ArrowUpDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * "From Follow Up Boss" weekly numbers. Read-only; agent-entered values are
 * shown beside them but never overwritten. Targets come from the agent's
 * submitted 2027 plan (weekly commitments, else annual plan / 50 weeks).
 */

export type FubRow = Record<string, any>;

export interface WeeklyTargets {
  conversations: number | null;
  pipeline_adds: number | null;
  appointments_held: number | null;
  agreements: number | null;
  deals: number | null;
}

type KpiKey = keyof WeeklyTargets;

export const KPIS: { key: KpiKey; label: string; fub: (r: FubRow) => number | null; agent?: (r: FubRow, logged: number) => number | null; agentLabel?: string }[] = [
  { key: 'conversations', label: 'Conversations', fub: (r) => r.fub_conversations ?? null, agent: (r) => r.contacts_made ?? null, agentLabel: 'Contacts (4-1-1)' },
  { key: 'pipeline_adds', label: 'Pipeline adds', fub: (r) => r.fub_pipeline_adds ?? null, agent: (r) => r.pipeline_additions ?? null },
  { key: 'appointments_held', label: 'Appointments held', fub: (r) => r.fub_appointments_held ?? null, agent: (_r, logged) => logged },
  { key: 'agreements', label: 'Agreements signed', fub: (r) => r.fub_agreements ?? null, agent: (r) => r.contracts_signed ?? null },
  { key: 'deals', label: 'Deals closed + pending', fub: (r) => (r.fub_closed == null ? null : (r.fub_closed ?? 0) + (r.fub_pending ?? 0)), agent: (r) => r.firm_deals ?? null },
];

const SUPPORTING: { label: string; value: (r: FubRow) => string }[] = [
  { label: 'Outbound calls', value: (r) => fmt(r.calls_outbound) },
  { label: 'Texts sent', value: (r) => fmt(r.texts_sent) },
  { label: 'Emails sent', value: () => 'Not available' },
  { label: 'New leads', value: (r) => fmt(r.new_leads) },
  { label: 'Speed to lead', value: (r) => (r.fub_speed_to_lead_minutes == null ? '—' : minutes(r.fub_speed_to_lead_minutes)) },
];

function fmt(v: number | null | undefined) { return v == null ? '—' : Math.round(v).toLocaleString(); }
function minutes(m: number) {
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

export function status(actual: number | null, target: number | null): 'green' | 'amber' | 'red' | null {
  if (actual == null || !target) return null;
  const pct = actual / target;
  return pct >= 1 ? 'green' : pct >= 0.7 ? 'amber' : 'red';
}
const dot: Record<string, string> = {
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
};

export function bigGap(fub: number | null, agent: number | null) {
  if (fub == null || agent == null) return false;
  const diff = Math.abs(fub - agent);
  return diff >= 3 && diff >= 0.5 * Math.max(fub, agent);
}

/** Weekly targets for a set of agents from submitted/approved 2027 plans. */
export function useWeeklyTargets(userIds: string[]) {
  const [targets, setTargets] = useState<Map<string, WeeklyTargets>>(new Map());
  const key = userIds.slice().sort().join(',');
  useEffect(() => {
    if (!userIds.length) return;
    (async () => {
      const [{ data: goals }, { data: pre }] = await Promise.all([
        supabase.from('planning_goals').select('agent_id, status, deals_needed, appointments_needed')
          .eq('plan_year', 2027).in('agent_id', userIds),
        supabase.from('planning_prework').select('agent_id, status, weekly_conversations, weekly_appointments')
          .eq('plan_year', 2027).in('agent_id', userIds),
      ]);
      const m = new Map<string, WeeklyTargets>();
      for (const id of userIds) {
        const g = (goals ?? []).find((x: any) => x.agent_id === id && x.status !== 'draft') as any;
        const p = (pre ?? []).find((x: any) => x.agent_id === id && x.status !== 'draft') as any;
        if (!g && !p) continue;
        const perWeek = (n: number | null | undefined) => (n ? Math.round((n / 50) * 10) / 10 : null);
        m.set(id, {
          conversations: p?.weekly_conversations ?? null,
          appointments_held: p?.weekly_appointments ?? perWeek(g?.appointments_needed),
          pipeline_adds: perWeek(g?.deals_needed),
          agreements: perWeek(g?.deals_needed),
          deals: perWeek(g?.deals_needed),
        });
      }
      setTargets(m);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return targets;
}

// ---------------------------------------------------------------------------

export function FubWeekBlock({ row, userId, appointmentsLogged }: { row: FubRow | null; userId: string; appointmentsLogged: number }) {
  const targets = useWeeklyTargets(userId ? [userId] : []).get(userId) ?? null;
  const synced = Boolean(row?.fub_synced_at);
  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-display">From Follow Up Boss</CardTitle>
        <p className="text-xs text-muted-foreground">
          {synced ? `As of ${format(new Date(row!.fub_synced_at), 'MMM d, h:mm a')}` : 'Not measured yet for this week'}
          {' · '}Read-only. Your own entries are shown beside them and are never changed.
          {!targets && ' · Targets appear once your 2027 plan is submitted.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {KPIS.map((k) => {
            const fub = row ? k.fub(row) : null;
            const agent = row && k.agent ? k.agent(row, appointmentsLogged) : null;
            const target = targets?.[k.key] ?? null;
            const st = synced ? status(fub, target) : null;
            const gap = synced && bigGap(fub, agent);
            return (
              <div key={k.key} className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                  {st && <span className={cn('h-2.5 w-2.5 rounded-full', dot[st])} aria-label={st} />}
                </div>
                <div className="mt-1 text-2xl font-semibold">{synced ? fmt(fub) : '—'}</div>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {target != null && <div>Target {target}/wk</div>}
                  {k.agent && <div>{k.agentLabel ?? 'You entered'}: {fmt(agent)}</div>}
                  {k.key === 'deals' && synced && row && (
                    <div>{row.fub_closed ?? 0} closed · {row.fub_pending ?? 0} pending</div>
                  )}
                </div>
                {gap && (
                  <p className="mt-2 flex items-start gap-1 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    FUB shows {fmt(fub)}, 4-1-1 says {fmt(agent)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {SUPPORTING.map((s) => (
            <div key={s.label}>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-sm font-semibold">{synced && row ? s.value(row) : '—'}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function TeamFubKpiTable({ agents, rows }: { agents: { id: string; full_name: string | null }[]; rows: FubRow[] }) {
  const targets = useWeeklyTargets(agents.map((a) => a.id));
  const [sort, setSort] = useState<{ key: KpiKey | 'name'; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const data = useMemo(() => agents.map((a) => {
    const r = rows.find((x) => x.user_id === a.id) ?? null;
    const vals = Object.fromEntries(KPIS.map((k) => [k.key, r ? k.fub(r) : null])) as Record<KpiKey, number | null>;
    return { a, r, vals };
  }), [agents, rows]);
  const sorted = [...data].sort((x, y) => {
    if (sort.key === 'name') return sort.dir * String(x.a.full_name).localeCompare(String(y.a.full_name));
    return sort.dir * ((x.vals[sort.key] ?? -1) - (y.vals[sort.key] ?? -1));
  });
  const total = (k: KpiKey) => data.reduce((s, d) => s + (d.vals[k] ?? 0), 0);
  const syncedAt = rows.map((r) => r.fub_synced_at).filter(Boolean).sort().pop();
  const head = (key: KpiKey | 'name', label: string) => (
    <TableHead key={key} className={key === "name" ? "" : "text-right"}>
      <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}>
        {label} <ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );
  return (
    <Card className="border-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-display">From Follow Up Boss — 2027 KPIs</CardTitle>
        <p className="text-xs text-muted-foreground">{syncedAt ? `As of ${format(new Date(syncedAt), 'MMM d, h:mm a')}` : 'Not measured yet for this week'}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {head('name', 'Agent')}
              {KPIS.map((k) => head(k.key, k.label))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(({ a, r, vals }) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium whitespace-nowrap">{a.full_name}</TableCell>
                {KPIS.map((k) => {
                  const st = r?.fub_synced_at ? status(vals[k.key], targets.get(a.id)?.[k.key] ?? null) : null;
                  return (
                    <TableCell key={k.key} className="text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {st && <span className={cn('h-2 w-2 rounded-full', dot[st])} />}
                        {r?.fub_synced_at ? fmt(vals[k.key]) : '—'}
                      </span>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell>Team total</TableCell>
              {KPIS.map((k) => <TableCell key={k.key} className="text-right tabular-nums">{fmt(total(k.key))}</TableCell>)}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
