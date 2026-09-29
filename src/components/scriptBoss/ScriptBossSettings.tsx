import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

const sb = supabase as unknown as { from: (t: string) => any };

type Version = { id: string; version: number; content: string; note: string | null; created_at: string };
type Scenario = { id: string; name: string; description: string; is_custom: boolean; active: boolean; sort_order: number };
type Person = { id: string; full_name: string | null; roles: string[] };
type Trainee = { user_id: string; enabled: boolean; monthly_cap_usd: number | null };
type Usage = { user_id: string; cost_usd: number; session_id: string | null };

const money = (n: number) => `$${n.toFixed(2)}`;

export function ScriptBossSettings({ canEditInstructions }: { canEditInstructions: boolean }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [trainees, setTrainees] = useState<Record<string, Trainee>>({});
  const [usage, setUsage] = useState<Usage[]>([]);
  const [newScenario, setNewScenario] = useState({ name: '', description: '' });

  const load = useCallback(async () => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { data: me } = await supabase.from('profiles').select('org_id').eq('id', user!.id).maybeSingle();
    const [v, s, p, r, t, u] = await Promise.all([
      sb.from('script_boss_instructions').select('*').order('version', { ascending: false }),
      sb.from('script_boss_scenarios').select('*').order('sort_order'),
      supabase.from('profiles').select('id, full_name, member_type').eq('org_id', me?.org_id ?? ''),
      supabase.from('user_roles').select('user_id, role'),
      sb.from('script_boss_trainees').select('user_id, enabled, monthly_cap_usd'),
      sb.from('script_boss_usage').select('user_id, cost_usd, session_id').gte('created_at', monthStart.toISOString()),
    ]);
    const vs = (v.data as Version[]) || [];
    setVersions(vs);
    setDraft(d => d || vs[0]?.content || '');
    setScenarios((s.data as Scenario[]) || []);
    const roleMap = new Map<string, string[]>();
    for (const row of (r.data || []) as { user_id: string; role: string }[]) roleMap.set(row.user_id, [...(roleMap.get(row.user_id) || []), row.role]);
    setPeople(((p.data || []) as { id: string; full_name: string | null; member_type: string | null }[])
      .filter(x => x.member_type !== 'client')
      .map(x => ({ id: x.id, full_name: x.full_name, roles: roleMap.get(x.id) || [] }))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')));
    const tm: Record<string, Trainee> = {};
    for (const row of (t.data || []) as Trainee[]) tm[row.user_id] = row;
    setTrainees(tm);
    setUsage((u.data as Usage[]) || []);
  }, [user]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const saveInstructions = async () => {
    if (!draft.trim()) return;
    const next = (versions[0]?.version ?? 0) + 1;
    const { error } = await sb.from('script_boss_instructions').insert({ version: next, content: draft, note: note || null, created_by: user!.id });
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: 'destructive' }); return; }
    setNote('');
    toast({ title: `Saved as version ${next}` });
    load();
  };

  const updateScenario = async (id: string, patch: Partial<Scenario>) => {
    const { error } = await sb.from('script_boss_scenarios').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) toast({ title: "Couldn't update", description: error.message, variant: 'destructive' });
    load();
  };
  const addScenario = async () => {
    if (!newScenario.name.trim()) return;
    const max = Math.max(0, ...scenarios.filter(s => !s.is_custom).map(s => s.sort_order));
    const { error } = await sb.from('script_boss_scenarios').insert({ ...newScenario, sort_order: max + 1 });
    if (error) { toast({ title: "Couldn't add", description: error.message, variant: 'destructive' }); return; }
    setNewScenario({ name: '', description: '' });
    load();
  };

  const setTrainee = async (userId: string, patch: Partial<Trainee>) => {
    const cur = trainees[userId] ?? { user_id: userId, enabled: false, monthly_cap_usd: null };
    const row = { ...cur, ...patch, updated_by: user!.id, updated_at: new Date().toISOString() };
    const { error } = await sb.from('script_boss_trainees').upsert(row, { onConflict: 'org_id,user_id' });
    if (error) toast({ title: "Couldn't save", description: error.message, variant: 'destructive' });
    load();
  };

  const usageByPerson = useMemo(() => {
    const m = new Map<string, { cost: number; sessions: Set<string> }>();
    for (const u of usage) {
      const e = m.get(u.user_id) ?? { cost: 0, sessions: new Set() };
      e.cost += Number(u.cost_usd);
      if (u.session_id) e.sessions.add(u.session_id);
      m.set(u.user_id, e);
    }
    return m;
  }, [usage]);
  const totalCost = [...usageByPerson.values()].reduce((a, b) => a + b.cost, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Coaching instructions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Paste your Script Boss instructions, scripts, objection handlers and scoring rubric. Every call and score uses the latest version.{versions.length === 0 && ' Until you save one, a built-in Waterloo Region default is used.'}</p>
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={14} disabled={!canEditInstructions} aria-label="Coaching instructions" className="font-mono text-xs" />
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="What changed? (optional)" />
            <Button onClick={saveInstructions} disabled={!canEditInstructions || !draft.trim() || draft === versions[0]?.content}>Save new version</Button>
          </div>
          {versions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Version history</Label>
              {versions.map((v, i) => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-sm border-b border-border py-1">
                  <span>v{v.version} · {format(parseISO(v.created_at), 'MMM d, yyyy h:mm a')}{v.note ? ` — ${v.note}` : ''} {i === 0 && <Badge variant="outline" className="ml-1">In use</Badge>}</span>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(v.content)}>Load</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display text-lg">Scenarios</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {scenarios.map(s => (
            <div key={s.id} className="grid sm:grid-cols-[1fr_2fr_auto] gap-2 items-center border-b border-border pb-2">
              <Input defaultValue={s.name} aria-label="Scenario name" onBlur={e => e.target.value !== s.name && updateScenario(s.id, { name: e.target.value })} />
              <Input defaultValue={s.description} aria-label="Scenario description" disabled={s.is_custom} onBlur={e => e.target.value !== s.description && updateScenario(s.id, { description: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><Switch checked={s.active} onCheckedChange={v => updateScenario(s.id, { active: v })} /> {s.active ? 'On' : 'Off'}</label>
            </div>
          ))}
          <div className="grid sm:grid-cols-[1fr_2fr_auto] gap-2">
            <Input value={newScenario.name} onChange={e => setNewScenario(n => ({ ...n, name: e.target.value }))} placeholder="New scenario name" />
            <Input value={newScenario.description} onChange={e => setNewScenario(n => ({ ...n, description: e.target.value }))} placeholder="Who the client is and the situation" />
            <Button onClick={addScenario} disabled={!newScenario.name.trim()}>Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Access, usage & caps — {format(new Date(), 'MMMM yyyy')}</CardTitle>
          <p className="text-sm text-muted-foreground">Agents, owners and admins have access automatically. Turn on Trainee for anyone else. Team total this month: {money(totalCost)}.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="py-2 pr-2">Person</th><th className="pr-2">Access</th><th className="pr-2">Trainee</th><th className="pr-2">Sessions</th><th className="pr-2">Cost</th><th>Monthly cap ($)</th></tr></thead>
            <tbody>
              {people.map(p => {
                const auto = p.roles.some(r => ['agent', 'admin', 'owner', 'operations'].includes(r));
                const t = trainees[p.id];
                const u = usageByPerson.get(p.id);
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-2 pr-2">{p.full_name || 'Unnamed'}</td>
                    <td className="pr-2">{auto || t?.enabled ? <Badge variant="outline">Yes</Badge> : <span className="text-muted-foreground">No</span>}</td>
                    <td className="pr-2"><Switch aria-label={`Trainee ${p.full_name}`} checked={Boolean(t?.enabled)} onCheckedChange={v => setTrainee(p.id, { enabled: v })} /></td>
                    <td className="pr-2">{u?.sessions.size ?? 0}</td>
                    <td className="pr-2">{money(u?.cost ?? 0)}</td>
                    <td><Input className="w-24 h-8" type="number" min={0} step={1} defaultValue={t?.monthly_cap_usd ?? ''} placeholder="None"
                      onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (t?.monthly_cap_usd ?? null)) setTrainee(p.id, { monthly_cap_usd: v, enabled: t?.enabled ?? false }); }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2">Costs are estimates of AI usage (voice, transcription and Claude).</p>
        </CardContent>
      </Card>
    </div>
  );
}
