import type {
  AdminDailyAggregate,
  AdminSectionKey,
  AdminServiceKey,
  AdminStaffMember,
  AuditLog,
  Coupon,
  FeatureSuggestion,
  MarketingCampaign,
  OperatingExpenseRecord,
  Order,
  PartnerApplication,
  PaymentTransaction,
  PlatformServiceConfig,
  Product,
  PromotionalBanner,
  ReferralSettings,
  ReviewRecord,
  RiderProfile,
  ServiceAreaConfig,
  SettlementRecord,
  SupportTicket,
  UserProfile,
  Vendor,
} from '../../shared/types.ts';
import type {
  CustomerAnalyticsItem,
  DateRangePreset,
  KpiMetric,
  LiveActivityEvent,
  OperationalAlert,
  RevenueSeriesPoint,
  RiderAnalyticsItem,
  ServiceAnalyticsItem,
  VendorAnalyticsItem,
} from '../../shared/adminAnalytics.ts';
import { getStoredToken } from '../../lib/api.ts';

export type { AdminSectionKey, DateRangePreset };

export type ChartMode = 'line' | 'bar' | 'area' | 'pie' | 'donut';

export interface AdminCustomerRow {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  accountStatus: UserProfile['accountStatus'];
  profileCompleted: boolean;
  loyaltyPoints: number;
  createdAt: string;
}

export interface AdminOverviewPayload {
  permissions: AdminSectionKey[];
  stats: {
    totalOrders: number;
    grossSales: number;
    totalCommission: number;
    deliveryRevenue: number;
    platformFees: number;
    totalTips: number;
    netOperatingRevenue: number;
    totalCustomers: number;
    totalVendors: number;
    activeRiders: number;
    pendingOrders: number;
    completedDeliveries: number;
    cancelledOrders: number;
    lifetimePaidOrders: number;
  };
  executive: {
    window: {
      preset: DateRangePreset;
      startMs: number | null;
      endMs: number | null;
      prevStartMs: number | null;
      prevEndMs: number | null;
      label: string;
      prevLabel: string;
    };
    financialKpis: KpiMetric[];
    operationsKpis: KpiMetric[];
    summary: {
      gmv: number;
      netPlatformRevenue: number;
      vendorCommissions: number;
      deliveryRevenue: number;
      deliveryExpenses: number;
      platformFees: number;
      riderTips: number;
      refunds: number;
      gatewayFees: number;
      totalOperatingExpenses: number;
      estimatedNetProfit: number;
    };
    counts: {
      totalOrders: number;
      newOrders: number;
      processingOrders: number;
      completedOrders: number;
      cancelledOrders: number;
      pendingOrders: number;
      activeVendors: number;
      activeRestaurants: number;
      activeRiders: number;
      onlineRiders: number;
      registeredCustomers: number;
      newCustomers: number;
    };
  };
  analytics: {
    revenueDaily: RevenueSeriesPoint[];
    revenueWeekly: RevenueSeriesPoint[];
    revenueMonthly: RevenueSeriesPoint[];
    revenueYearly: RevenueSeriesPoint[];
    orders: {
      byHour: Array<{ label: string; orders: number; gmv: number }>;
      byWeekday: Array<{ label: string; orders: number; gmv: number }>;
      byMonth: Array<{ label: string; orders: number; completed: number; cancelled: number; gmv: number }>;
      statusDistribution: Array<{ label: string; status: string; count: number }>;
      avgOrderValue: number;
      avgPrepTimeMins: number | null;
      avgDeliveryTimeMins: number | null;
    };
    customers: {
      items: CustomerAnalyticsItem[];
      totals: {
        totalCustomers: number;
        newCustomersCount: number;
        returningCustomersCount: number;
        highValueCount: number;
        inactiveCount: number;
        atRiskCount: number;
        repeatPurchaseRatePct: number;
        avgLtv: number;
      };
    };
    vendors: VendorAnalyticsItem[];
    riders: RiderAnalyticsItem[];
    services: ServiceAnalyticsItem[];
    coupons: Array<{
      coupon: Coupon;
      redemptions: number;
      totalDiscountGiven: number;
      attributedGmv: number;
    }>;
  };
  liveOps: {
    incomingOrders: Order[];
    awaitingVendor: Order[];
    beingPrepared: Order[];
    awaitingRiders: Order[];
    activeDeliveries: Order[];
    delayedDeliveries: Order[];
    failedDeliveries: Order[];
    unassignedOrders: Order[];
    onlineRiders: RiderProfile[];
    offlineRiders: RiderProfile[];
    availableRiders: RiderProfile[];
    activityFeed: LiveActivityEvent[];
  };
  alerts: OperationalAlert[];
  dailyAggregates: AdminDailyAggregate[];
  users: AdminCustomerRow[];
  vendors: Vendor[];
  products: Product[];
  riders: RiderProfile[];
  orders: Order[];
  allOrdersCount: number;
  coupons: Coupon[];
  banners: PromotionalBanner[];
  serviceAreas: ServiceAreaConfig[];
  serviceConfigs: PlatformServiceConfig[];
  settlements: SettlementRecord[];
  paymentTransactions: PaymentTransaction[];
  expenses: OperatingExpenseRecord[];
  marketingCampaigns: MarketingCampaign[];
  referralSettings: ReferralSettings;
  supportTickets: SupportTicket[];
  featureSuggestions: FeatureSuggestion[];
  reviews: ReviewRecord[];
  partnerApplications: PartnerApplication[];
  adminStaff: AdminStaffMember[];
  auditLogs: AuditLog[];
}

