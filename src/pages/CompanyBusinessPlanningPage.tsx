import { useCallback, useEffect, useState } from 'react';
import { Loader2, Settings, SlidersHorizontal } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import CompanyBusinessPlanning from '@/components/CompanyBusinessPlanning';
import { ClosedFirmSummary } from '@/components/planning2027/ClosedFirmSummary';
import { OwnerCoachingNotes } from '@/components/planning2027/OwnerCoachingNotes';
import { AdminPlanningOverview } from '@/components/planning2027/AdminPlanningOverview';
import { PlanningBanner } from '@/components/planning2027/PlanningBanner';
import { PlanningSettingsDialog } from '@/components/planning2027/PlanningSettingsDialog';
import { useCompanyPlan } from '@/components/planning2027/CompanyPlan';
import { PLAN_YEAR, DEFAULT_SETTINGS, PlanningSettings } from '@/lib/planning2027';

const CompanyBusinessPlanningPage = () => {
  const { orgId } = useTenant();
  const { isAdmin, isStrictOwner } = useUserRole();
  const company = useCompanyPlan();
  const [settings, setSettings] = useState<PlanningSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('team');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const { data } = await supabase.from('planning_settings').select('*').eq('plan_year', PLAN_YEAR).maybeSingle();
    setSettings(data ? { ...DEFAULT_SETTINGS, ...(data as any) } : DEFAULT_SETTINGS);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  if (!settings) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;

  return (
    <div className="space-y-6 max-w-6xl min-w-0">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold text-foreground">Company Business Planning — {PLAN_YEAR}</h1>
            <p className="text-sm text-muted-foreground">Viewing: Company</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {company.row && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setTab('company')}>
                <SlidersHorizontal className="h-4 w-4" />Company Plan settings
              </Button>
            )}
            {(isAdmin || isStrictOwner) && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
                <Settings className="h-4 w-4" />Planning settings
              </Button>
            )}
          </div>
        </div>
        <PlanningBanner settings={settings} now={now} />
      </div>

      <AdminPlanningOverview
        settings={settings} onOpenSettings={() => setOpen(true)} tab={tab} onTab={setTab}
        recap={<div className="space-y-6"><ClosedFirmSummary title="2026 Closed + Firm" /><CompanyBusinessPlanning recap />{company.row && <OwnerCoachingNotes />}</div>}
      />

      <PlanningSettingsDialog open={open} onOpenChange={setOpen} orgId={orgId} settings={settings} onSaved={load} />
    </div>
  );
};

export default CompanyBusinessPlanningPage;
