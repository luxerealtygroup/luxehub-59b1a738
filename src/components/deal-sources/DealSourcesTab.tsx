import { useEffect, useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Plus, Save, Settings, Loader2, PieChart, Target } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ──
interface SourceCategory {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface DealSource {
  id: string;
  agent_id: string;
  fub_deal_id: number | null;
  deal_address: string | null;
  deal_type: string;
  close_date: string | null;
  status: string;
  source_category: string;
  source_notes: string | null;
  gci: number;
  created_at: string;
}

interface SourceTarget {
  id?: string;
  source_category: string;
  target_percentage: number;
}

interface SourceBreakdownRow {
  source: string;
  count: number;
  pct: number;
  gci: number;
  avgGci: number;
}

interface DealSourcesTabProps {
  companyDealGoal: number;
  isAdmin: boolean;
  agentFilter?: string | null; // null = all agents (admin view)
}

const CURRENT_YEAR = new Date().getFullYear();

const DealSourcesTab = ({ companyDealGoal, isAdmin, agentFilter }: DealSourcesTabProps) => {
  const { user } = useAuth();
  const [categories, setCategories] = useState<SourceCategory[]>([]);
  const [dealSources, setDealSources] = useState<DealSource[]>([]);
  const [sourceTargets, setSourceTargets] = useState<SourceTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());

  // Filters
  const [dateFilter, setDateFilter] = useState('ytd');
  const [statusFilter, setStatusFilter] = useState('both');
  const [typeFilter, setTypeFilter] = useState('both');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');

  // Add deal dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newDeal, setNewDeal] = useState({ deal_address: '', deal_type: 'unknown', status: 'pending', source_category: '', source_notes: '', gci: 0, close_date: '' });
  const [saving, setSaving] = useState(false);

  // Category management
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Target editing
  const [editingTargets, setEditingTargets] = useState(false);
  const [targetDraft, setTargetDraft] = useState<Record<string, number>>({});

