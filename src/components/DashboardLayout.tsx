import { Outlet } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';

const DashboardLayout = () => {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-gold/10 flex items-center px-4 bg-background/50 backdrop-blur sticky top-0 z-10">
            <SidebarTrigger className="text-muted-foreground hover:text-gold" />
            <div className="ml-4">
              <h2 className="font-display text-lg text-foreground">Agent Dashboard</h2>
            </div>
          </header>
          <div className="flex-1 p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
