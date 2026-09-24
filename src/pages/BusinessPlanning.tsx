import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHasFUB } from '@/hooks/useHasFUB';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { useTenant } from '@/hooks/useTenant';
import { CalendarClock, Loader2 } from 'lucide-react';
import {
  PLAN_YEAR, DEFAULT_SETTINGS, PlanningSettings, GoalStatus, countdown, formatDeadline, formatSessionDate, lockTime,
} from '@/lib/planning2027';
import { AgentPlanner } from '@/components/planning2027/AgentPlanner';
import { AgentPlanDetail } from '@/components/planning2027/AgentPlanDetail';
import { AdminPlanningOverview } from '@/components/planning2027/AdminPlanningOverview';
import { PlanningSettingsDialog } from '@/components/planning2027/PlanningSettingsDialog';
import { StatusBadge } from '@/components/planning2027/StatusBadge';

const BusinessPlanning = () => {
  const { user } = useAuth();
  const { hasFUB } = useHasFUB();
  const { isAdmin, isStrictOwner } = useUserRole();
  const { effectiveFubUserId, isViewingAsAgent, viewingAgentId, viewingAgentName } = useViewAsAgent();
  const tenant = useTenant();
  const orgId = tenant.orgId;
  const admin = isAdmin || isStrictOwner;

  const [settings, setSettings] = useState<PlanningSettings | null>(null);
  const [status, setStatus] = useState<GoalStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase.from('planning_settings').select('*').eq('plan_year', PLAN_YEAR).maybeSingle();
    setSettings(data ? { ...DEFAULT_SETTINGS, ...(data as any) } : DEFAULT_SETTINGS);
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);

  if (!settings || !user) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  const pastDeadline = now > new Date(lockTime(settings)).getTime();
  const draftPast = now > new Date(settings.submission_deadline).getTime();
  const companyView = admin && !isViewingAsAgent;
  const reviewingAgent = admin && isViewingAsAgent && viewingAgentId;

  return (
    <div className="space-y-6 max-w-6xl min-w-0">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-bold text-foreground">{PLAN_YEAR} Business Planning</h1>
            {companyView && <p className="text-sm text-muted-foreground">Viewing: Company</p>}
            {reviewingAgent && <p className="text-sm text-gold">Viewing: {viewingAgentName}</p>}
          </div>
          {!companyView && !reviewingAgent && <StatusBadge status={status ?? 'draft'} />}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gold/50 bg-gold/5 px-4 py-3">
          <CalendarClock className="h-5 w-5 text-gold shrink-0" />
          <span className="font-semibold text-foreground">
            Draft due {formatSessionDate(new Date(settings.submission_deadline).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }))} · Final at the session {formatSessionDate(settings.planning_session_date)}
          </span>
          <span className="text-sm text-muted-foreground">
            {!draftPast
              ? `Draft: ${countdown(settings.submission_deadline, now)} (${formatDeadline(settings.submission_deadline)})`
              : !pastDeadline
                ? `Draft deadline passed — goals lock ${formatDeadline(lockTime(settings))}`
                : 'Goals locked'} · Toronto time
          </span>
        </div>
      </div>

      {companyView ? (
        <AdminPlanningOverview settings={settings} onOpenSettings={() => setSettingsOpen(true)} />
      ) : reviewingAgent ? (
        <AgentPlanDetail agentId={viewingAgentId!} agentName={viewingAgentName ?? 'Agent'} canReview />
      ) : (
        <AgentPlanner
          agentId={user.id} fubUserId={effectiveFubUserId} hasFUB={hasFUB} agentName={null}
          settings={settings} pastDeadline={pastDeadline} onStatus={setStatus} canRegenerate={admin}
        />
      )}

      {admin && (
        <PlanningSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} orgId={orgId} settings={settings} onSaved={loadSettings} />
      )}
    </div>
  );
};

export default BusinessPlanning;