  const effectiveAgent = agentFilter || (isAdmin ? (selectedAgent === 'all' ? null : selectedAgent) : user?.id || null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [catRes, dealsRes, targetsRes, profilesRes] = await Promise.all([
      supabase.from('deal_source_categories').select('*').order('sort_order'),
      supabase.from('deal_sources').select('*'),
      supabase.from('deal_source_targets').select('*').eq('year', CURRENT_YEAR),
      supabase.from('profiles').select('id, full_name'),
    ]);
    setCategories((catRes.data || []) as SourceCategory[]);
    setDealSources((dealsRes.data || []) as DealSource[]);
    setSourceTargets((targetsRes.data || []).map((t: any) => ({ id: t.id, source_category: t.source_category, target_percentage: Number(t.target_percentage) })));
    setProfiles(new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name || 'Unknown'])));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Date range calculation ──
  const dateRange = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    if (dateFilter === 'ytd') return { start: `${y}-01-01`, end: `${y}-12-31` };
    if (dateFilter === 'q1') return { start: `${y}-01-01`, end: `${y}-03-31` };
    if (dateFilter === 'q2') return { start: `${y}-04-01`, end: `${y}-06-30` };
    if (dateFilter === 'q3') return { start: `${y}-07-01`, end: `${y}-09-30` };
    if (dateFilter === 'q4') return { start: `${y}-10-01`, end: `${y}-12-31` };
    if (dateFilter === 'last12') {
      const past = new Date(now);
      past.setFullYear(past.getFullYear() - 1);
      return { start: past.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    return { start: `${y}-01-01`, end: `${y}-12-31` };
  }, [dateFilter]);

  // ── Filtered deals ──
  const filtered = useMemo(() => {
    return dealSources.filter(d => {
      if (effectiveAgent && d.agent_id !== effectiveAgent) return false;
      if (statusFilter === 'closed' && d.status !== 'closed') return false;
      if (statusFilter === 'pending' && d.status !== 'pending') return false;
      if (typeFilter === 'listing' && d.deal_type !== 'listing') return false;
      if (typeFilter === 'buyer' && d.deal_type !== 'buyer') return false;
      if (d.close_date) {
        if (d.close_date < dateRange.start || d.close_date > dateRange.end) return false;
      }
      return true;
    });
  }, [dealSources, effectiveAgent, statusFilter, typeFilter, dateRange]);

  // ── Source breakdown ──
  const closedBreakdown = useMemo(() => buildBreakdown(filtered.filter(d => d.status === 'closed'), categories), [filtered, categories]);
  const pendingBreakdown = useMemo(() => buildBreakdown(filtered.filter(d => d.status === 'pending'), categories), [filtered, categories]);

  // ── Missing source health ──
  const missingSource = useMemo(() => dealSources.filter(d => !d.source_category || d.source_category === ''), [dealSources]);

  // ── Historical mix (last 12 months closed) ──
  const historicalMix = useMemo(() => {
    const past = new Date();
    past.setFullYear(past.getFullYear() - 1);
    const pastStr = past.toISOString().slice(0, 10);
    const nowStr = new Date().toISOString().slice(0, 10);
    const last12Closed = dealSources.filter(d => d.status === 'closed' && d.close_date && d.close_date >= pastStr && d.close_date <= nowStr);
    const total = last12Closed.length || 1;
    const map: Record<string, number> = {};
    categories.filter(c => c.is_active).forEach(c => { map[c.name] = 0; });
    last12Closed.forEach(d => { if (map[d.source_category] !== undefined) map[d.source_category]++; });
    const result: Record<string, number> = {};
    Object.entries(map).forEach(([k, v]) => { result[k] = Math.round((v / total) * 100); });
    return result;
  }, [dealSources, categories]);

  // ── Target-based gaps ──
  const sourceGaps = useMemo(() => {
    const activeCats = categories.filter(c => c.is_active);
    const targetMap: Record<string, number> = {};
    sourceTargets.forEach(t => { targetMap[t.source_category] = t.target_percentage; });

    return activeCats.map(cat => {
      const targetPct = targetMap[cat.name] ?? (historicalMix[cat.name] || 0);
      const requiredDeals = Math.ceil((companyDealGoal * targetPct) / 100);
      const currentClosed = closedBreakdown.find(b => b.source === cat.name)?.count || 0;
      const gap = Math.max(0, requiredDeals - currentClosed);
      return { source: cat.name, historicalPct: historicalMix[cat.name] || 0, targetPct, requiredDeals, currentClosed, gap };
    });
  }, [categories, sourceTargets, historicalMix, companyDealGoal, closedBreakdown]);

  // ── Add deal ──
  const handleAddDeal = async () => {
    if (!user || !newDeal.source_category) return;
    setSaving(true);
    const { error } = await supabase.from('deal_sources').insert({
      agent_id: user.id,
      deal_address: newDeal.deal_address || null,
      deal_type: newDeal.deal_type,
      status: newDeal.status,
      source_category: newDeal.source_category,
      source_notes: newDeal.source_notes || null,
      gci: newDeal.gci || 0,
      close_date: newDeal.close_date || null,
    } as any);
    setSaving(false);
    if (error) { toast.error('Failed to add deal source'); console.error(error); }
    else {
      toast.success('Deal source added');
      setAddOpen(false);
      setNewDeal({ deal_address: '', deal_type: 'unknown', status: 'pending', source_category: '', source_notes: '', gci: 0, close_date: '' });
      fetchAll();
    }
  };

  // ── Add category ──
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    const maxOrder = Math.max(0, ...categories.map(c => c.sort_order));
    const { error } = await supabase.from('deal_source_categories').insert({ name: newCatName.trim(), sort_order: maxOrder + 1 } as any);
    if (error) toast.error('Failed to add category');
    else { toast.success('Category added'); setNewCatName(''); fetchAll(); }
  };

  const toggleCategory = async (id: string, active: boolean) => {
    await supabase.from('deal_source_categories').update({ is_active: !active } as any).eq('id', id);
    fetchAll();
  };

  // ── Save targets ──
  const handleSaveTargets = async () => {
    if (!user) return;
    setSaving(true);
    for (const cat of categories.filter(c => c.is_active)) {
      const pct = targetDraft[cat.name] ?? 0;
      await supabase.from('deal_source_targets').upsert({
        year: CURRENT_YEAR,
        source_category: cat.name,
        target_percentage: pct,
        created_by: user.id,
      } as any, { onConflict: 'year,source_category' });
    }
    setSaving(false);
    toast.success('Targets saved');
    setEditingTargets(false);
    fetchAll();
  };

  // Init target draft
  useEffect(() => {
    const draft: Record<string, number> = {};
    categories.filter(c => c.is_active).forEach(cat => {
      const existing = sourceTargets.find(t => t.source_category === cat.name);
      draft[cat.name] = existing ? existing.target_percentage : (historicalMix[cat.name] || 0);
    });
    setTargetDraft(draft);
  }, [categories, sourceTargets, historicalMix]);

  // Unique agents for filter
  const agentOptions = useMemo(() => {
    const ids = [...new Set(dealSources.map(d => d.agent_id))];
    return ids.map(id => ({ id, name: profiles.get(id) || 'Unknown' }));
  }, [dealSources, profiles]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>;

  const missingPct = dealSources.length > 0 ? Math.round((missingSource.length / dealSources.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Date Range</Label>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ytd">YTD</SelectItem>
              <SelectItem value="q1">Q1</SelectItem>
              <SelectItem value="q2">Q2</SelectItem>
              <SelectItem value="q3">Q3</SelectItem>
              <SelectItem value="q4">Q4</SelectItem>
              <SelectItem value="last12">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[110px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="listing">Listing</SelectItem>
              <SelectItem value="buyer">Buyer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isAdmin && !agentFilter && (
          <div className="space-y-1">
            <Label className="text-xs">Agent</Label>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-[150px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agentOptions.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gold hover:bg-gold/90 text-primary-foreground h-8">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Deal Source
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Deal Source</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Source Category *</Label>
                  <Select value={newDeal.source_category} onValueChange={v => setNewDeal(p => ({ ...p, source_category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.is_active).map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Deal Type</Label>
                    <Select value={newDeal.deal_type} onValueChange={v => setNewDeal(p => ({ ...p, deal_type: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="listing">Listing</SelectItem>
                        <SelectItem value="buyer">Buyer</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={newDeal.status} onValueChange={v => setNewDeal(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                        <SelectItem value="lost">Lost</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input value={newDeal.deal_address} onChange={e => setNewDeal(p => ({ ...p, deal_address: e.target.value }))} placeholder="Property address..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">GCI ($)</Label>
                    <Input type="number" value={newDeal.gci} onChange={e => setNewDeal(p => ({ ...p, gci: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Close Date</Label>
                    <Input type="date" value={newDeal.close_date} onChange={e => setNewDeal(p => ({ ...p, close_date: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Input value={newDeal.source_notes} onChange={e => setNewDeal(p => ({ ...p, source_notes: e.target.value }))} placeholder="Optional notes..." />
                </div>
                <Button onClick={handleAddDeal} disabled={saving || !newDeal.source_category} className="w-full bg-gold hover:bg-gold/90 text-primary-foreground">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Deal Source
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {isAdmin && (
            <Dialog open={catOpen} onOpenChange={setCatOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-8">
                  <Settings className="h-3.5 w-3.5 mr-1" /> Manage Sources
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Manage Source Categories</DialogTitle></DialogHeader>
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {categories.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded border border-border">
                      <span className={`text-sm ${!c.is_active ? 'line-through text-muted-foreground' : ''}`}>{c.name}</span>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleCategory(c.id, c.is_active)}>
                        {c.is_active ? 'Disable' : 'Enable'}
                      </Button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="New category name..." className="h-8" />
                    <Button size="sm" onClick={handleAddCategory} className="h-8 bg-gold hover:bg-gold/90 text-primary-foreground">Add</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Missing Source Health */}
      <Card className={`border-border ${missingSource.length > 0 ? 'border-amber-500/30' : ''}`}>
        <CardContent className="py-3 flex items-center gap-3">
          <AlertTriangle className={`h-4 w-4 ${missingSource.length > 0 ? 'text-amber-500' : 'text-green-500'}`} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {missingSource.length > 0
                ? `${missingSource.length} deal(s) missing source attribution (${missingPct}%)`
                : 'All deals have source attribution ✓'}
            </p>
          </div>
          {missingSource.length > 0 && (
            <Badge variant="outline" className="text-amber-500 border-amber-500/30">{missingPct}% missing</Badge>
          )}
        </CardContent>
      </Card>

      {/* Closed Source Breakdown */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PieChart className="h-4 w-4 text-gold" /> Closed Deals — Source Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {closedBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No closed deals with source attribution in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Closed Deals</TableHead>
                    <TableHead className="text-right">% of Closed</TableHead>
                    <TableHead className="text-right">Total GCI</TableHead>
                    <TableHead className="text-right">Avg GCI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedBreakdown.map(r => (
                    <TableRow key={r.source}>
                      <TableCell className="font-medium">{r.source}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right">{r.pct}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.gci)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.avgGci)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Source Breakdown */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PieChart className="h-4 w-4 text-amber-500" /> Pending Pipeline — Source Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No pending deals with source attribution.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Pending Deals</TableHead>
                    <TableHead className="text-right">% of Pending</TableHead>
                    <TableHead className="text-right">Pending GCI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingBreakdown.map(r => (
                    <TableRow key={r.source}>
                      <TableCell className="font-medium">{r.source}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                      <TableCell className="text-right">{r.pct}%</TableCell>
                      <TableCell className="text-right">{formatCurrency(r.gci)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Source Targets & Gap Analysis */}
      <Card className="border-border">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-gold" /> Source Targets vs Actual (Goal: {companyDealGoal} deals)
          </CardTitle>
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingTargets(!editingTargets)}>
              {editingTargets ? 'Cancel' : 'Edit Targets'}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Historical %</TableHead>
                  <TableHead className="text-right">Target %</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">YTD Closed</TableHead>
                  <TableHead className="text-right">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceGaps.map(sg => (
                  <TableRow key={sg.source}>
                    <TableCell className="font-medium">{sg.source}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{sg.historicalPct}%</TableCell>
                    <TableCell className="text-right">
                      {editingTargets ? (
                        <Input
                          type="number"
                          className="h-7 w-16 text-right ml-auto"
                          value={targetDraft[sg.source] ?? sg.targetPct}
                          onChange={e => setTargetDraft(p => ({ ...p, [sg.source]: Number(e.target.value) }))}
                        />
                      ) : (
                        `${sg.targetPct}%`
                      )}
                    </TableCell>
                    <TableCell className="text-right">{sg.requiredDeals}</TableCell>
                    <TableCell className="text-right">{sg.currentClosed}</TableCell>
                    <TableCell className="text-right">
                      <span className={sg.gap > 0 ? 'text-destructive font-semibold' : 'text-green-500'}>
                        {sg.gap > 0 ? sg.gap : '✓'}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {sourceGaps.length > 0 && (
                  <TableRow className="border-t-2 font-bold">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">—</TableCell>
                    <TableCell className="text-right">
                      {editingTargets
                        ? `${Object.values(targetDraft).reduce((s, v) => s + v, 0)}%`
                        : `${sourceGaps.reduce((s, g) => s + g.targetPct, 0)}%`}
                    </TableCell>
                    <TableCell className="text-right">{sourceGaps.reduce((s, g) => s + g.requiredDeals, 0)}</TableCell>
                    <TableCell className="text-right">{sourceGaps.reduce((s, g) => s + g.currentClosed, 0)}</TableCell>
                    <TableCell className="text-right">{sourceGaps.reduce((s, g) => s + g.gap, 0)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {editingTargets && (
            <Button onClick={handleSaveTargets} disabled={saving} className="mt-3 bg-gold hover:bg-gold/90 text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Save Targets
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ── Helper ──
function buildBreakdown(deals: DealSource[], categories: SourceCategory[]): SourceBreakdownRow[] {
  const total = deals.length || 1;
  const map: Record<string, { count: number; gci: number }> = {};
  deals.forEach(d => {
    const src = d.source_category || 'Uncategorized';
    if (!map[src]) map[src] = { count: 0, gci: 0 };
    map[src].count++;
    map[src].gci += Number(d.gci || 0);
  });
  return Object.entries(map)
    .map(([source, { count, gci }]) => ({
      source,
      count,
      pct: Math.round((count / total) * 100),
      gci,
      avgGci: count > 0 ? Math.round(gci / count) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export default DealSourcesTab;
