import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useViewAsAgent } from '@/hooks/useViewAsAgent';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Plus, FileText, Loader2, ArrowLeft, Eye, ClipboardCheck, BarChart3, Bug, Pencil } from 'lucide-react';
import CMAInputForm from '@/components/cma/CMAInputForm';
import CMAAuditView from '@/components/cma/CMAAuditView';
import CMAClientReport from '@/components/cma/CMAClientReport';
import CMAPerformanceDashboard from '@/components/cma/CMAPerformanceDashboard';
import { CMAStatusBadge } from '@/components/cma/CMALifecycleStatus';

interface CMAReport {
  id: string;
  property_address: string;
  city_area: string;
  property_type: string;
  analysis_status: string;
  cma_grade: string | null;
  pricing_band_recommended: number | null;
  created_at: string;
  updated_at: string;
  strategy_recommendation: string | null;
  listing_status: string;
  user_id: string;
  version_number: number;
}

type ViewMode = 'list' | 'create' | 'edit' | 'audit' | 'report';

const CMABoss = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const {
    isViewingAsAgent,
    effectiveUserId,
    viewingAgentName,
  } = useViewAsAgent();

  const [reports, setReports] = useState<CMAReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('reports');

  // Determine the query agent ID:
  // - Admin + View-as-Agent → target agent only
  // - Admin + NOT View-as-Agent (Company View) → null (all CMAs)
  // - Non-admin → their own user id
  const queryAgentId = isAdmin
    ? (isViewingAsAgent ? effectiveUserId : null)
    : user?.id || null;

  useEffect(() => {
    if (user) fetchReports();
  }, [user, queryAgentId]);

  const fetchReports = async () => {
    setLoading(true);

    let query = supabase
      .from('cma_reports')
      .select('id, property_address, city_area, property_type, analysis_status, cma_grade, pricing_band_recommended, created_at, updated_at, strategy_recommendation, listing_status, user_id, version_number')
      .order('created_at', { ascending: false });

    // Apply agent-level filter at the DB query level
    if (queryAgentId) {
      query = query.eq('user_id', queryAgentId);
    }
    // If queryAgentId is null (admin Company View), no filter → all CMAs via RLS

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching CMA reports:', error);
      toast.error('Failed to load CMA reports');
    } else {
      setReports(data || []);
    }
    setLoading(false);
  };

  const handleCreated = (reportId: string) => {
    setSelectedReportId(reportId);
    setViewMode('audit');
    fetchReports();
  };

  const openAudit = (id: string) => {
    setSelectedReportId(id);
    setViewMode('audit');
  };

  const openEdit = (id: string) => {
    setSelectedReportId(id);
    setViewMode('edit');
  };

  const goBack = () => {
    setViewMode('list');
    setSelectedReportId(null);
  };

  // Debug panel (admin-only, temporary)
  const DebugCMAScoping = () => {
    return null; // Hidden — re-enable for debugging
    return (
      <Card className="border-destructive/30 bg-destructive/5 mb-4">
        <CardContent className="py-3 text-xs font-mono space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Bug className="h-4 w-4 text-destructive" />
            <span className="font-semibold text-destructive">CMA Scoping Debug (admin only)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1">
            <div>
              <span className="text-muted-foreground">loggedInUserId:</span>{' '}
              <span className="text-foreground">{user?.id?.substring(0, 8)}…</span>
            </div>
            <div>
              <span className="text-muted-foreground">targetAgentId:</span>{' '}
              <span className="text-foreground">{effectiveUserId?.substring(0, 8) || '(self)'}…</span>
            </div>
            <div>
              <span className="text-muted-foreground">isViewAsActive:</span>{' '}
              <Badge variant="outline" className={`text-[10px] ${isViewingAsAgent ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {String(isViewingAsAgent)}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">queryAgentId:</span>{' '}
              <span className="text-foreground font-semibold">
                {queryAgentId ? `${queryAgentId.substring(0, 8)}…` : '(all / Company View)'}
              </span>
            </div>
          </div>
          {isViewingAsAgent && viewingAgentName && (
            <div className="pt-1 text-muted-foreground">
              Viewing as: <span className="text-primary font-semibold">{viewingAgentName}</span> — showing only their CMAs
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (viewMode === 'create') {
    return (
      <div className="space-y-6">
        <DebugCMAScoping />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-display font-bold text-foreground">New CMA Analysis</h1>
        </div>
        <CMAInputForm onCreated={handleCreated} onCancel={goBack} />
      </div>
    );
  }

  if (viewMode === 'edit' && selectedReportId) {
    return (
      <div className="space-y-6">
        <DebugCMAScoping />
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-display font-bold text-foreground">Edit CMA</h1>
        </div>
        <CMAInputForm onCreated={handleCreated} onCancel={goBack} editReportId={selectedReportId} />
      </div>
    );
  }

  if (viewMode === 'audit' && selectedReportId) {
    return (
      <div className="space-y-6">
        <DebugCMAScoping />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-2xl font-display font-bold text-foreground">Internal CMA Audit</h1>
          </div>
          <div className="flex gap-2">
            {!isViewingAsAgent && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(selectedReportId)}
                className="border-gold/30 text-gold hover:bg-gold/10"
              >
                <Pencil className="h-4 w-4 mr-1" /> Edit CMA
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode('report')}
              className="border-gold/30 text-gold hover:bg-gold/10"
            >
              <Eye className="h-4 w-4 mr-1" /> Client Report
            </Button>
          </div>
        </div>
        <CMAAuditView reportId={selectedReportId} />
      </div>
    );
  }

  if (viewMode === 'report' && selectedReportId) {
    return (
      <div className="space-y-6 print:space-y-0">
        <div className="flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-2xl font-display font-bold text-foreground">Client Report</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode('audit')}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            <ClipboardCheck className="h-4 w-4 mr-1" /> Internal Audit
          </Button>
        </div>
        <CMAClientReport reportId={selectedReportId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DebugCMAScoping />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">CMA Boss</h1>
          <p className="text-sm text-muted-foreground">AI-powered Comparative Market Analysis</p>
        </div>
        {/* Only show "New CMA" when NOT viewing as another agent (read-only mode) */}
        {!isViewingAsAgent && (
          <Button onClick={() => setViewMode('create')} className="bg-gold hover:bg-gold/90 text-gold-foreground">
            <Plus className="h-4 w-4 mr-2" /> New CMA
          </Button>
        )}
      </div>

      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="reports">
              {isViewingAsAgent ? `${viewingAgentName}'s Reports` : 'All Reports'}
            </TabsTrigger>
            <TabsTrigger value="performance">
              <BarChart3 className="h-4 w-4 mr-1" /> Performance Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports">
            <CMAReportsList reports={reports} loading={loading} onOpen={openAudit} onEdit={openEdit} onCreate={() => setViewMode('create')} canEdit={!isViewingAsAgent} currentUserId={user?.id} isAdmin={isAdmin} />
          </TabsContent>

          <TabsContent value="performance">
            <CMAPerformanceDashboard />
          </TabsContent>
        </Tabs>
      ) : (
        <CMAReportsList reports={reports} loading={loading} onOpen={openAudit} onEdit={openEdit} onCreate={() => setViewMode('create')} canEdit={true} currentUserId={user?.id} isAdmin={false} />
      )}
    </div>
  );
};

