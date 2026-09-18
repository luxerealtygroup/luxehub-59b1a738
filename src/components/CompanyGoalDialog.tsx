import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/** Measured funnel rates offered as suggestions — null when unreliable. */
export interface FunnelSuggestions {
  contact_to_pipeline_pct?: number | null;
  dials_to_contact_pct?: number | null;
  contact_to_appt_set_pct?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  onSaved?: () => void;
  /** Rate measured from the team's own history, offered as a suggestion only. */
  suggestedConversionPct?: number | null;
  /** Funnel-step rates measured from the team's own weekly records, suggestions only. */
  funnelSuggestions?: FunnelSuggestions;
}

const FUNNEL_FIELDS: { key: keyof FunnelSuggestions; label: string; help: string }[] = [
  { key: 'contact_to_pipeline_pct', label: 'Conversation → pipeline (%)', help: 'Share of conversations that become a new pipeline client.' },
  { key: 'dials_to_contact_pct', label: 'Dial → conversation (%)', help: 'Share of dials that reach a real conversation.' },
  { key: 'contact_to_appt_set_pct', label: 'Conversation → appointment set (%)', help: 'Share of conversations that produce an appointment.' },
];

/** Used when a team has not set its own conversion rate. */
/** Blended rate over everyone entered into the pipeline: 20% convert, 80% fall out. */
const DEFAULT_CONVERSION_PCT = 20;

interface Quarters {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
}

const emptyQuarters: Quarters = { q1: '', q2: '', q3: '', q4: '' };

/**
 * Owner/admin editor for the company (tenant) annual goal.
 * Always scoped to the signed-in person's own team.
 */
