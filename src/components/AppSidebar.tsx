import { 
  LayoutDashboard, 
  Phone, 
  Building2, 
  DollarSign, 
  Target,
  LogOut,
  ClipboardList,
  FileText,
  Shield,
  Library,
  SendHorizonal,
  Key
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const menuItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Submissions', url: '/dashboard/submissions', icon: SendHorizonal },
  { title: 'Activities', url: '/dashboard/activities', icon: Phone },
  { title: 'Pipeline', url: '/dashboard/pipeline', icon: Building2 },
  { title: 'Transactions', url: '/dashboard/commissions', icon: DollarSign },
  { title: 'Goals', url: '/dashboard/goals', icon: Target },
  { title: '4-1-1', url: '/dashboard/411', icon: ClipboardList },
  { title: 'Reports', url: '/dashboard/reports', icon: FileText },
  { title: 'Library', url: '/dashboard/library', icon: Library },
];

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const { isAdmin, isOwner } = useUserRole();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  return (
    <Sidebar className="border-r border-gold/10 bg-sidebar">
      <SidebarHeader className="border-b border-gold/10 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-gold flex items-center justify-center">
            <Building2 className="h-6 w-6 text-gold-foreground" />
          </div>
          {!collapsed && (
            <div>
              <h1 className="font-display text-lg font-semibold text-foreground">RealtyHub</h1>
              <p className="text-xs text-muted-foreground">Agent Portal</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-gold/70 uppercase text-xs tracking-wider">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      end={item.url === '/dashboard'}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-gold/10 hover:text-gold transition-colors"
                      activeClassName="bg-gold/20 text-gold font-medium"
                    >
                      <item.icon className="h-5 w-5" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="https://leasewithluxe.lovable.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-gold/10 hover:text-gold transition-colors"
                  >
                    <Key className="h-5 w-5" />
                    {!collapsed && <span>LeaseWithLuxe</span>}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-blue-500/70 uppercase text-xs tracking-wider">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to="/dashboard/admin" 
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 transition-colors"
                      activeClassName="bg-blue-500/20 text-blue-500 font-medium"
                    >
                      <Shield className="h-5 w-5" />
                      {!collapsed && <span>Company Dashboard</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-gold/10 p-4">
        {!collapsed && user && (
          <div className="mb-3 px-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {user.user_metadata?.full_name || user.email}
              </p>
              {isOwner && (
                <Badge variant="outline" className="text-[10px] border-gold text-gold px-1">
                  Owner
                </Badge>
              )}
              {isAdmin && !isOwner && (
                <Badge variant="outline" className="text-[10px] border-blue-500 text-blue-500 px-1">
                  Admin
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}
        <Button 
          variant="ghost" 
          onClick={signOut}
          className="w-full justify-start text-muted-foreground hover:text-gold hover:bg-gold/10"
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span className="ml-3">Sign Out</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}