// Extracted report list component
const CMAReportsList = ({
  reports,
  loading,
  onOpen,
  onEdit,
  onCreate,
  canEdit,
  currentUserId,
  isAdmin,
}: {
  reports: CMAReport[];
  loading: boolean;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onCreate: () => void;
  canEdit: boolean;
  currentUserId?: string;
  isAdmin: boolean;
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <Card className="border-gold/20">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">No CMA Reports Yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first AI-powered CMA analysis</p>
          <Button onClick={onCreate} className="bg-gold hover:bg-gold/90 text-gold-foreground">
            <Plus className="h-4 w-4 mr-2" /> Create CMA
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
      {reports.map((report) => (
        <Card
          key={report.id}
          className="border-gold/20 hover:border-gold/40 transition-colors cursor-pointer"
          onClick={() => onOpen(report.id)}
        >
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-base font-medium truncate">{report.property_address}</CardTitle>
              <CMAStatusBadge status={report.listing_status} />
            </div>
            <p className="text-xs text-muted-foreground">{report.city_area} · {report.property_type}</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Analysis</span>
              <StatusBadge status={report.analysis_status} />
            </div>
            {report.cma_grade && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Grade</span>
                <GradeBadge grade={report.cma_grade} />
              </div>
            )}
            {report.pricing_band_recommended && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Recommended</span>
                <span className="text-sm font-medium text-foreground">
                  ${report.pricing_band_recommended.toLocaleString()}
                </span>
              </div>
            )}
            {report.strategy_recommendation && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Strategy</span>
                <span className="text-xs font-medium text-gold">{report.strategy_recommendation}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-1">
              <div className="space-y-0.5">
                <p className="text-[10px] text-muted-foreground/60">
                  Created {new Date(report.created_at).toLocaleDateString()}
                </p>
                {report.updated_at !== report.created_at && (
                  <p className="text-[10px] text-muted-foreground/60">
                    Edited {new Date(report.updated_at).toLocaleDateString()}
                    {report.version_number > 1 && ` · v${report.version_number}`}
                  </p>
                )}
              </div>
              {canEdit && (isAdmin || report.user_id === currentUserId) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-muted-foreground hover:text-gold"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(report.id);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    processing: 'bg-amber-500/20 text-amber-500',
    completed: 'bg-emerald-500/20 text-emerald-500',
    error: 'bg-destructive/20 text-destructive',
  };
  return (
    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${colors[status] || colors.draft}`}>
      {status}
    </span>
  );
};

const GradeBadge = ({ grade }: { grade: string }) => {
  const colors: Record<string, string> = {
    A: 'text-emerald-500',
    B: 'text-green-500',
    C: 'text-amber-500',
    D: 'text-orange-500',
    F: 'text-destructive',
  };
  return (
    <span className={`text-lg font-bold ${colors[grade] || 'text-muted-foreground'}`}>{grade}</span>
  );
};

export default CMABoss;