export interface GlobalDateState {
  preset: DateRangePreset;
  startDate: string;
  endDate: string;
}

export interface AdminNavItem {
  key: AdminSectionKey;
  label: string;
  shortLabel: string;
  group: 'Operations' | 'Commerce' | 'Growth & Intelligence' | 'Governance';
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: 'overview', label: 'Executive Overview', shortLabel: 'Overview', group: 'Operations' },
  { key: 'analytics', label: 'Analytics & BI', shortLabel: 'Analytics', group: 'Operations' },
  { key: 'live_ops', label: 'Live Operations', shortLabel: 'Live Ops', group: 'Operations' },
  { key: 'finance', label: 'Financial Control', shortLabel: 'Finance', group: 'Commerce' },
  { key: 'customers', label: 'Customers', shortLabel: 'Customers', group: 'Commerce' },
  { key: 'vendors', label: 'Vendors & Inventory', shortLabel: 'Vendors', group: 'Commerce' },
  { key: 'riders', label: 'Delivery Fleet', shortLabel: 'Riders', group: 'Commerce' },
  { key: 'services', label: 'FYOORA Services (8)', shortLabel: 'Services', group: 'Commerce' },
  { key: 'service_area', label: 'Vadakara Geo-Zone', shortLabel: 'Service Area', group: 'Commerce' },
  { key: 'marketing', label: 'Marketing & Growth', shortLabel: 'Marketing', group: 'Growth & Intelligence' },
  { key: 'ai_bi', label: 'AI BI Copilot', shortLabel: 'AI Copilot', group: 'Growth & Intelligence' },
  { key: 'alerts', label: 'Alerts & Support', shortLabel: 'Alerts', group: 'Governance' },
  { key: 'security', label: 'Security & Audit', shortLabel: 'Security', group: 'Governance' },
  { key: 'reports', label: 'Reports & Exports', shortLabel: 'Reports', group: 'Governance' },
];

export const SERVICE_KEY_LABELS: Record<AdminServiceKey, string> = {
  food: 'Food Delivery',
  food_prebooking: 'Food Parcel Pre-booking',
  bakery: 'Bakery',
  grocery: 'Grocery',
  celebration: 'Birthday & Celebration Store',
  flowers_gifts: 'Flowers & Gifts',
  local_shopping: 'Local Shopping',
  pickup_drop: 'Pickup & Drop',
};

export function formatInr(amount: number): string {
  const n = Math.round(Number(amount) || 0);
  const abs = Math.abs(n).toLocaleString('en-IN');
  return n < 0 ? `-₹${abs}` : `₹${abs}`;
}

export function formatShortDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function downloadFromAdminApi(url: string, filename: string): Promise<void> {
  const token = getStoredToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
