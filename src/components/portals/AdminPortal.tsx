import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  IndianRupee,
  Layers,
  LogOut,
  MapPin,
  Megaphone,
  Menu,
  Moon,
  Radio,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Store,
  Sun,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import {
  subscribeAdminRealtimeUpdates,
  syncAdminOverviewToFirestore,
  type LiveFirestoreSnapshotStatus,
} from '../../lib/adminFirestoreSync.ts';
import { AdminAiBiSection } from '../admin/AdminAiBiSection.tsx';
import { AdminAlertsSection } from '../admin/AdminAlertsSection.tsx';
import { AdminAnalyticsSection } from '../admin/AdminAnalyticsSection.tsx';
import { AdminCustomersSection } from '../admin/AdminCustomersSection.tsx';
import { AdminFinanceSection } from '../admin/AdminFinanceSection.tsx';
import { AdminLiveOpsSection } from '../admin/AdminLiveOpsSection.tsx';
import { AdminMarketingSection } from '../admin/AdminMarketingSection.tsx';
import { AdminOverviewSection } from '../admin/AdminOverviewSection.tsx';
import { AdminReportsSection } from '../admin/AdminReportsSection.tsx';
import { AdminRidersSection } from '../admin/AdminRidersSection.tsx';
import { AdminSecuritySection } from '../admin/AdminSecuritySection.tsx';
import { AdminServiceAreaSection } from '../admin/AdminServiceAreaSection.tsx';
import { AdminServicesSection } from '../admin/AdminServicesSection.tsx';
import { AdminVendorsSection } from '../admin/AdminVendorsSection.tsx';
import {
  ADMIN_NAV_ITEMS,
  formatInr,
  type AdminOverviewPayload,
  type AdminSectionKey,
  type DateRangePreset,
  type GlobalDateState,
} from '../admin/adminTypes.ts';

const SECTION_ICONS: Record<AdminSectionKey, typeof Activity> = {
  overview: Activity,
  analytics: BarChart3,
  live_ops: Radio,
  finance: IndianRupee,
  customers: Users,
  vendors: Store,
  riders: Truck,
  services: Layers,
  service_area: MapPin,
  marketing: Megaphone,
  ai_bi: Sparkles,
  alerts: Bell,
  security: Shield,
  reports: FileSpreadsheet,
};

interface ConfirmConfig {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
}

