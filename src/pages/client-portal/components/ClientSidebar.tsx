import { 
  Home, 
  Building2, 
  FileText, 
  MessageCircle, 
  CheckSquare,
  LogOut,
  ShoppingCart,
  Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';

interface ClientSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  clientName: string | null;
  clientEmail: string;
  onSignOut: () => void;
  hasPurchase: boolean;
  hasSale: boolean;
}

const mainMenuItems = [
  { id: 'overview', title: 'Overview', icon: Home },
  { id: 'tasks', title: 'Tasks', icon: CheckSquare },
  { id: 'documents', title: 'Documents', icon: FileText },
  { id: 'messages', title: 'Messages', icon: MessageCircle },
];

export function ClientSidebar({ 
  activeTab, 
  onTabChange, 
  clientName, 
  clientEmail,
  onSignOut,
  hasPurchase,
  hasSale
}: ClientSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar className="border-r border-primary/10 bg-sidebar">
      <SidebarHeader className="border-b border-primary/10 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground">RealtyHub</h1>
              <p className="text-xs text-muted-foreground">Client Portal</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary/70 uppercase text-xs tracking-wider">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton asChild>
                    <button
                      onClick={() => onTabChange(item.id)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-colors ${
                        activeTab === item.id
                          ? 'bg-primary/20 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-primary/10 hover:text-primary'
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Transactions Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-green-600/70 uppercase text-xs tracking-wider">
            Your Transactions
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {hasPurchase && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <button
                      onClick={() => onTabChange('purchase')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-colors ${
                        activeTab === 'purchase'
                          ? 'bg-green-500/20 text-green-600 font-medium'
                          : 'text-muted-foreground hover:bg-green-500/10 hover:text-green-600'
                      }`}
                    >
                      <ShoppingCart className="h-5 w-5" />
                      {!collapsed && <span>Your Purchase</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {hasSale && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <button
                      onClick={() => onTabChange('sale')}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full text-left transition-colors ${
                        activeTab === 'sale'
                          ? 'bg-blue-500/20 text-blue-600 font-medium'
                          : 'text-muted-foreground hover:bg-blue-500/10 hover:text-blue-600'
                      }`}
                    >
                      <Tag className="h-5 w-5" />
                      {!collapsed && <span>Your Sale</span>}
                    </button>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {!hasPurchase && !hasSale && (
                <SidebarMenuItem>
                  <div className={`flex items-center gap-3 px-3 py-2 text-muted-foreground/50 ${collapsed ? 'justify-center' : ''}`}>
                    <Home className="h-5 w-5" />
                    {!collapsed && <span className="text-sm">No active transactions</span>}
                  </div>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-primary/10 p-4">
        {!collapsed && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-foreground truncate">
              {clientName || 'Client'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{clientEmail}</p>
          </div>
        )}
        <Button 
          variant="ghost" 
          onClick={onSignOut}
          className="w-full justify-start text-muted-foreground hover:text-primary hover:bg-primary/10"
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span className="ml-3">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
