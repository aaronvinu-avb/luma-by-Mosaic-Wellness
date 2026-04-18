import {
  BarChart3,
  TrendingUp,
  Filter,
  CalendarRange,
  Wallet,
  DollarSign,
  Sun,
  Trophy,
  LayoutDashboard,
  Sliders,
  Stethoscope,
  Sparkles,
  HelpCircle,
  LineChart,
} from "lucide-react";
import { LumaLogo } from '@/components/LumaLogo';
import { NavLink } from '@/components/NavLink';
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation } from 'react-router-dom';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

// ── Nav definition ──────────────────────────────────────────────────────────

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
  indent?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: 'Measurement',
    items: [
      { title: 'Overview',                 url: '/dashboard',  icon: LayoutDashboard },
      { title: 'Channel Performance',      url: '/channels',   icon: BarChart3 },
      { title: 'Traffic Quality Pipeline', url: '/funnel',     icon: Filter },
    ],
  },
  {
    label: 'Strategy',
    items: [
      { title: 'Scenario Planner', url: '/scenarios', icon: CalendarRange },
      { title: 'Budget Tracker',   url: '/budget',    icon: Wallet },
    ],
  },
  {
    label: 'Mix Optimiser',
    items: [
      { title: 'Current Mix',      url: '/optimizer/current-mix', icon: Sliders,     indent: true },
      { title: 'Diagnosis',        url: '/optimizer/diagnosis',   icon: Stethoscope, indent: true },
      { title: 'Recommended Mix',  url: '/optimizer/recommended', icon: Sparkles,    indent: true },
      { title: 'Why It Works',     url: '/optimizer/why',         icon: HelpCircle,  indent: true },
      { title: 'Budget Scenarios', url: '/optimizer/scenarios',   icon: LineChart,   indent: true },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { title: 'Financial Insights', url: '/financials',   icon: DollarSign },
      { title: 'Trend Analysis',     url: '/trends',       icon: TrendingUp },
      { title: 'Daily Digest',       url: '/daily-digest', icon: Sun },
      { title: 'Best Days',          url: '/best-days',    icon: Trophy },
    ],
  },
];

// ── Derived helpers ───────────────────────────────────────────────────────────

