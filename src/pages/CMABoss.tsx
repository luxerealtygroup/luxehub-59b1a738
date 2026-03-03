import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, FileText, Loader2, ArrowLeft, Eye, ClipboardCheck, BarChart3 } from 'lucide-react';
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
  strategy_recommendation: string | null;
  listing_status: string;
}

type ViewMode = 'list' | 'create' | 'audit' | 'report';

const CMABoss = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [reports, setReports] = useState<CMAReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('reports');

  useEffect(() => {
    if (user) fetchReports();
  }, [user]);

  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cma_reports')
      .select('id, property_address, city_area, property_type, analysis_status, cma_grade, pricing_band_recommended, created_at, strategy_recommendation, listing_status')
      .order('created_at', { ascending: false });

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

  const goBack = () => {
    setViewMode('list');
    setSelectedReportId(null);
  };

  if (viewMode === 'create') {
    return (
      <div className="space-y-6">
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

  if (viewMode === 'audit' && selectedReportId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={goBack}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <h1 className="text-2xl font-display font-bold text-foreground">Internal CMA Audit</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode('report')}
            className="border-gold/30 text-gold hover:bg-gold/10"
          >
            <Eye className="h-4 w-4 mr-1" /> Client Report
          </Button>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">CMA Boss</h1>
          <p className="text-sm text-muted-foreground">AI-powered Comparative Market Analysis</p>
        </div>
        <Button onClick={() => setViewMode('create')} className="bg-gold hover:bg-gold/90 text-gold-foreground">
          <Plus className="h-4 w-4 mr-2" /> New CMA
        </Button>
      </div>

      {isAdmin ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="reports">My Reports</TabsTrigger>
            <TabsTrigger value="performance">
              <BarChart3 className="h-4 w-4 mr-1" /> Performance Dashboard
            </TabsTrigger>
          </TabsList>

          <TabsContent value="reports">
            <CMAReportsList reports={reports} loading={loading} onOpen={openAudit} onCreate={() => setViewMode('create')} />
          </TabsContent>

          <TabsContent value="performance">
            <CMAPerformanceDashboard />
          </TabsContent>
        </Tabs>
      ) : (
        <CMAReportsList reports={reports} loading={loading} onOpen={openAudit} onCreate={() => setViewMode('create')} />
      )}
    </div>
  );
};

// Extracted report list component
const CMAReportsList = ({
  reports,
  loading,
  onOpen,
  onCreate,
}: {
  reports: CMAReport[];
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: () => void;
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
            <p className="text-[10px] text-muted-foreground/60 pt-1">
              {new Date(report.created_at).toLocaleDateString()}
            </p>
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
