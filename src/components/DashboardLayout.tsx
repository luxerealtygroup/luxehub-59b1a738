import { Outlet } from 'react-router-dom';
import { SupportChatWidget } from '@/components/support/SupportChatWidget';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { NotificationsBell } from '@/components/NotificationsBell';
import { SetupBanner } from '@/components/SetupBanner';
import { ViewAsAgentProvider, useViewAsAgent } from '@/hooks/useViewAsAgent';
import { DemoModeProvider, useDemoMode } from '@/hooks/useDemoMode';
import { useUserRole } from '@/hooks/useUserRole';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye, Sparkles } from 'lucide-react';

const ViewAsAgentControls = () => {
  const {
    canViewAsAgent,
    isViewingAsAgent,
    setIsViewingAsAgent,
    viewingAgentId,
    setViewingAgentId,
    agentOptions,
    viewingAgentName,
  } = useViewAsAgent();

  if (!canViewAsAgent) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 ml-auto min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
        <Label htmlFor="view-as-agent" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
          View as Agent
        </Label>
        <Switch
          id="view-as-agent"
          checked={isViewingAsAgent}
          onCheckedChange={setIsViewingAsAgent}
          className="data-[state=checked]:bg-primary"
        />
      </div>
      {isViewingAsAgent && (
        <Select value={viewingAgentId || ''} onValueChange={setViewingAgentId}>
          <SelectTrigger className="w-[150px] sm:w-[180px] max-w-full h-8 text-xs">

            <SelectValue placeholder="Select Agent" />
          </SelectTrigger>
          <SelectContent>
            {agentOptions.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

const DemoModeControls = () => {
  const { isAdmin } = useUserRole();
  const { demoMode, setDemoMode } = useDemoMode();
  if (!isAdmin) return null;
  return (
    <div className="flex items-center gap-2 pl-2 sm:pl-3 sm:ml-1 border-l border-border min-w-0">
      <Sparkles className={`h-4 w-4 ${demoMode ? 'text-gold' : 'text-muted-foreground'}`} />
      <Label htmlFor="demo-mode" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
        Demo Mode
      </Label>
      <Switch
        id="demo-mode"
        checked={demoMode}
        onCheckedChange={setDemoMode}
        className="data-[state=checked]:bg-gold"
      />
    </div>
  );
};

const ViewAsAgentBanner = () => {
  const { isViewingAsAgent, viewingAgentName, canViewAsAgent } = useViewAsAgent();
  const { demoMode } = useDemoMode();

  if (!canViewAsAgent && !demoMode) return null;

  return (
    <div className={`border-b px-4 py-1.5 text-center ${demoMode ? 'bg-gold/10 border-gold/30' : isViewingAsAgent ? 'bg-primary/10 border-primary/20' : 'bg-muted/30 border-border'}`}>
      <span className="text-xs font-medium text-foreground">
        {demoMode ? (
          <><Sparkles className="h-3 w-3 inline mr-1.5 -mt-0.5 text-gold" /><span className="text-gold font-semibold">Demo Mode</span><span className="text-muted-foreground ml-2">Showing example data — not real numbers</span></>
        ) : (
          <><Eye className="h-3 w-3 inline mr-1.5 -mt-0.5" />
          {isViewingAsAgent
            ? <>Viewing: <span className="text-primary font-semibold">Agent ({viewingAgentName})</span><span className="text-muted-foreground ml-2">(Read-only)</span></>
            : <>Viewing: <span className="font-semibold">Company</span></>
          }</>
        )}
      </span>
    </div>
  );
};

const DashboardLayout = () => {
  return (
    <DemoModeProvider>
     <ViewAsAgentProvider>
      <SidebarProvider>
        <div className="min-h-[100dvh] flex w-full max-w-full bg-background">
          <AppSidebar />
          <main className="flex-1 flex flex-col min-w-0 max-w-full">
            <header className="min-h-14 border-b border-gold/10 flex flex-wrap items-center gap-y-1 gap-x-2 px-3 sm:px-4 py-1.5 bg-background/50 backdrop-blur sticky top-0 z-10 pt-[max(0.375rem,env(safe-area-inset-top))]">
              <SidebarTrigger className="text-muted-foreground hover:text-gold shrink-0" />
              <div className="min-w-0">
                <h2 className="font-display text-base sm:text-lg text-foreground truncate">Agent Dashboard</h2>
              </div>
              <ViewAsAgentControls />
              <DemoModeControls />
              <div className="shrink-0">
                <NotificationsBell />
              </div>
            </header>
            <SetupBanner />
            <ViewAsAgentBanner />
            <div className="flex-1 min-w-0 max-w-full p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Outlet />
            </div>

            <SupportChatWidget userType="realtor" />
          </main>
        </div>
      </SidebarProvider>
     </ViewAsAgentProvider>
    </DemoModeProvider>
  );
};

export default DashboardLayout;
