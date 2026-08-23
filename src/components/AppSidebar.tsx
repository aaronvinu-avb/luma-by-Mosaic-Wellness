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
} from "lucide-react";
import { LumaLogo } from '@/components/LumaLogo';
import { NavLink } from '@/components/NavLink';
import { ThemeToggle } from "@/components/ThemeToggle";
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchMarketingData } from '@/lib/prefetchMarketingData';
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

// ── Nav definition ────────────────────────────────────────────────────────────

type NavItem = {
  title: string;
  url: string;
  icon: React.ElementType;
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
      { title: 'Current Mix',     url: '/optimizer/current-mix', icon: Sliders     },
      { title: 'Diagnosis',       url: '/optimizer/diagnosis',   icon: Stethoscope },
      { title: 'Recommended Mix', url: '/optimizer/recommended', icon: Sparkles    },
      { title: 'Why It Works',    url: '/optimizer/why',         icon: HelpCircle  },
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

// ── Component ─────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location  = useLocation();
  const queryClient = useQueryClient();
  const warmMarketingCache = () => {
    void prefetchMarketingData(queryClient);
  };

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
        paddingBottom: 72,
      }}>

        {/* ── Brand Header ─────────────────────────────────────────────── */}
        <SidebarHeader style={{ padding: '22px 18px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <LumaLogo scale={1.0} showWordmark={true} />
          </div>
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
          <div style={{
            margin: '18px 0 0',
            height: 1,
            background: 'linear-gradient(90deg, var(--border-strong) 0%, transparent 85%)',
          }} />
        </SidebarHeader>

        {/* ── Navigation groups ─────────────────────────────────────────── */}
        <div style={{ flex: 1, paddingTop: 6 }}>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label} style={{ padding: '0 10px' }}>

              {/* Section label */}
              {!collapsed && (
                <p style={{
                  fontFamily: 'Outfit',
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  padding: '18px 8px 5px',
                  lineHeight: 1,
                }}>
                  {group.label}
                </p>
              )}

              <SidebarGroupContent>
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
                            onMouseEnter={warmMarketingCache}
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
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>
      </SidebarContent>

      {/* ── Footer: user account ──────────────────────────────────────────── */}
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

        <div style={{ flexShrink: 0 }}>
          <ThemeToggle />
        </div>
      </div>
    </Sidebar>
  );
}
