import { 
  LayoutDashboard, 
  Building2, 
  DollarSign, 
  Target,
  LogOut,
  ClipboardList,
  FileText,
  Shield,
  Library,
  SendHorizonal,
  Key,
  Phone,
  ExternalLink,
  Compass,
  Settings,
  ChevronDown,
  BookOpen,
  Home,
  Users,
  Briefcase,
  UserCheck,
  KeyRound
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface MenuItem {
  title: string;
  subtitle?: string;
  url: string;
  icon: React.ElementType;
  external?: boolean;
}

interface MenuSection {
  label: string;
  items: MenuItem[];
  adminOnly?: boolean;
  planningVisible?: boolean;
}

const allSections: MenuSection[] = [
  {
    label: 'Dashboard',
    planningVisible: true,
    items: [
      { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'My Business',
    items: [
      { title: 'Pipeline', url: '/dashboard/pipeline', icon: Building2 },
      { title: 'Transactions', url: '/dashboard/commissions', icon: DollarSign },
    ],
  },
  {
    label: 'Performance',
    planningVisible: true,
    items: [
      { title: 'Activities', url: '/dashboard/activities', icon: Phone },
      { title: '4-1-1', url: '/dashboard/411', icon: ClipboardList },
      { title: 'Goals', url: '/dashboard/goals', icon: Target },
      { title: 'Business Planning', url: '/dashboard/business-planning', icon: Compass },
      { title: 'Reports', url: '/dashboard/reports', icon: FileText },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Submissions', subtitle: 'Paperwork', url: '/dashboard/submissions', icon: SendHorizonal },
    ],
  },
  {
  label: 'Tools',
    items: [
      { title: 'CMA Boss', url: '/dashboard/cma-boss', icon: FileText },
      { title: 'LeaseWithLuxe', url: 'https://leasewithluxe.lovable.app', icon: Key, external: true },
    ],
  },
  {
    label: 'Resources',
    items: [
      { title: 'Library', url: '/dashboard/library', icon: Library },
    ],
  },
];

const agentResourcesItems = [
  { title: 'Listings', url: '/dashboard/resources/listings', icon: Home },
  { title: 'Buyers', url: '/dashboard/resources/buyers', icon: Users },
  { title: 'Commercial', url: '/dashboard/resources/commercial', icon: Briefcase },
  { title: 'Tenants', url: '/dashboard/resources/tenants', icon: UserCheck },
  { title: 'Landlords', url: '/dashboard/resources/landlords', icon: KeyRound },
];

// Planning-only users see only planningVisible sections, and within Performance only Goals, 4-1-1, Reports
const planningPerformanceItems = ['Goals', '4-1-1', 'Reports', 'Business Planning'];

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const { isAdmin, isOwner, isPlanningAccess, isAgent } = useUserRole();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

  const isPlanningOnly = isPlanningAccess && !isAgent;

  const visibleSections = allSections
    .filter(section => {
      if (isPlanningOnly) return section.planningVisible;
      return true;
    })
    .map(section => {
      if (isPlanningOnly && section.label === 'Performance') {
        return {
          ...section,
          items: section.items.filter(item => planningPerformanceItems.includes(item.title)),
        };
      }
      return section;
    });

  return (
    <TooltipProvider delayDuration={300}>
      <Sidebar className="border-r border-gold/10 bg-sidebar">
        <SidebarHeader className="border-b border-gold/10 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-gold flex items-center justify-center shrink-0">
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

        <SidebarContent className="py-2">
          {visibleSections.map((section, idx) => (
            <SidebarGroup key={section.label} className={idx > 0 ? 'pt-1' : ''}>
              {idx > 0 && (
                <div className="mx-3 mb-1 border-t border-gold/5" />
              )}
              <SidebarGroupLabel className="text-gold/60 uppercase text-[10px] font-semibold tracking-[0.12em] px-3 mb-0.5">
                {section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton asChild>
                            {item.external ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-gold/10 hover:text-gold transition-colors"
                              >
                                <item.icon className="h-5 w-5 shrink-0" />
                                {!collapsed && (
                                  <span className="flex items-center gap-2 flex-1">
                                    {item.title}
                                    <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
                                  </span>
                                )}
                              </a>
                            ) : (
                              <NavLink
                                to={item.url}
                                end={item.url === '/dashboard'}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-gold/10 hover:text-gold transition-colors border-l-2 border-transparent"
                                activeClassName="bg-gold/15 text-gold font-medium border-l-2 !border-gold"
                              >
                                <item.icon className="h-5 w-5 shrink-0" />
                                {!collapsed && (
                                  <div className="flex flex-col">
                                    <span>{item.title}</span>
                                    {item.subtitle && (
                                      <span className="text-[10px] text-muted-foreground/60 -mt-0.5">{item.subtitle}</span>
                                    )}
                                  </div>
                                )}
                              </NavLink>
                            )}
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        {collapsed && (
                          <TooltipContent side="right" className="text-xs">
                            <span className="text-muted-foreground">{section.label} ›</span>{' '}
                            <span className="font-medium">{item.title}</span>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {isAdmin && (
            <SidebarGroup className="pt-1">
              <div className="mx-3 mb-1 border-t border-gold/5" />
              <SidebarGroupLabel className="text-blue-500/60 uppercase text-[10px] font-semibold tracking-[0.12em] px-3 mb-0.5">
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to="/dashboard/admin"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 transition-colors border-l-2 border-transparent"
                            activeClassName="bg-blue-500/15 text-blue-500 font-medium border-l-2 !border-blue-500"
                          >
                            <Shield className="h-5 w-5 shrink-0" />
                            {!collapsed && <span>Company Dashboard</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right" className="text-xs">
                          <span className="text-muted-foreground">Admin ›</span>{' '}
                          <span className="font-medium">Company Dashboard</span>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to="/dashboard/admin/business-planning"
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-blue-500/10 hover:text-blue-500 transition-colors border-l-2 border-transparent"
                            activeClassName="bg-blue-500/15 text-blue-500 font-medium border-l-2 !border-blue-500"
                          >
                            <Compass className="h-5 w-5 shrink-0" />
                            {!collapsed && <span>Business Planning</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right" className="text-xs">
                          <span className="text-muted-foreground">Admin ›</span>{' '}
                          <span className="font-medium">Business Planning</span>
                        </TooltipContent>
                      )}
                    </Tooltip>
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
                {isPlanningOnly && (
                  <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500 px-1">
                    Planning
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <NavLink
              to="/dashboard/settings"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-gold/10 hover:text-gold transition-colors text-sm"
              activeClassName="bg-gold/15 text-gold font-medium"
            >
              <Settings className="h-5 w-5 shrink-0" />
              {!collapsed && <span>Settings</span>}
            </NavLink>
            <Button
              variant="ghost"
              onClick={signOut}
              className="w-full justify-start text-muted-foreground hover:text-gold hover:bg-gold/10"
            >
              <LogOut className="h-5 w-5" />
              {!collapsed && <span className="ml-3">Sign Out</span>}
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}