/** True when the current route belongs to the Mix Optimiser group */
function isMixOptimizerGroup(pathname: string) {
  return pathname.startsWith('/optimizer');
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location  = useLocation();
  const inOptimizer = isMixOptimizerGroup(location.pathname);

  return (
    <Sidebar className="border-r-0 w-[232px] shadow-2xl">
      <SidebarContent style={{
        backgroundColor: 'var(--bg-root)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        paddingBottom: 72, /* room for footer */
      }}>

        {/* ── Brand Header ────────────────────────────────────────────── */}
        <SidebarHeader style={{ padding: '22px 18px 0', flexShrink: 0 }}>
          {/* Logo row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <LumaLogo scale={1.0} showWordmark={true} />
          </div>

          {/* Byline */}
          <p style={{
            fontFamily: 'Plus Jakarta Sans',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-muted)',
            letterSpacing: '0.025em',
            marginTop: 3,
            marginLeft: 1,
            lineHeight: 1,
          }}>
            by Mosaic Wellness
          </p>

          {/* Separator */}
          <div style={{
            margin: '18px 0 0',
            height: 1,
            background: 'linear-gradient(90deg, var(--border-strong) 0%, transparent 85%)',
          }} />
        </SidebarHeader>

        {/* ── Navigation groups ────────────────────────────────────────── */}
        <div style={{ flex: 1, paddingTop: 6 }}>
          {navGroups.map((group) => {
            const isMixGroup = group.label === 'Mix Optimiser';

            return (
              <SidebarGroup key={group.label} style={{ padding: '0 10px', marginBottom: isMixGroup ? 4 : 0 }}>

                {/* Section label */}
                {!collapsed && (
                  <p style={{
                    fontFamily: 'Outfit',
                    fontSize: 9,
                    fontWeight: 700,
                    color: isMixGroup && inOptimizer ? 'rgba(232,128,58,0.6)' : 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    padding: '18px 8px 5px',
                    lineHeight: 1,
                    transition: 'color 200ms',
                  }}>
                    {group.label}
                  </p>
                )}

                <SidebarGroupContent>
                  {/* Mix Optimiser: wrap children in a grouped rail */}
                  {isMixGroup && !collapsed ? (
                    <div style={{
                      position: 'relative',
                      paddingLeft: 12,
                    }}>
                      {/* Vertical connector rail */}
                      <div style={{
                        position: 'absolute',
                        left: 18,
                        top: 4,
                        bottom: 4,
                        width: 1,
                        backgroundColor: inOptimizer
                          ? 'rgba(232,128,58,0.22)'
                          : 'var(--border-strong)',
                        borderRadius: 1,
                        transition: 'background-color 200ms',
                      }} />

                      <SidebarMenu>
                        {group.items.map((item) => {
                          const isActive = location.pathname === item.url
                            || location.pathname.startsWith(`${item.url}/`);

                          return (
                            <SidebarMenuItem key={item.title}>
                              <SidebarMenuButton asChild>
                                <NavLink
                                  to={item.url}
                                  end={false}
                                  activeClassName=""
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 9px 6px 14px',
                                    borderRadius: 7,
                                    fontSize: 12,
                                    fontFamily: 'Plus Jakarta Sans',
                                    fontWeight: isActive ? 600 : 400,
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                    backgroundColor: isActive ? 'rgba(232,128,58,0.09)' : 'transparent',
                                    textDecoration: 'none',
                                    transition: 'background-color 120ms, color 120ms',
                                    position: 'relative',
                                    marginBottom: 1,
                                    outline: 'none',
                                  }}
                                >
                                  {/* Active left accent tick */}
                                  {isActive && (
                                    <span style={{
                                      position: 'absolute',
                                      left: -1,
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      width: 2,
                                      height: 14,
                                      borderRadius: 2,
                                      backgroundColor: '#E8803A',
                                    }} />
                                  )}
                                  <item.icon style={{
                                    width: 12,
                                    height: 12,
                                    flexShrink: 0,
                                    color: isActive ? '#E8803A' : 'var(--text-muted)',
                                    transition: 'color 120ms',
                                    strokeWidth: 2,
                                  }} />
                                  <span>{item.title}</span>
                                </NavLink>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          );
                        })}
                      </SidebarMenu>
                    </div>
                  ) : (
                    /* Standard nav items (non-Mix groups) */
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const isActive = item.url === '/dashboard'
                          ? location.pathname === '/dashboard'
                          : location.pathname === item.url
                            || location.pathname.startsWith(`${item.url}/`);

                        return (
                          <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild>
                              <NavLink
                                to={item.url}
                                end={item.url === '/dashboard'}
                                activeClassName=""
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 9,
                                  padding: '7px 10px',
                                  borderRadius: 8,
                                  fontSize: 13,
                                  fontFamily: 'Plus Jakarta Sans',
                                  fontWeight: isActive ? 600 : 400,
                                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  backgroundColor: isActive ? 'rgba(232,128,58,0.09)' : 'transparent',
                                  textDecoration: 'none',
                                  transition: 'background-color 120ms, color 120ms',
                                  position: 'relative',
                                  marginBottom: 1,
                                  outline: 'none',
                                }}
                              >
                                {/* Active left accent tick */}
                                {isActive && (
                                  <span style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    width: 2,
                                    height: 16,
                                    borderRadius: 2,
                                    backgroundColor: '#E8803A',
                                  }} />
                                )}
                                <item.icon style={{
                                  width: 14,
                                  height: 14,
                                  flexShrink: 0,
                                  color: isActive ? '#E8803A' : 'var(--text-muted)',
                                  transition: 'color 120ms',
                                  strokeWidth: 1.75,
                                }} />
                                {!collapsed && <span>{item.title}</span>}
                              </NavLink>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  )}
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </div>
      </SidebarContent>

      {/* ── Footer: user account ─────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: '12px 14px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--bg-root)',
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {/* Avatar */}
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2C2A26, #3A3835)',
            border: '1px solid var(--border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{
              fontFamily: 'Outfit',
              fontSize: 10,
              fontWeight: 700,
              color: '#E8803A',
              letterSpacing: '-0.02em',
            }}>
              MW
            </span>
          </div>

          {/* Name + email */}
          {!collapsed && (
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <p style={{
                fontFamily: 'Outfit',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.1,
                margin: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                Admin User
              </p>
              <p style={{
                fontFamily: 'Plus Jakarta Sans',
                fontSize: 10,
                color: 'var(--text-muted)',
                lineHeight: 1.1,
                margin: '2px 0 0',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                admin@mosaic.io
              </p>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <div style={{ flexShrink: 0 }}>
          <ThemeToggle />
        </div>
      </div>
    </Sidebar>
  );
}