const CompanyGoalDialog = ({ open, onOpenChange, year, onSaved, suggestedConversionPct, funnelSuggestions }: Props) => {
  const { user } = useAuth();
  const { orgId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [annualDeals, setAnnualDeals] = useState('');
  const [annualGci, setAnnualGci] = useState('');
  const [annualVolume, setAnnualVolume] = useState('');
  const [annualRevenue, setAnnualRevenue] = useState('');
  const [conversionPct, setConversionPct] = useState('');
  const [quarters, setQuarters] = useState<Quarters>(emptyQuarters);
  // Funnel overrides, as typed strings. Blank means "use the measured rate".
  const [funnel, setFunnel] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !orgId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('company_goals')
        .select('*')
        .eq('org_id', orgId)
        .eq('year', year)
        .maybeSingle();

      if (data) {
        setGoalId(data.id);
        setAnnualDeals(String(data.annual_deals_goal ?? ''));
        setAnnualGci(String(data.annual_gci_goal ?? ''));
        setAnnualVolume(String(data.annual_volume_goal ?? ''));
        setAnnualRevenue(String(data.annual_revenue_goal ?? ''));
        setConversionPct(
          data.conversion_rate != null ? String(Math.round(Number(data.conversion_rate) * 1000) / 10) : '',
        );
        const raw = data.monthly_goals as any;
        const q = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw.quarterly : null;
        if (Array.isArray(q)) {
          const next = { ...emptyQuarters };
          q.forEach((entry: { quarter: number; deals: number }) => {
            if (entry.quarter >= 1 && entry.quarter <= 4) {
              (next as any)[`q${entry.quarter}`] = String(entry.deals ?? '');
            }
          });
          setQuarters(next);
        } else {
          setQuarters(emptyQuarters);
        }
        const fa = (data as any).funnel_assumptions;
        const next: Record<string, string> = {};
        if (fa && typeof fa === 'object' && !Array.isArray(fa)) {
          FUNNEL_FIELDS.forEach(f => {
            const v = fa[f.key];
            if (v != null) next[f.key] = String(v);
          });
        }
        setFunnel(next);
      } else {
        setGoalId(null);
        setAnnualDeals('');
        setAnnualGci('');
        setAnnualVolume('');
        setAnnualRevenue('');
        setConversionPct('');
        setQuarters(emptyQuarters);
        setFunnel({});
      }
      setLoading(false);
    };
    load();
  }, [open, orgId, year]);

  const num = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const quarterTotal = num(quarters.q1) + num(quarters.q2) + num(quarters.q3) + num(quarters.q4);
  const anyQuarter = [quarters.q1, quarters.q2, quarters.q3, quarters.q4].some((v) => v.trim() !== '');
  const conversionEntered = conversionPct.trim() !== '';
  const conversionValue = num(conversionPct);
  const conversionValid = !conversionEntered || (conversionValue > 0 && conversionValue <= 100);
  const funnelValid = FUNNEL_FIELDS.every(f => {
    const raw = (funnel[f.key] || '').trim();
    if (raw === '') return true;
    const v = num(raw);
    return v > 0 && v <= 100;
  });

  const handleSave = async () => {
    if (!user || !orgId) return;
    const deals = anyQuarter ? quarterTotal : num(annualDeals);
    if (deals <= 0) {
      toast.error('Enter an annual deal goal, or a per-quarter breakdown.');
      return;
    }
    if (!conversionValid) {
      toast.error('Conversion rate must be between 1 and 100.');
      return;
    }
    if (!funnelValid) {
      toast.error('Funnel rates must be between 1 and 100.');
      return;
    }
    setSaving(true);

    const existing = goalId
      ? (await supabase.from('company_goals').select('monthly_goals').eq('id', goalId).maybeSingle()).data
      : null;
    const rawExisting = existing?.monthly_goals as any;
    const monthly = rawExisting && typeof rawExisting === 'object' && !Array.isArray(rawExisting) ? rawExisting.monthly || [] : Array.isArray(rawExisting) ? rawExisting : [];

    const quarterly = anyQuarter
      ? [1, 2, 3, 4].map((q) => ({ quarter: q, deals: num((quarters as any)[`q${q}`]) }))
      : null;

    // Only the fields the team actually filled in are stored; blanks stay blank
    // so the page keeps labelling them as measured or platform default.
    const funnelPayload: Record<string, number> = {};
    FUNNEL_FIELDS.forEach(f => {
      const raw = (funnel[f.key] || '').trim();
      if (raw !== '') funnelPayload[f.key] = num(raw);
    });

    const payload: Record<string, unknown> = {
      year,
      org_id: orgId,
      annual_deals_goal: deals,
      annual_gci_goal: num(annualGci),
      annual_volume_goal: num(annualVolume),
      annual_revenue_goal: num(annualRevenue),
      monthly_goals: JSON.parse(JSON.stringify(quarterly ? { monthly, quarterly } : { monthly })),
      conversion_rate: conversionEntered ? Math.round((conversionValue / 100) * 10000) / 10000 : null,
      funnel_assumptions: Object.keys(funnelPayload).length ? funnelPayload : null,
      created_by: user.id,
    };

    const { error } = goalId
      ? await supabase.from('company_goals').update(payload).eq('id', goalId)
      : await supabase.from('company_goals').insert(payload as any);

    setSaving(false);
    if (error) {
      console.error(error);
      toast.error('Could not save the company goal.');
      return;
    }
    toast.success('Company goal saved');
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Company goal — {year}</DialogTitle>
          <DialogDescription>
            This goal applies to your team only. Leave the quarterly boxes blank to spread the annual target evenly.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="cg-deals">Annual deal units</Label>
                <Input
                  id="cg-deals"
                  type="number"
                  value={anyQuarter ? String(quarterTotal) : annualDeals}
                  disabled={anyQuarter}
                  onChange={(e) => setAnnualDeals(e.target.value)}
                />
                {anyQuarter && <p className="text-xs text-muted-foreground">Total of the quarters below.</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cg-gci">Annual GCI</Label>
                <Input id="cg-gci" type="number" value={annualGci} onChange={(e) => setAnnualGci(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cg-volume">Annual volume</Label>
                <Input id="cg-volume" type="number" value={annualVolume} onChange={(e) => setAnnualVolume(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cg-revenue">Annual company revenue</Label>
                <Input id="cg-revenue" type="number" value={annualRevenue} onChange={(e) => setAnnualRevenue(e.target.value)} />
              </div>
            </div>

            <div>
              <Label className="text-sm">Per-quarter deal units (optional)</Label>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {(['q1', 'q2', 'q3', 'q4'] as const).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`cg-${key}`} className="text-xs text-muted-foreground uppercase">{key}</Label>
                    <Input
                      id={`cg-${key}`}
                      type="number"
                      value={quarters[key]}
                      onChange={(e) => setQuarters({ ...quarters, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="cg-conversion">Conversion rate (%)</Label>
              <Input
                id="cg-conversion"
                type="number"
                min={1}
                max={100}
                placeholder={String(DEFAULT_CONVERSION_PCT)}
                value={conversionPct}
                onChange={(e) => setConversionPct(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Measured over everyone entered into the pipeline, Leads included — the same population the
                pipeline figure counts.{' '}
                {conversionEntered && conversionValid
                  ? `Fallout ${Math.round((100 - conversionValue) * 10) / 10}%. Used to work out how much pipeline your goal needs.`
                  : `Leave blank to use the platform default of ${DEFAULT_CONVERSION_PCT}% (${100 - DEFAULT_CONVERSION_PCT}% fallout).`}
              </p>
              {!conversionValid && (
                <p className="text-xs text-destructive">Enter a number between 1 and 100.</p>
              )}
              {suggestedConversionPct != null && suggestedConversionPct > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <p className="text-xs text-muted-foreground">
                    Your own history suggests {suggestedConversionPct}% — closed deals this year against everyone
                    entered into the pipeline this year
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => setConversionPct(String(suggestedConversionPct))}
                  >
                    Use this
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompanyGoalDialog;
