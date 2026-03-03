import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { ViewAsAgentProvider, useViewAsAgent } from '@/hooks/useViewAsAgent';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Eye } from 'lucide-react';

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
    <div className="flex items-center gap-3 ml-auto">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-muted-foreground" />
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
          <SelectTrigger className="w-[180px] h-8 text-xs">
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

const ViewAsAgentBanner = () => {
  const { isViewingAsAgent, viewingAgentName } = useViewAsAgent();
  if (!isViewingAsAgent || !viewingAgentName) return null;

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-4 py-1.5 text-center">
      <span className="text-xs font-medium text-primary">
        <Eye className="h-3 w-3 inline mr-1.5 -mt-0.5" />
        Viewing as: {viewingAgentName}
        <span className="text-muted-foreground ml-2">(Read-only)</span>
      </span>
    </div>
  );
};

const DashboardLayout = () => {
  return (
    <ViewAsAgentProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <main className="flex-1 flex flex-col">
            <header className="h-14 border-b border-gold/10 flex items-center px-4 bg-background/50 backdrop-blur sticky top-0 z-10">
              <SidebarTrigger className="text-muted-foreground hover:text-gold" />
              <div className="ml-4">
                <h2 className="font-display text-lg text-foreground">Agent Dashboard</h2>
              </div>
              <ViewAsAgentControls />
            </header>
            <ViewAsAgentBanner />
            <div className="flex-1 p-6">
              <Outlet />
            </div>
          </main>
        </div>
      </SidebarProvider>
    </ViewAsAgentProvider>
  );
};

export default DashboardLayout;