export function AdminPortal() {
  const { user, health, logout, setActivePortal, refreshBootstrap, notify } = useApp();

  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<AdminSectionKey>('overview');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fyoora-admin-theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [dateState, setDateState] = useState<GlobalDateState>({
    preset: 'all',
    startDate: '',
    endDate: '',
  });
  const [serviceFilter, setServiceFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');

  const [globalQuery, setGlobalQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmConfig | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [realtimeStatus, setRealtimeStatus] = useState<LiveFirestoreSnapshotStatus>({
    connected: false,
    lastSyncedAt: null,
    activeListeners: 0,
    recentFirestoreOrdersCount: 0,
    dailyAggregatesCount: 0,
    mode: 'api_primary',
  });

  const lastFirestoreMirrorRef = useRef<number>(0);

  // Manage Tailwind .dark class on <html> cleanly only while inside AdminPortal
  useEffect(() => {
    try {
      localStorage.setItem('fyoora-admin-theme', darkMode ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return () => {
      document.documentElement.classList.remove('dark');
    };
  }, [darkMode]);

  const loadOverview = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading((prev) => (data ? prev : true));
      try {
        const params = new URLSearchParams({
          preset: dateState.preset,
          serviceType: serviceFilter,
          paymentMethod: paymentFilter,
        });
        if (dateState.preset === 'custom' && dateState.startDate && dateState.endDate) {
          params.set('startDate', dateState.startDate);
          params.set('endDate', dateState.endDate);
        }
        const res = await apiRequest<AdminOverviewPayload>(`/api/admin/overview?${params.toString()}`);
        setData(res);

        // Mirror aggregates/alerts/docs safely when authenticated with Firebase Admin
        const nowMs = Date.now();
        if (nowMs - lastFirestoreMirrorRef.current > 20_000) {
          lastFirestoreMirrorRef.current = nowMs;
          void syncAdminOverviewToFirestore({
            dailyAggregates: res.dailyAggregates,
            alerts: res.alerts,
            serviceAreas: res.serviceAreas,
            vendors: res.vendors,
            riders: res.riders,
            orders: res.orders,
            campaigns: res.marketingCampaigns,
            auditLogs: res.auditLogs,
          });
        }
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Unable to load admin overview', 'error');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateState.preset, dateState.startDate, dateState.endDate, serviceFilter, paymentFilter]
  );

  const handleFullRefresh = useCallback(async () => {
    await Promise.all([loadOverview({ silent: true }), refreshBootstrap()]);
  }, [loadOverview, refreshBootstrap]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview, user?.id]);

  // Attach real-time Firestore listeners (if signed into verified Firebase Auth) + subtle API polling backup
  useEffect(() => {
    const unsub = subscribeAdminRealtimeUpdates({
      onUpdate: () => {
        void loadOverview({ silent: true });
      },
      onStatusChange: (status) => setRealtimeStatus(status),
    });

    const interval = window.setInterval(() => {
      void loadOverview({ silent: true });
    }, 30_000);

    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [loadOverview]);

  const permittedNav = useMemo(() => {
    if (!data?.permissions?.length) return ADMIN_NAV_ITEMS;
    return ADMIN_NAV_ITEMS.filter((item) => data.permissions.includes(item.key));
  }, [data?.permissions]);

  useEffect(() => {
    if (permittedNav.length > 0 && !permittedNav.some((item) => item.key === section)) {
      setSection(permittedNav[0].key);
    }
  }, [permittedNav, section]);

  const globalResults = useMemo(() => {
    const q = globalQuery.trim().toLowerCase();
    if (!q || !data) return [];
    const results: Array<{ id: string; title: string; subtitle: string; target: AdminSectionKey }> = [];

    for (const nav of permittedNav) {
      if (nav.label.toLowerCase().includes(q) || nav.shortLabel.toLowerCase().includes(q)) {
        results.push({ id: `nav-${nav.key}`, title: nav.label, subtitle: `Section · ${nav.group}`, target: nav.key });
      }
    }
    for (const o of data.orders) {
      if (`${o.orderNumber} ${o.customerName} ${o.vendorName || ''}`.toLowerCase().includes(q)) {
        results.push({
          id: `ord-${o.id}`,
          title: `${o.orderNumber} · ${formatInr(o.pricing.grandTotal)}`,
          subtitle: `Order · ${o.customerName} (${o.status.replace(/_/g, ' ')})`,
          target: 'live_ops',
        });
      }
      if (results.length >= 10) break;
    }
    for (const v of data.vendors) {
      if (`${v.name} ${v.areaName} ${v.serviceCategory}`.toLowerCase().includes(q)) {
        results.push({
          id: `vnd-${v.id}`,
          title: v.name,
          subtitle: `Vendor · ${v.serviceCategory} · ${v.areaName}`,
          target: 'vendors',
        });
      }
      if (results.length >= 12) break;
    }
    for (const c of data.users) {
      if (`${c.fullName} ${c.phone} ${c.email || ''}`.toLowerCase().includes(q)) {
        results.push({
          id: `usr-${c.id}`,
          title: c.fullName,
          subtitle: `Customer · ${c.phone}`,
          target: 'customers',
        });
      }
      if (results.length >= 14) break;
    }
    for (const r of data.riders) {
      if (`${r.fullName} ${r.vehicleNumber}`.toLowerCase().includes(q)) {
        results.push({
          id: `rdr-${r.id}`,
          title: r.fullName,
          subtitle: `Rider · ${r.vehicleNumber}`,
          target: 'riders',
        });
      }
      if (results.length >= 16) break;
    }
    return results.slice(0, 10);
  }, [data, globalQuery, permittedNav]);

  const currentNav = ADMIN_NAV_ITEMS.find((i) => i.key === section) || ADMIN_NAV_ITEMS[0];
  const unacknowledgedAlerts = data ? data.alerts.filter((a) => !a.acknowledged) : [];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#0B0B0D] flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <img
            src="/assets/aistudio/fyoora-lockup-red_72717535.png"
            alt="FYOORA"
            className="h-8 mx-auto object-contain"
          />
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Loading FYOORA Enterprise Super Admin Console...
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#0B0B0D] flex items-center justify-center p-8">
        <div className="bg-white dark:bg-[#171717] border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 max-w-sm text-center space-y-3">
          <div className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
            Unable to load Super Admin Data
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-semibold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div className="space-y-4">
        {/* Brand Row */}
        <div className="flex items-center justify-between px-3 pt-4 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/assets/aistudio/fyoora-app-icon-1024_3e60a0bf.png"
              alt="FYOORA"
              className="w-8 h-8 rounded-lg object-cover shrink-0"
            />
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="font-display font-extrabold text-sm tracking-tight text-[#252525] dark:text-neutral-100 truncate">
                  FYOORA <span className="text-[#E60023]">HQ</span>
                </div>
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                  Vadakara Super Admin
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="hidden lg:inline-flex p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Grouped Navigation */}
        <nav aria-label="Super Admin sections" className="px-2 space-y-4">
          {(['Operations', 'Commerce', 'Growth & Intelligence', 'Governance'] as const).map((group) => {
            const items = permittedNav.filter((i) => i.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="space-y-1">
                {!sidebarCollapsed && (
                  <div className="px-2.5 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                    {group}
                  </div>
                )}
                {items.map((item) => {
                  const Icon = SECTION_ICONS[item.key];
                  const active = section === item.key;
                  const badgeCount =
                    item.key === 'alerts'
                      ? unacknowledgedAlerts.length
                      : item.key === 'live_ops'
                        ? data.liveOps.unassignedOrders.length
                        : 0;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      title={sidebarCollapsed ? item.label : undefined}
                      onClick={() => {
                        setSection(item.key);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs font-semibold transition ${
                        active
                          ? 'bg-[#E60023] text-white'
                          : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800/80'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Icon className="w-4 h-4 shrink-0" />
                        {!sidebarCollapsed && <span className="truncate">{item.shortLabel}</span>}
                      </span>
                      {!sidebarCollapsed && badgeCount > 0 && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                            active ? 'bg-white/20 text-white' : 'bg-[#E60023]/10 text-[#E60023]'
                          }`}
                        >
                          {badgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Sync Indicator Footer */}
      {!sidebarCollapsed && (
        <div className="p-3 m-2 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[11px] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-[#252525] dark:text-neutral-200">
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeStatus.connected ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            {realtimeStatus.connected ? 'Firestore Realtime Live' : 'API Primary Sync'}
          </div>
          <div className="text-neutral-500 dark:text-neutral-400">
            {data.allOrdersCount} total orders indexed
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-[#0B0B0D] text-[#252525] dark:text-neutral-100 flex">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 bg-white dark:bg-[#141417] border-r border-neutral-200 dark:border-neutral-800 sticky top-0 h-screen overflow-y-auto transition-all print:hidden ${
          sidebarCollapsed ? 'w-[68px]' : 'w-60'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] bg-white dark:bg-[#141417] h-full overflow-y-auto z-10 border-r border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              aria-label="Close navigation drawer"
              onClick={() => setMobileNavOpen(false)}
              className="absolute top-3.5 right-3 p-1.5 rounded-lg text-neutral-500"
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Enterprise Navbar */}
        <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#141417]/95 backdrop-blur-xs border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 py-3 print:hidden">
          <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3">
            {/* Left: Hamburger + Breadcrumbs */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                aria-label="Open admin menu"
                onClick={() => setMobileNavOpen(true)}
                className="lg:hidden p-2 rounded-xl border border-neutral-200 dark:border-neutral-700"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="min-w-0">
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  FYOORA HQ / {currentNav.group}
                </div>
                <h1 className="font-display font-bold text-base sm:text-lg text-[#252525] dark:text-neutral-100 truncate">
                  {currentNav.label}
                </h1>
              </div>
            </div>

            {/* Right Toolbar: Global Search + Date Filter + Theme + Notifications + Profile */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Global Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={globalQuery}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => window.setTimeout(() => setSearchOpen(false), 180)}
                  onChange={(e) => {
                    setGlobalQuery(e.target.value);
                    setSearchOpen(true);
                  }}
                  placeholder="Global search (orders, vendors, users)..."
                  aria-label="Global admin search"
                  className="w-44 sm:w-64 pl-8 pr-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs"
                />
                {searchOpen && globalQuery.trim() && (
                  <div className="absolute right-0 mt-1.5 w-80 bg-white dark:bg-[#1C1C21] border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-xl p-2 z-50 space-y-1">
                    {globalResults.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-neutral-500">
                        No matching orders, partners, or sections.
                      </div>
                    ) : (
                      globalResults.map((res) => (
                        <button
                          key={res.id}
                          type="button"
                          onMouseDown={() => {
                            setSection(res.target);
                            setGlobalQuery('');
                            setSearchOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs"
                        >
                          <div className="font-semibold text-[#252525] dark:text-neutral-100">{res.title}</div>
                          <div className="text-[11px] text-neutral-500">{res.subtitle}</div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Global Smart Date Filter */}
              <select
                aria-label="Global date filter"
                value={dateState.preset}
                onChange={(e) =>
                  setDateState((prev) => ({ ...prev, preset: e.target.value as DateRangePreset }))
                }
                className="px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-semibold shrink-0"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>

              {dateState.preset === 'custom' && (
                <div className="flex items-center gap-1">
                  <input
                    type="date"
                    aria-label="Custom start date"
                    value={dateState.startDate}
                    onChange={(e) => setDateState((prev) => ({ ...prev, startDate: e.target.value }))}
                    className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                  />
                  <input
                    type="date"
                    aria-label="Custom end date"
                    value={dateState.endDate}
                    onChange={(e) => setDateState((prev) => ({ ...prev, endDate: e.target.value }))}
                    className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
                  />
                </div>
              )}

              {/* Manual Refresh */}
              <button
                type="button"
                aria-label="Refresh admin dashboard"
                onClick={() => void handleFullRefresh()}
                className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-[#E60023] shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {/* Light / Dark Mode Toggle */}
              <button
                type="button"
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => setDarkMode((d) => !d)}
                className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-[#E60023] shrink-0"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              </button>

              {/* Notification Centre Bell */}
              <div className="relative">
                <button
                  type="button"
                  aria-label="Open notifications centre"
                  onClick={() => {
                    setNotifMenuOpen((o) => !o);
                    setProfileMenuOpen(false);
                  }}
                  className="relative p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-[#E60023] shrink-0"
                >
                  <Bell className="w-3.5 h-3.5" />
                  {unacknowledgedAlerts.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#E60023] text-white text-[9px] font-mono font-bold flex items-center justify-center">
                      {Math.min(9, unacknowledgedAlerts.length)}
                    </span>
                  )}
                </button>
                {notifMenuOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-[#1C1C21] border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-xl p-3 z-50 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">Notification Centre ({unacknowledgedAlerts.length})</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSection('alerts');
                          setNotifMenuOpen(false);
                        }}
                        className="text-[#E60023] font-semibold"
                      >
                        View All
                      </button>
                    </div>
                    {unacknowledgedAlerts.length === 0 ? (
                      <p className="text-neutral-500 py-3 text-center">No unacknowledged operational alerts.</p>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {unacknowledgedAlerts.slice(0, 5).map((alt) => (
                          <button
                            key={alt.id}
                            type="button"
                            onClick={() => {
                              setSection(alt.targetSection as AdminSectionKey);
                              setNotifMenuOpen(false);
                            }}
                            className="w-full text-left p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                          >
                            <div className="font-semibold text-[#252525] dark:text-neutral-100">{alt.title}</div>
                            <div className="text-[11px] text-neutral-500 truncate">{alt.description}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Admin Profile Menu */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setProfileMenuOpen((o) => !o);
                    setNotifMenuOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <span className="max-w-[110px] truncate">{user?.fullName || 'Super Admin'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#1C1C21] border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-xl p-2 z-50 space-y-1 text-xs">
                    <div className="px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
                      <div className="font-bold text-[#252525] dark:text-neutral-100 truncate">
                        {user?.fullName || 'FYOORA Admin'}
                      </div>
                      <div className="text-[10px] uppercase font-mono text-[#E60023]">
                        {user?.role?.replace('_', ' ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setActivePortal('customer');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 font-medium"
                    >
                      Switch to Customer App
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        void logout();
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 text-[#E60023] font-semibold inline-flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" /> Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Active Section Body */}
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
          {section === 'overview' && (
            <AdminOverviewSection data={data} health={health} onNavigate={setSection} />
          )}
          {section === 'analytics' && (
            <AdminAnalyticsSection
              data={data}
              serviceFilter={serviceFilter}
              paymentFilter={paymentFilter}
              onChangeFilters={(next) => {
                if (next.serviceType !== undefined) setServiceFilter(next.serviceType);
                if (next.paymentMethod !== undefined) setPaymentFilter(next.paymentMethod);
              }}
            />
          )}
          {section === 'live_ops' && (
            <AdminLiveOpsSection data={data} onRefresh={handleFullRefresh} notify={notify} />
          )}
          {section === 'finance' && (
            <AdminFinanceSection
              data={data}
              health={health}
              onRefresh={handleFullRefresh}
              notify={notify}
              onConfirmAction={setConfirmModal}
            />
          )}
          {section === 'customers' && (
            <AdminCustomersSection
              data={data}
              onRefresh={handleFullRefresh}
              notify={notify}
              onConfirmAction={setConfirmModal}
            />
          )}
          {section === 'vendors' && (
            <AdminVendorsSection
              data={data}
              onRefresh={handleFullRefresh}
              notify={notify}
              onConfirmAction={setConfirmModal}
            />
          )}
          {section === 'riders' && (
            <AdminRidersSection
              data={data}
              onRefresh={handleFullRefresh}
              notify={notify}
              onConfirmAction={setConfirmModal}
            />
          )}
          {section === 'services' && (
            <AdminServicesSection data={data} onRefresh={handleFullRefresh} notify={notify} />
          )}
          {section === 'service_area' && (
            <AdminServiceAreaSection data={data} onRefresh={handleFullRefresh} notify={notify} />
          )}
          {section === 'marketing' && (
            <AdminMarketingSection data={data} onRefresh={handleFullRefresh} notify={notify} />
          )}
          {section === 'ai_bi' && (
            <AdminAiBiSection
              dateState={dateState}
              geminiConfigured={health?.geminiConfigured}
              notify={notify}
            />
          )}
          {section === 'alerts' && (
            <AdminAlertsSection
              data={data}
              onRefresh={handleFullRefresh}
              onNavigate={setSection}
              notify={notify}
            />
          )}
          {section === 'security' && (
            <AdminSecuritySection
              data={data}
              currentUserRole={user?.role || 'admin'}
              onRefresh={handleFullRefresh}
              notify={notify}
            />
          )}
          {section === 'reports' && (
            <AdminReportsSection data={data} dateState={dateState} notify={notify} />
          )}
        </main>
      </div>

      {/* Confirmation Modal for Sensitive / Destructive Actions */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1C21] border border-neutral-200 dark:border-neutral-700 rounded-2xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
                {confirmModal.title}
              </h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1.5">{confirmModal.body}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmModal(null)}
                className="px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmModal.onConfirm();
                    setConfirmModal(null);
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-semibold"
              >
                {confirmBusy ? 'Processing...' : confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
