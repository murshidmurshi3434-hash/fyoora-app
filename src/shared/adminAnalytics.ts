import { calculateSettlementSplit } from './domain.ts';
import type {
  AdminDailyAggregate,
  AdminServiceKey,
  AlertAcknowledgement,
  AuditLog,
  Coupon,
  OperatingExpenseRecord,
  Order,
  OrderStatus,
  PartnerApplication,
  PaymentMethod,
  PaymentTransaction,
  PlatformServiceConfig,
  Product,
  ReviewRecord,
  RiderProfile,
  SettlementRecord,
  SupportTicket,
  UserProfile,
  Vendor,
} from './types.ts';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all'
  | 'custom';

export interface DateFilterInput {
  preset: DateRangePreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  now?: Date;
}

export interface DateWindow {
  preset: DateRangePreset;
  startMs: number | null;
  endMs: number | null;
  prevStartMs: number | null;
  prevEndMs: number | null;
  label: string;
  prevLabel: string;
}

export interface KpiMetric {
  id: string;
  label: string;
  value: number;
  previousValue: number | null;
  changePct: number | null;
  format: 'currency' | 'integer' | 'percent';
  sparkline: number[];
  targetSection: string;
  subtitle?: string;
}

export interface RevenueSeriesPoint {
  key: string;
  label: string;
  gmv: number;
  netRevenue: number;
  commissions: number;
  deliveryRevenue: number;
  expenses: number;
  netProfit: number;
  orders: number;
  completedOrders: number;
  cancelledOrders: number;
}

export type CustomerSegment = 'new' | 'regular' | 'high_value' | 'inactive' | 'at_risk';

export interface CustomerAnalyticsItem {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  accountStatus: UserProfile['accountStatus'];
  profileCompleted: boolean;
  createdAt: string;
  orderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  refundCount: number;
  totalSpend: number;
  avgOrderValue: number;
  favouriteCategories: string[];
  complaintCount: number;
  lastOrderAt: string | null;
  segment: CustomerSegment;
  loyaltyPoints: number;
}

export interface VendorAnalyticsItem {
  vendor: Vendor;
  orderCount: number;
  deliveredCount: number;
  cancelledCount: number;
  gmv: number;
  commissionGenerated: number;
  netPayout: number;
  acceptanceRatePct: number | null;
  cancellationRatePct: number | null;
  avgPrepMinsActual: number | null;
  productCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  complaintCount: number;
  performanceScore: number;
  alerts: string[];
}

export interface RiderAnalyticsItem {
  rider: RiderProfile;
  periodDeliveries: number;
  activeAssignedCount: number;
  avgDeliveryMins: number | null;
  successRatePct: number | null;
  acceptanceRatePct: number | null;
  rejectionRatePct: number | null;
  periodEarnings: number;
  periodTips: number;
  complaintCount: number;
}

export interface ServiceAnalyticsItem {
  serviceKey: AdminServiceKey;
  label: string;
  enabled: boolean;
  orders: number;
  completedOrders: number;
  gmv: number;
  commissionRevenue: number;
  netRevenue: number;
  vendorCount: number;
  uniqueCustomers: number;
  commissionRate: number;
  minOrderInr: number;
}

export interface OperationalAlert {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'info';
  category: 'finance' | 'operations' | 'inventory' | 'vendor' | 'rider' | 'security';
  targetSection: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface LiveActivityEvent {
  id: string;
  type:
    | 'customer_registered'
    | 'order_received'
    | 'vendor_accepted'
    | 'rider_assigned'
    | 'order_delivered'
    | 'payment_completed'
    | 'refund_requested'
    | 'partner_application'
    | 'admin_action';
  title: string;
  subtitle: string;
  timestamp: string;
  refId?: string;
}

const ALL_SERVICE_META: Array<{ key: AdminServiceKey; label: string }> = [
  { key: 'food', label: 'Food Delivery' },
  { key: 'food_prebooking', label: 'Food Parcel Pre-booking' },
  { key: 'bakery', label: 'Bakery' },
  { key: 'grocery', label: 'Grocery' },
  { key: 'celebration', label: 'Birthday & Celebration Store' },
  { key: 'flowers_gifts', label: 'Flowers & Gifts' },
  { key: 'local_shopping', label: 'Local Shopping' },
  { key: 'pickup_drop', label: 'Pickup & Drop' },
];

const ACTIVE_PROCESSING_STATUSES: OrderStatus[] = [
  'vendor_accepted',
  'preparation_started',
  'ready_for_pickup',
  'rider_assigned',
  'rider_arrived_at_vendor',
  'picked_up',
  'out_for_delivery',
];

const NEW_ORDER_STATUSES: OrderStatus[] = ['order_placed', 'payment_pending', 'payment_confirmed'];
const TERMINAL_STATUSES: OrderStatus[] = ['delivered', 'cancelled', 'refunded', 'failed_delivery'];

function startOfDayUtcMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
}

function endOfDayUtcMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999);
}

export function resolveDateWindow(input: DateFilterInput): DateWindow {
  const now = input.now ?? new Date();
  const dayMs = 86_400_000;
  const todayStart = startOfDayUtcMs(now);
  const todayEnd = endOfDayUtcMs(now);

  switch (input.preset) {
    case 'today':
      return {
        preset: 'today',
        startMs: todayStart,
        endMs: todayEnd,
        prevStartMs: todayStart - dayMs,
        prevEndMs: todayStart - 1,
        label: 'Today',
        prevLabel: 'Yesterday',
      };
    case 'yesterday':
      return {
        preset: 'yesterday',
        startMs: todayStart - dayMs,
        endMs: todayStart - 1,
        prevStartMs: todayStart - 2 * dayMs,
        prevEndMs: todayStart - dayMs - 1,
        label: 'Yesterday',
        prevLabel: 'Day Before',
      };
    case '7d':
      return {
        preset: '7d',
        startMs: todayStart - 6 * dayMs,
        endMs: todayEnd,
        prevStartMs: todayStart - 13 * dayMs,
        prevEndMs: todayStart - 6 * dayMs - 1,
        label: 'Last 7 days',
        prevLabel: 'Prior 7 days',
      };
    case '30d':
      return {
        preset: '30d',
        startMs: todayStart - 29 * dayMs,
        endMs: todayEnd,
        prevStartMs: todayStart - 59 * dayMs,
        prevEndMs: todayStart - 29 * dayMs - 1,
        label: 'Last 30 days',
        prevLabel: 'Prior 30 days',
      };
    case 'this_month': {
      const mStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
      const prevStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0);
      const prevEnd = mStart - 1;
      return {
        preset: 'this_month',
        startMs: mStart,
        endMs: todayEnd,
        prevStartMs: prevStart,
        prevEndMs: prevEnd,
        label: 'This month',
        prevLabel: 'Last month',
      };
    }
    case 'last_month': {
      const mStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0, 0);
      const mEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0) - 1;
      const prevStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1, 0, 0, 0, 0);
      return {
        preset: 'last_month',
        startMs: mStart,
        endMs: mEnd,
        prevStartMs: prevStart,
        prevEndMs: mStart - 1,
        label: 'Last month',
        prevLabel: 'Prior month',
      };
    }
    case 'this_year': {
      const yStart = Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
      const prevStart = Date.UTC(now.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0);
      return {
        preset: 'this_year',
        startMs: yStart,
        endMs: todayEnd,
        prevStartMs: prevStart,
        prevEndMs: yStart - 1,
        label: 'This year',
        prevLabel: 'Last year',
      };
    }
    case 'custom': {
      const s = input.startDate ? Date.parse(`${input.startDate}T00:00:00.000Z`) : todayStart - 29 * dayMs;
      const e = input.endDate ? Date.parse(`${input.endDate}T23:59:59.999Z`) : todayEnd;
      const validStart = Number.isFinite(s) ? s : todayStart - 29 * dayMs;
      const validEnd = Number.isFinite(e) && e >= validStart ? e : todayEnd;
      const span = Math.max(dayMs, validEnd - validStart + 1);
      return {
        preset: 'custom',
        startMs: validStart,
        endMs: validEnd,
        prevStartMs: validStart - span,
        prevEndMs: validStart - 1,
        label: `${new Date(validStart).toISOString().slice(0, 10)} – ${new Date(validEnd).toISOString().slice(0, 10)}`,
        prevLabel: 'Previous window',
      };
    }
    case 'all':
    default:
      return {
        preset: 'all',
        startMs: null,
        endMs: null,
        prevStartMs: null,
        prevEndMs: null,
        label: 'All time',
        prevLabel: 'No prior window',
      };
  }
}

export function isTimestampInRange(iso: string, startMs: number | null, endMs: number | null): boolean {
  if (startMs === null || endMs === null) return true;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return ts >= startMs && ts <= endMs;
}

export function calculateChangePct(current: number, previous: number | null): number | null {
  if (previous === null) return null;
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

function getOrderCommission(order: Order): number {
  if (order.subOrders?.length) {
    return order.subOrders.reduce((s, sub) => s + (sub.commissionAmount || 0), 0);
  }
  return 0;
}

function getOrderDeliveryExpense(order: Order): number {
  if (order.deliveryMode === 'prebooking_pickup') return 0;
  return calculateSettlementSplit({
    itemsSubtotal: order.pricing.itemsSubtotal,
    deliveryFee: order.pricing.deliveryFee,
    platformFee: order.pricing.platformFee,
    riderTip: order.pricing.riderTip,
    commissionRate: 0.15,
  }).riderDeliveryShare;
}

function getOrderGatewayFee(order: Order): number {
  if (order.paymentMethod === 'cod') return 0;
  if (order.paymentStatus !== 'captured' && order.paymentStatus !== 'refunded') return 0;
  // Standard Razorpay India ~2% MDR on captured online volume
  return Math.round(order.pricing.grandTotal * 0.02);
}

export interface AnalyticsFilterOptions {
  serviceType?: string;
  vendorId?: string;
  riderId?: string;
  paymentMethod?: PaymentMethod | 'all';
}

export function filterOrdersByCriteria(
  orders: Order[],
  startMs: number | null,
  endMs: number | null,
  filters?: AnalyticsFilterOptions
): Order[] {
  return orders.filter((o) => {
    if (!isTimestampInRange(o.createdAt, startMs, endMs)) return false;
    if (filters?.serviceType && filters.serviceType !== 'all' && o.serviceType !== filters.serviceType) {
      return false;
    }
    if (filters?.vendorId && filters.vendorId !== 'all') {
      const hasVendor =
        o.vendorId === filters.vendorId || o.subOrders.some((s) => s.vendorId === filters.vendorId);
      if (!hasVendor) return false;
    }
    if (filters?.riderId && filters.riderId !== 'all' && o.riderId !== filters.riderId) {
      return false;
    }
    if (filters?.paymentMethod && filters.paymentMethod !== 'all' && o.paymentMethod !== filters.paymentMethod) {
      return false;
    }
    return true;
  });
}

function summarizeFinancialOrders(orders: Order[], expenses: OperatingExpenseRecord[], startMs: number | null, endMs: number | null) {
  const validPaid = orders.filter(
    (o) => o.paymentStatus === 'captured' && !['cancelled', 'refunded', 'refund_pending'].includes(o.status)
  );
  const refundedOrders = orders.filter((o) => o.paymentStatus === 'refunded' || o.status === 'refunded');

  const gmv = validPaid.reduce((s, o) => s + o.pricing.grandTotal, 0);
  const vendorCommissions = validPaid.reduce((s, o) => s + getOrderCommission(o), 0);
  const deliveryRevenue = validPaid.reduce((s, o) => s + o.pricing.deliveryFee, 0);
  const platformFees = validPaid.reduce((s, o) => s + o.pricing.platformFee, 0);
  const riderTips = validPaid.reduce((s, o) => s + o.pricing.riderTip, 0);
  const riderDeliveryShares = validPaid.reduce((s, o) => s + getOrderDeliveryExpense(o), 0);
  const refunds = refundedOrders.reduce((s, o) => s + o.pricing.grandTotal, 0);
  const gatewayFees = validPaid.reduce((s, o) => s + getOrderGatewayFee(o), 0);

  const periodExpenses = expenses.filter((e) => isTimestampInRange(e.incurredOn, startMs, endMs));
  const loggedDeliveryOps = periodExpenses
    .filter((e) => e.category === 'delivery_ops')
    .reduce((s, e) => s + e.amountInr, 0);
  const otherLoggedOps = periodExpenses
    .filter((e) => e.category !== 'delivery_ops')
    .reduce((s, e) => s + e.amountInr, 0);

  const deliveryExpenses = riderDeliveryShares + loggedDeliveryOps;
  const totalOperatingExpenses = deliveryExpenses + gatewayFees + otherLoggedOps;
  const netPlatformRevenue = vendorCommissions + platformFees + Math.max(0, deliveryRevenue - riderDeliveryShares);
  const grossPlatformIncome = vendorCommissions + platformFees + deliveryRevenue;
  const estimatedNetProfit = grossPlatformIncome - totalOperatingExpenses;

  return {
    gmv,
    netPlatformRevenue,
    vendorCommissions,
    deliveryRevenue,
    deliveryExpenses,
    platformFees,
    riderTips,
    refunds,
    gatewayFees,
    totalOperatingExpenses,
    estimatedNetProfit,
  };
}

function buildSparklineBuckets(
  orders: Order[],
  expenses: OperatingExpenseRecord[],
  extractor: (dayOrders: Order[], dayExpenses: OperatingExpenseRecord[]) => number,
  bucketCount = 7,
  now = new Date()
): number[] {
  const dayMs = 86_400_000;
  const todayStart = startOfDayUtcMs(now);
  const result: number[] = [];
  for (let i = bucketCount - 1; i >= 0; i--) {
    const start = todayStart - i * dayMs;
    const end = start + dayMs - 1;
    const dayOrders = orders.filter((o) => isTimestampInRange(o.createdAt, start, end));
    const dayExpenses = expenses.filter((e) => isTimestampInRange(e.incurredOn, start, end));
    result.push(extractor(dayOrders, dayExpenses));
  }
  return result;
}

export function computeExecutiveOverview(params: {
  orders: Order[];
  users: UserProfile[];
  vendors: Vendor[];
  riders: RiderProfile[];
  expenses: OperatingExpenseRecord[];
  dateFilter: DateFilterInput;
  filters?: AnalyticsFilterOptions;
}) {
  const { orders, users, vendors, riders, expenses, dateFilter, filters } = params;
  const now = dateFilter.now ?? new Date();
  const window = resolveDateWindow(dateFilter);

  const currentOrders = filterOrdersByCriteria(orders, window.startMs, window.endMs, filters);
  const previousOrders =
    window.prevStartMs !== null && window.prevEndMs !== null
      ? filterOrdersByCriteria(orders, window.prevStartMs, window.prevEndMs, filters)
      : null;

  const curFin = summarizeFinancialOrders(currentOrders, expenses, window.startMs, window.endMs);
  const prevFin = previousOrders
    ? summarizeFinancialOrders(previousOrders, expenses, window.prevStartMs, window.prevEndMs)
    : null;

  const customers = users.filter((u) => u.role === 'customer');
  const newCustomers = customers.filter((u) => isTimestampInRange(u.createdAt, window.startMs, window.endMs)).length;
  const prevNewCustomers =
    window.prevStartMs !== null && window.prevEndMs !== null
      ? customers.filter((u) => isTimestampInRange(u.createdAt, window.prevStartMs, window.prevEndMs)).length
      : null;

  const totalOrders = currentOrders.length;
  const prevTotalOrders = previousOrders ? previousOrders.length : null;

  const countStatus = (list: Order[], statuses: OrderStatus[]) =>
    list.filter((o) => statuses.includes(o.status)).length;

  const newOrders = countStatus(currentOrders, NEW_ORDER_STATUSES);
  const processingOrders = countStatus(currentOrders, ACTIVE_PROCESSING_STATUSES);
  const completedOrders = countStatus(currentOrders, ['delivered']);
  const cancelledOrders = countStatus(currentOrders, ['cancelled']);
  const pendingOrders = currentOrders.filter((o) => !TERMINAL_STATUSES.includes(o.status) && o.status !== 'refund_pending').length;

  const prevCompleted = previousOrders ? countStatus(previousOrders, ['delivered']) : null;
  const prevCancelled = previousOrders ? countStatus(previousOrders, ['cancelled']) : null;
  const prevNewOrders = previousOrders ? countStatus(previousOrders, NEW_ORDER_STATUSES) : null;
  const prevProcessing = previousOrders ? countStatus(previousOrders, ACTIVE_PROCESSING_STATUSES) : null;
  const prevPending = previousOrders
    ? previousOrders.filter((o) => !TERMINAL_STATUSES.includes(o.status) && o.status !== 'refund_pending').length
    : null;

  const activeVendors = vendors.filter((v) => v.approved && !v.suspended && v.isOpen).length;
  const activeRestaurants = vendors.filter(
    (v) => v.approved && !v.suspended && v.isOpen && v.serviceCategory === 'food'
  ).length;
  const activeRiders = riders.filter((r) => r.kycStatus === 'approved' && !r.suspended).length;
  const onlineRiders = riders.filter((r) => r.kycStatus === 'approved' && !r.suspended && r.isOnline).length;

  const finSpark = (fn: (f: ReturnType<typeof summarizeFinancialOrders>) => number) =>
    buildSparklineBuckets(orders, expenses, (dO, dE) => fn(summarizeFinancialOrders(dO, dE, null, null)), 7, now);

  const ordSpark = (fn: (dO: Order[]) => number) =>
    buildSparklineBuckets(orders, expenses, (dO) => fn(dO), 7, now);

  const financialKpis: KpiMetric[] = [
    {
      id: 'gmv',
      label: 'Gross Marketplace Sales (GMV)',
      value: curFin.gmv,
      previousValue: prevFin ? prevFin.gmv : null,
      changePct: calculateChangePct(curFin.gmv, prevFin ? prevFin.gmv : null),
      format: 'currency',
      sparkline: finSpark((f) => f.gmv),
      targetSection: 'finance',
      subtitle: 'Captured marketplace & courier volume',
    },
    {
      id: 'net_revenue',
      label: 'Net Platform Revenue',
      value: curFin.netPlatformRevenue,
      previousValue: prevFin ? prevFin.netPlatformRevenue : null,
      changePct: calculateChangePct(curFin.netPlatformRevenue, prevFin ? prevFin.netPlatformRevenue : null),
      format: 'currency',
      sparkline: finSpark((f) => f.netPlatformRevenue),
      targetSection: 'finance',
      subtitle: 'Commissions + platform fee + delivery margin',
    },
    {
      id: 'vendor_commissions',
      label: 'Vendor Commissions',
      value: curFin.vendorCommissions,
      previousValue: prevFin ? prevFin.vendorCommissions : null,
      changePct: calculateChangePct(curFin.vendorCommissions, prevFin ? prevFin.vendorCommissions : null),
      format: 'currency',
      sparkline: finSpark((f) => f.vendorCommissions),
      targetSection: 'vendors',
    },
    {
      id: 'delivery_revenue',
      label: 'Delivery Revenue',
      value: curFin.deliveryRevenue,
      previousValue: prevFin ? prevFin.deliveryRevenue : null,
      changePct: calculateChangePct(curFin.deliveryRevenue, prevFin ? prevFin.deliveryRevenue : null),
      format: 'currency',
      sparkline: finSpark((f) => f.deliveryRevenue),
      targetSection: 'analytics',
    },
    {
      id: 'delivery_expenses',
      label: 'Delivery Expenses',
      value: curFin.deliveryExpenses,
      previousValue: prevFin ? prevFin.deliveryExpenses : null,
      changePct: calculateChangePct(curFin.deliveryExpenses, prevFin ? prevFin.deliveryExpenses : null),
      format: 'currency',
      sparkline: finSpark((f) => f.deliveryExpenses),
      targetSection: 'riders',
      subtitle: '80% rider payout share + logged delivery ops',
    },
    {
      id: 'rider_tips',
      label: 'Rider Tips',
      value: curFin.riderTips,
      previousValue: prevFin ? prevFin.riderTips : null,
      changePct: calculateChangePct(curFin.riderTips, prevFin ? prevFin.riderTips : null),
      format: 'currency',
      sparkline: finSpark((f) => f.riderTips),
      targetSection: 'riders',
    },
    {
      id: 'refunds',
      label: 'Refunds',
      value: curFin.refunds,
      previousValue: prevFin ? prevFin.refunds : null,
      changePct: calculateChangePct(curFin.refunds, prevFin ? prevFin.refunds : null),
      format: 'currency',
      sparkline: finSpark((f) => f.refunds),
      targetSection: 'finance',
    },
    {
      id: 'gateway_fees',
      label: 'Payment Gateway Fees',
      value: curFin.gatewayFees,
      previousValue: prevFin ? prevFin.gatewayFees : null,
      changePct: calculateChangePct(curFin.gatewayFees, prevFin ? prevFin.gatewayFees : null),
      format: 'currency',
      sparkline: finSpark((f) => f.gatewayFees),
      targetSection: 'finance',
      subtitle: 'Est. 2% Razorpay MDR on online payments',
    },
    {
      id: 'operating_expenses',
      label: 'Total Operating Expenses',
      value: curFin.totalOperatingExpenses,
      previousValue: prevFin ? prevFin.totalOperatingExpenses : null,
      changePct: calculateChangePct(curFin.totalOperatingExpenses, prevFin ? prevFin.totalOperatingExpenses : null),
      format: 'currency',
      sparkline: finSpark((f) => f.totalOperatingExpenses),
      targetSection: 'finance',
    },
    {
      id: 'net_profit',
      label: 'Estimated Net Profit',
      value: curFin.estimatedNetProfit,
      previousValue: prevFin ? prevFin.estimatedNetProfit : null,
      changePct: calculateChangePct(curFin.estimatedNetProfit, prevFin ? prevFin.estimatedNetProfit : null),
      format: 'currency',
      sparkline: finSpark((f) => f.estimatedNetProfit),
      targetSection: 'reports',
    },
  ];

  const operationsKpis: KpiMetric[] = [
    {
      id: 'total_orders',
      label: 'Total Orders',
      value: totalOrders,
      previousValue: prevTotalOrders,
      changePct: calculateChangePct(totalOrders, prevTotalOrders),
      format: 'integer',
      sparkline: ordSpark((dO) => dO.length),
      targetSection: 'live_ops',
    },
    {
      id: 'new_orders',
      label: 'New Orders',
      value: newOrders,
      previousValue: prevNewOrders,
      changePct: calculateChangePct(newOrders, prevNewOrders),
      format: 'integer',
      sparkline: ordSpark((dO) => countStatus(dO, NEW_ORDER_STATUSES)),
      targetSection: 'live_ops',
    },
    {
      id: 'processing_orders',
      label: 'Processing Orders',
      value: processingOrders,
      previousValue: prevProcessing,
      changePct: calculateChangePct(processingOrders, prevProcessing),
      format: 'integer',
      sparkline: ordSpark((dO) => countStatus(dO, ACTIVE_PROCESSING_STATUSES)),
      targetSection: 'live_ops',
    },
    {
      id: 'completed_orders',
      label: 'Completed Orders',
      value: completedOrders,
      previousValue: prevCompleted,
      changePct: calculateChangePct(completedOrders, prevCompleted),
      format: 'integer',
      sparkline: ordSpark((dO) => countStatus(dO, ['delivered'])),
      targetSection: 'analytics',
    },
    {
      id: 'cancelled_orders',
      label: 'Cancelled Orders',
      value: cancelledOrders,
      previousValue: prevCancelled,
      changePct: calculateChangePct(cancelledOrders, prevCancelled),
      format: 'integer',
      sparkline: ordSpark((dO) => countStatus(dO, ['cancelled'])),
      targetSection: 'analytics',
    },
    {
      id: 'pending_orders',
      label: 'Pending Orders',
      value: pendingOrders,
      previousValue: prevPending,
      changePct: calculateChangePct(pendingOrders, prevPending),
      format: 'integer',
      sparkline: ordSpark((dO) => dO.filter((o) => !TERMINAL_STATUSES.includes(o.status) && o.status !== 'refund_pending').length),
      targetSection: 'live_ops',
    },
    {
      id: 'active_vendors',
      label: 'Active Vendors',
      value: activeVendors,
      previousValue: null,
      changePct: null,
      format: 'integer',
      sparkline: [],
      targetSection: 'vendors',
      subtitle: `${vendors.length} total registered`,
    },
    {
      id: 'active_restaurants',
      label: 'Active Restaurants',
      value: activeRestaurants,
      previousValue: null,
      changePct: null,
      format: 'integer',
      sparkline: [],
      targetSection: 'vendors',
    },
    {
      id: 'active_riders',
      label: 'Active Riders',
      value: activeRiders,
      previousValue: null,
      changePct: null,
      format: 'integer',
      sparkline: [],
      targetSection: 'riders',
      subtitle: `${riders.length} registered partners`,
    },
    {
      id: 'online_riders',
      label: 'Online Riders',
      value: onlineRiders,
      previousValue: null,
      changePct: null,
      format: 'integer',
      sparkline: [],
      targetSection: 'live_ops',
    },
    {
      id: 'registered_customers',
      label: 'Registered Customers',
      value: customers.length,
      previousValue: null,
      changePct: null,
      format: 'integer',
      sparkline: [],
      targetSection: 'customers',
    },
    {
      id: 'new_customers',
      label: 'New Customers',
      value: newCustomers,
      previousValue: prevNewCustomers,
      changePct: calculateChangePct(newCustomers, prevNewCustomers),
      format: 'integer',
      sparkline: buildSparklineBuckets(
        orders,
        expenses,
        () => 0,
        7,
        now
      ).map((_, idx) => {
        const dayMs = 86_400_000;
        const start = startOfDayUtcMs(now) - (6 - idx) * dayMs;
        return customers.filter((u) => isTimestampInRange(u.createdAt, start, start + dayMs - 1)).length;
      }),
      targetSection: 'customers',
    },
  ];

  return {
    window,
    financialKpis,
    operationsKpis,
    summary: curFin,
    counts: {
      totalOrders,
      newOrders,
      processingOrders,
      completedOrders,
      cancelledOrders,
      pendingOrders,
      activeVendors,
      activeRestaurants,
      activeRiders,
      onlineRiders,
      registeredCustomers: customers.length,
      newCustomers,
    },
  };
}

function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function buildRevenueSeries(
  orders: Order[],
  expenses: OperatingExpenseRecord[],
  granularity: 'daily' | 'weekly' | 'monthly' | 'yearly'
): RevenueSeriesPoint[] {
  const map = new Map<string, { orders: Order[]; expenses: OperatingExpenseRecord[]; label: string }>();

  const ensureBucket = (key: string, label: string) => {
    let b = map.get(key);
    if (!b) {
      b = { orders: [], expenses: [], label };
      map.set(key, b);
    }
    return b;
  };

  for (const o of orders) {
    const d = new Date(o.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    let key: string;
    let label: string;
    if (granularity === 'daily') {
      key = o.createdAt.slice(0, 10);
      label = key;
    } else if (granularity === 'weekly') {
      key = getIsoWeekKey(d);
      label = key;
    } else if (granularity === 'monthly') {
      key = o.createdAt.slice(0, 7);
      label = key;
    } else {
      key = o.createdAt.slice(0, 4);
      label = key;
    }
    ensureBucket(key, label).orders.push(o);
  }

  for (const e of expenses) {
    const d = new Date(e.incurredOn);
    if (Number.isNaN(d.getTime())) continue;
    const key =
      granularity === 'daily'
        ? e.incurredOn.slice(0, 10)
        : granularity === 'weekly'
          ? getIsoWeekKey(d)
          : granularity === 'monthly'
            ? e.incurredOn.slice(0, 7)
            : e.incurredOn.slice(0, 4);
    ensureBucket(key, key).expenses.push(e);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => {
      const fin = summarizeFinancialOrders(bucket.orders, bucket.expenses, null, null);
      return {
        key,
        label: bucket.label,
        gmv: fin.gmv,
        netRevenue: fin.netPlatformRevenue,
        commissions: fin.vendorCommissions,
        deliveryRevenue: fin.deliveryRevenue,
        expenses: fin.totalOperatingExpenses,
        netProfit: fin.estimatedNetProfit,
        orders: bucket.orders.length,
        completedOrders: bucket.orders.filter((o) => o.status === 'delivered').length,
        cancelledOrders: bucket.orders.filter((o) => o.status === 'cancelled').length,
      };
    });
}

function diffHistoryMinutes(order: Order, fromStatuses: OrderStatus[], toStatuses: OrderStatus[]): number | null {
  const fromEntry = order.statusHistory.find((h) => fromStatuses.includes(h.status));
  const toEntry = order.statusHistory.find((h) => toStatuses.includes(h.status));
  if (!fromEntry || !toEntry) return null;
  const diff = (Date.parse(toEntry.timestamp) - Date.parse(fromEntry.timestamp)) / 60_000;
  if (!Number.isFinite(diff) || diff <= 0 || diff > 1440) return null;
  return Math.round(diff * 10) / 10;
}

export function computeOrderAnalytics(orders: Order[]) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    orders: 0,
    gmv: 0,
  }));
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byWeekday = weekdayNames.map((label) => ({ label, orders: 0, gmv: 0 }));
  const byMonthMap = new Map<string, { label: string; orders: number; completed: number; cancelled: number; gmv: number }>();
  const statusMap = new Map<string, number>();

  const prepMinsList: number[] = [];
  const deliveryMinsList: number[] = [];

  for (const o of orders) {
    const dt = new Date(o.createdAt);
    if (!Number.isNaN(dt.getTime())) {
      const hr = dt.getUTCHours();
      const wd = dt.getUTCDay();
      byHour[hr].orders += 1;
      byHour[hr].gmv += o.pricing.grandTotal;
      byWeekday[wd].orders += 1;
      byWeekday[wd].gmv += o.pricing.grandTotal;

      const ym = o.createdAt.slice(0, 7);
      const m = byMonthMap.get(ym) || { label: ym, orders: 0, completed: 0, cancelled: 0, gmv: 0 };
      m.orders += 1;
      if (o.status === 'delivered') m.completed += 1;
      if (o.status === 'cancelled') m.cancelled += 1;
      m.gmv += o.pricing.grandTotal;
      byMonthMap.set(ym, m);
    }

    statusMap.set(o.status, (statusMap.get(o.status) || 0) + 1);

    const prep = diffHistoryMinutes(o, ['vendor_accepted', 'preparation_started'], ['ready_for_pickup', 'picked_up']);
    if (prep !== null) prepMinsList.push(prep);

    const deliv = diffHistoryMinutes(o, ['order_placed', 'payment_confirmed', 'vendor_accepted'], ['delivered']);
    if (deliv !== null) deliveryMinsList.push(deliv);
  }

  const paidOrders = orders.filter((o) => !['cancelled', 'refunded'].includes(o.status));
  const avgOrderValue =
    paidOrders.length > 0
      ? Math.round(paidOrders.reduce((s, o) => s + o.pricing.grandTotal, 0) / paidOrders.length)
      : 0;

  return {
    byHour,
    byWeekday,
    byMonth: Array.from(byMonthMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    statusDistribution: Array.from(statusMap.entries()).map(([status, count]) => ({
      label: status.replace(/_/g, ' '),
      status,
      count,
    })),
    avgOrderValue,
    avgPrepTimeMins:
      prepMinsList.length > 0
        ? Math.round((prepMinsList.reduce((a, b) => a + b, 0) / prepMinsList.length) * 10) / 10
        : null,
    avgDeliveryTimeMins:
      deliveryMinsList.length > 0
        ? Math.round((deliveryMinsList.reduce((a, b) => a + b, 0) / deliveryMinsList.length) * 10) / 10
        : null,
  };
}

export function computeCustomerAnalytics(params: {
  users: UserProfile[];
  orders: Order[];
  supportTickets: SupportTicket[];
  now?: Date;
}) {
  const { users, orders, supportTickets, now = new Date() } = params;
  const nowMs = now.getTime();
  const customers = users.filter((u) => u.role === 'customer');

  const items: CustomerAnalyticsItem[] = customers.map((c) => {
    const myOrders = orders.filter((o) => o.customerId === c.id);
    const completed = myOrders.filter((o) => o.status === 'delivered');
    const cancelled = myOrders.filter((o) => o.status === 'cancelled');
    const refunded = myOrders.filter((o) => o.paymentStatus === 'refunded' || o.status === 'refunded');
    const totalSpend = myOrders
      .filter((o) => !['cancelled', 'refunded'].includes(o.status))
      .reduce((s, o) => s + o.pricing.grandTotal, 0);
    const avgOrderValue = myOrders.length > 0 ? Math.round(totalSpend / Math.max(1, myOrders.length - cancelled.length)) : 0;

    const catCounts = new Map<string, number>();
    for (const o of myOrders) {
      catCounts.set(o.serviceType, (catCounts.get(o.serviceType) || 0) + 1);
    }
    const favouriteCategories = Array.from(catCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k);

    const sortedDates = myOrders.map((o) => o.createdAt).sort((a, b) => b.localeCompare(a));
    const lastOrderAt = sortedDates[0] || null;
    const daysSinceLastOrder = lastOrderAt ? (nowMs - Date.parse(lastOrderAt)) / 86_400_000 : Infinity;
    const daysSinceJoined = (nowMs - Date.parse(c.createdAt)) / 86_400_000;

    let segment: CustomerSegment = 'new';
    if (totalSpend >= 2000 || completed.length >= 5) {
      segment = 'high_value';
    } else if (myOrders.length >= 2) {
      segment = daysSinceLastOrder > 30 ? 'at_risk' : 'regular';
    } else if (myOrders.length === 0 && daysSinceJoined > 14) {
      segment = 'inactive';
    } else if (myOrders.length === 1 && daysSinceLastOrder > 30) {
      segment = 'at_risk';
    }

    const complaintCount = supportTickets.filter((t) => t.userId === c.id).length;

    return {
      id: c.id,
      fullName: c.fullName || 'Unnamed Customer',
      phone: c.contactPhone || c.phone || 'Not added',
      email: c.email,
      accountStatus: c.accountStatus,
      profileCompleted: c.profileCompleted,
      createdAt: c.createdAt,
      orderCount: myOrders.length,
      completedOrderCount: completed.length,
      cancelledOrderCount: cancelled.length,
      refundCount: refunded.length,
      totalSpend,
      avgOrderValue,
      favouriteCategories,
      complaintCount,
      lastOrderAt,
      segment,
      loyaltyPoints: c.loyaltyPoints,
    };
  });

  const withOrders = items.filter((i) => i.orderCount > 0);
  const returningCustomers = items.filter((i) => i.orderCount >= 2).length;
  const repeatPurchaseRatePct =
    withOrders.length > 0 ? Math.round((returningCustomers / withOrders.length) * 1000) / 10 : 0;
  const avgLtv =
    items.length > 0 ? Math.round(items.reduce((s, i) => s + i.totalSpend, 0) / items.length) : 0;

  return {
    items: items.sort((a, b) => b.totalSpend - a.totalSpend),
    totals: {
      totalCustomers: items.length,
      newCustomersCount: items.filter((i) => i.segment === 'new').length,
      returningCustomersCount: returningCustomers,
      highValueCount: items.filter((i) => i.segment === 'high_value').length,
      inactiveCount: items.filter((i) => i.segment === 'inactive').length,
      atRiskCount: items.filter((i) => i.segment === 'at_risk').length,
      repeatPurchaseRatePct,
      avgLtv,
    },
  };
}

export function computeVendorAnalytics(params: {
  vendors: Vendor[];
  orders: Order[];
  products: Product[];
  supportTickets: SupportTicket[];
}): VendorAnalyticsItem[] {
  const { vendors, orders, products, supportTickets } = params;
  return vendors
    .map((vendor) => {
      const vOrders = orders.filter(
        (o) => o.vendorId === vendor.id || o.subOrders.some((s) => s.vendorId === vendor.id)
      );
      const delivered = vOrders.filter((o) => o.status === 'delivered');
      const cancelled = vOrders.filter((o) => o.status === 'cancelled');
      const acceptedCount = vOrders.filter((o) =>
        o.statusHistory.some((h) => ['vendor_accepted', 'preparation_started', 'ready_for_pickup', 'delivered'].includes(h.status))
      ).length;

      let gmv = 0;
      let commissionGenerated = 0;
      let netPayout = 0;
      for (const o of vOrders) {
        if (['cancelled', 'refunded'].includes(o.status)) continue;
        const matchingSubs = o.subOrders.filter((s) => s.vendorId === vendor.id);
        if (matchingSubs.length) {
          for (const sub of matchingSubs) {
            gmv += sub.subtotal;
            commissionGenerated += sub.commissionAmount;
            netPayout += sub.vendorNetPayout;
          }
        } else if (o.vendorId === vendor.id) {
          gmv += o.pricing.itemsSubtotal;
          commissionGenerated += Math.round(o.pricing.itemsSubtotal * vendor.commissionRate);
          netPayout += Math.max(0, o.pricing.itemsSubtotal - Math.round(o.pricing.itemsSubtotal * vendor.commissionRate));
        }
      }

      const prepTimes = vOrders
        .map((o) => diffHistoryMinutes(o, ['vendor_accepted', 'preparation_started'], ['ready_for_pickup']))
        .filter((x): x is number => x !== null);

      const vProducts = products.filter((p) => p.vendorId === vendor.id);
      const lowStockCount = vProducts.filter((p) => p.inStock && p.stockQty > 0 && p.stockQty <= 5).length;
      const outOfStockCount = vProducts.filter((p) => !p.inStock || p.stockQty <= 0 || p.soldOutManual).length;

      const orderIds = new Set(vOrders.map((o) => o.id));
      const complaintCount = supportTickets.filter((t) => t.orderId && orderIds.has(t.orderId)).length;

      const acceptanceRatePct = vOrders.length > 0 ? Math.round((acceptedCount / vOrders.length) * 1000) / 10 : null;
      const cancellationRatePct = vOrders.length > 0 ? Math.round((cancelled.length / vOrders.length) * 1000) / 10 : null;

      const alerts: string[] = [];
      if (outOfStockCount > 0) alerts.push(`${outOfStockCount} out-of-stock item(s)`);
      if (lowStockCount > 0) alerts.push(`${lowStockCount} low-stock item(s)`);
      if (vendor.rating < 3.8 && vendor.reviewCount > 0) alerts.push(`Low rating (${vendor.rating})`);
      if (cancellationRatePct !== null && cancellationRatePct >= 20 && vOrders.length >= 2) {
        alerts.push(`High cancellation (${cancellationRatePct}%)`);
      }
      if (!vendor.isOpen && vendor.approved && !vendor.suspended) alerts.push('Store currently offline');
      if (vendor.suspended) alerts.push('Suspended');

      // Transparent score built strictly from rating + completion - cancellations
      const ratingPart = (vendor.rating / 5) * 60;
      const completionPart = vOrders.length > 0 ? (delivered.length / vOrders.length) * 40 : 25;
      const penalty = (cancellationRatePct || 0) * 0.4;
      const performanceScore = Math.max(0, Math.min(100, Math.round(ratingPart + completionPart - penalty)));

      return {
        vendor,
        orderCount: vOrders.length,
        deliveredCount: delivered.length,
        cancelledCount: cancelled.length,
        gmv,
        commissionGenerated,
        netPayout,
        acceptanceRatePct,
        cancellationRatePct,
        avgPrepMinsActual:
          prepTimes.length > 0 ? Math.round((prepTimes.reduce((a, b) => a + b, 0) / prepTimes.length) * 10) / 10 : null,
        productCount: vProducts.length,
        lowStockCount,
        outOfStockCount,
        complaintCount,
        performanceScore,
        alerts,
      };
    })
    .sort((a, b) => b.gmv - a.gmv || b.performanceScore - a.performanceScore);
}

export function computeRiderAnalytics(params: {
  riders: RiderProfile[];
  orders: Order[];
  supportTickets: SupportTicket[];
}): RiderAnalyticsItem[] {
  const { riders, orders, supportTickets } = params;
  return riders
    .map((rider) => {
      const rOrders = orders.filter((o) => o.riderId === rider.id);
      const delivered = rOrders.filter((o) => o.status === 'delivered');
      const failed = rOrders.filter((o) => o.status === 'failed_delivery');
      const activeAssignedCount = rOrders.filter((o) => !TERMINAL_STATUSES.includes(o.status) && o.status !== 'refund_pending').length;

      const delivTimes = delivered
        .map((o) => diffHistoryMinutes(o, ['rider_assigned', 'picked_up'], ['delivered']))
        .filter((x): x is number => x !== null);

      const periodTips = delivered.reduce((s, o) => s + o.pricing.riderTip, 0);
      const periodEarnings = delivered.reduce(
        (s, o) => s + getOrderDeliveryExpense(o) + o.pricing.riderTip,
        0
      );

      const orderIds = new Set(rOrders.map((o) => o.id));
      const complaintCount = supportTickets.filter((t) => t.orderId && orderIds.has(t.orderId)).length;

      const totalAttempted = delivered.length + failed.length;
      const successRatePct = totalAttempted > 0 ? Math.round((delivered.length / totalAttempted) * 1000) / 10 : null;
      const rejected = rider.rejectedDeliveries || 0;
      const offered = rOrders.length + rejected;
      const acceptanceRatePct = offered > 0 ? Math.round((rOrders.length / offered) * 1000) / 10 : null;
      const rejectionRatePct = offered > 0 ? Math.round((rejected / offered) * 1000) / 10 : null;

      return {
        rider,
        periodDeliveries: delivered.length,
        activeAssignedCount,
        avgDeliveryMins:
          delivTimes.length > 0 ? Math.round((delivTimes.reduce((a, b) => a + b, 0) / delivTimes.length) * 10) / 10 : null,
        successRatePct,
        acceptanceRatePct,
        rejectionRatePct,
        periodEarnings,
        periodTips,
        complaintCount,
      };
    })
    .sort((a, b) => b.rider.completedDeliveries - a.rider.completedDeliveries || b.periodDeliveries - a.periodDeliveries);
}

export function computeServiceAnalytics(params: {
  orders: Order[];
  vendors: Vendor[];
  serviceConfigs: PlatformServiceConfig[];
}): ServiceAnalyticsItem[] {
  const { orders, vendors, serviceConfigs } = params;
  return ALL_SERVICE_META.map((meta) => {
    const cfg = serviceConfigs.find((c) => c.serviceKey === meta.key);
    const matchingOrders = orders.filter((o) => (o.serviceType as string) === meta.key);
    const valid = matchingOrders.filter((o) => !['cancelled', 'refunded'].includes(o.status));
    const completed = matchingOrders.filter((o) => o.status === 'delivered');

    const gmv = valid.reduce((s, o) => s + o.pricing.grandTotal, 0);
    const commissionRevenue = valid.reduce((s, o) => s + getOrderCommission(o), 0);
    const deliveryMargin = valid.reduce(
      (s, o) => s + Math.max(0, o.pricing.deliveryFee - getOrderDeliveryExpense(o)) + o.pricing.platformFee,
      0
    );

    const vendorCount =
      meta.key === 'food_prebooking'
        ? vendors.filter((v) => v.supportsPreBooking).length
        : meta.key === 'pickup_drop'
          ? 0
          : vendors.filter((v) => (v.serviceCategory as string) === meta.key).length;

    const uniqueCustomers = new Set(matchingOrders.map((o) => o.customerId)).size;

    return {
      serviceKey: meta.key,
      label: cfg?.label || meta.label,
      enabled: cfg ? cfg.enabled : meta.key !== 'local_shopping',
      orders: matchingOrders.length,
      completedOrders: completed.length,
      gmv,
      commissionRevenue,
      netRevenue: commissionRevenue + deliveryMargin,
      vendorCount,
      uniqueCustomers,
      commissionRate: cfg?.commissionRate ?? 0.15,
      minOrderInr: cfg?.minOrderInr ?? 99,
    };
  });
}

export function computeLiveOperations(params: {
  orders: Order[];
  riders: RiderProfile[];
  users: UserProfile[];
  partnerApplications: PartnerApplication[];
  auditLogs: AuditLog[];
  paymentTransactions: PaymentTransaction[];
  now?: Date;
}) {
  const { orders, riders, users, partnerApplications, auditLogs, paymentTransactions, now = new Date() } = params;
  const nowMs = now.getTime();

  const incomingOrders = orders.filter((o) => ['order_placed', 'payment_confirmed'].includes(o.status));
  const awaitingVendor = orders.filter((o) => ['order_placed', 'payment_confirmed'].includes(o.status) && o.serviceType !== 'pickup_drop');
  const beingPrepared = orders.filter((o) => ['vendor_accepted', 'preparation_started'].includes(o.status));
  const awaitingRiders = orders.filter(
    (o) => !o.riderId && o.deliveryMode !== 'prebooking_pickup' && !TERMINAL_STATUSES.includes(o.status) && o.status !== 'refund_pending'
  );
  const activeDeliveries = orders.filter((o) =>
    ['rider_assigned', 'rider_arrived_at_vendor', 'picked_up', 'out_for_delivery'].includes(o.status)
  );
  const delayedDeliveries = orders.filter((o) => {
    if (TERMINAL_STATUSES.includes(o.status) || o.status === 'refund_pending') return false;
    const elapsedMins = (nowMs - Date.parse(o.createdAt)) / 60_000;
    return elapsedMins > Math.max(45, (o.etaMinutes?.max || 45) + 10);
  });
  const failedDeliveries = orders.filter((o) => o.status === 'failed_delivery');
  const unassignedOrders = awaitingRiders;

  const busyRiderIds = new Set(activeDeliveries.map((o) => o.riderId).filter(Boolean));
  const onlineRiders = riders.filter((r) => r.isOnline && r.kycStatus === 'approved' && !r.suspended);
  const offlineRiders = riders.filter((r) => !r.isOnline || r.suspended);
  const availableRiders = onlineRiders.filter((r) => !busyRiderIds.has(r.id));

  const activityFeed: LiveActivityEvent[] = [];

  for (const o of orders) {
    activityFeed.push({
      id: `act-ord-${o.id}`,
      type: o.status === 'delivered' ? 'order_delivered' : o.status === 'refund_pending' || o.status === 'refunded' ? 'refund_requested' : 'order_received',
      title: `Order ${o.orderNumber} · ${o.status.replace(/_/g, ' ')}`,
      subtitle: `${o.customerName} · ${o.vendorName || 'Pickup & Drop'} · ₹${o.pricing.grandTotal}`,
      timestamp: o.updatedAt || o.createdAt,
      refId: o.id,
    });
    for (const h of o.statusHistory) {
      if (h.status === 'vendor_accepted') {
        activityFeed.push({
          id: `act-acc-${o.id}-${h.timestamp}`,
          type: 'vendor_accepted',
          title: `Vendor accepted ${o.orderNumber}`,
          subtitle: o.vendorName || 'Store Partner',
          timestamp: h.timestamp,
          refId: o.id,
        });
      } else if (h.status === 'rider_assigned') {
        activityFeed.push({
          id: `act-rdr-${o.id}-${h.timestamp}`,
          type: 'rider_assigned',
          title: `Rider assigned to ${o.orderNumber}`,
          subtitle: o.riderName || h.note || 'Delivery Partner',
          timestamp: h.timestamp,
          refId: o.id,
        });
      }
    }
  }

  for (const u of users.filter((item) => item.role === 'customer')) {
    activityFeed.push({
      id: `act-usr-${u.id}`,
      type: 'customer_registered',
      title: `Customer registered: ${u.fullName || 'New User'}`,
      subtitle: u.email || u.phone || 'Verified profile',
      timestamp: u.createdAt,
      refId: u.id,
    });
  }

  for (const tx of paymentTransactions) {
    if (tx.status === 'captured') {
      activityFeed.push({
        id: `act-tx-${tx.id}`,
        type: 'payment_completed',
        title: `Payment captured ₹${tx.amount}`,
        subtitle: `${tx.gateway.toUpperCase()} · Order ${tx.orderId}`,
        timestamp: tx.updatedAt || tx.createdAt,
        refId: tx.orderId,
      });
    }
  }

  for (const app of partnerApplications) {
    activityFeed.push({
      id: `act-app-${app.id}`,
      type: 'partner_application',
      title: `${app.type.toUpperCase()} application (${app.status})`,
      subtitle: app.businessName || app.applicantName,
      timestamp: app.createdAt,
      refId: app.id,
    });
  }

  for (const log of auditLogs.slice(0, 20)) {
    activityFeed.push({
      id: `act-aud-${log.id}`,
      type: 'admin_action',
      title: log.action.replace(/_/g, ' '),
      subtitle: log.details,
      timestamp: log.createdAt,
      refId: log.targetId,
    });
  }

  activityFeed.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    incomingOrders,
    awaitingVendor,
    beingPrepared,
    awaitingRiders,
    activeDeliveries,
    delayedDeliveries,
    failedDeliveries,
    unassignedOrders,
    onlineRiders,
    offlineRiders,
    availableRiders,
    activityFeed: activityFeed.slice(0, 40),
  };
}

export function computeOperationalAlerts(params: {
  orders: Order[];
  products: Product[];
  vendors: Vendor[];
  riders: RiderProfile[];
  settlements: SettlementRecord[];
  paymentTransactions: PaymentTransaction[];
  supportTickets: SupportTicket[];
  partnerApplications: PartnerApplication[];
  acknowledgements: Record<string, AlertAcknowledgement>;
  now?: Date;
}): OperationalAlert[] {
  const {
    orders,
    products,
    vendors,
    riders,
    settlements,
    paymentTransactions,
    supportTickets,
    partnerApplications,
    acknowledgements,
    now = new Date(),
  } = params;

  const alerts: Omit<OperationalAlert, 'acknowledged' | 'acknowledgedBy' | 'acknowledgedAt'>[] = [];
  const nowIso = now.toISOString();

  // 1. Payment failures or pending refunds
  const failedPayments = paymentTransactions.filter((t) => t.status === 'failed');
  if (failedPayments.length > 0) {
    alerts.push({
      id: 'alt-failed-payments',
      title: `${failedPayments.length} failed payment transaction(s)`,
      description: 'Review Razorpay failure codes and reconcile affected orders in Finance Control.',
      priority: 'critical',
      category: 'finance',
      targetSection: 'finance',
      timestamp: failedPayments[0].createdAt || nowIso,
    });
  }

  const pendingRefundOrders = orders.filter((o) => o.paymentStatus === 'refund_pending');
  if (pendingRefundOrders.length > 0) {
    alerts.push({
      id: 'alt-pending-refunds',
      title: `${pendingRefundOrders.length} order(s) awaiting Razorpay refund completion`,
      description: `Orders: ${pendingRefundOrders.slice(0, 3).map((o) => o.orderNumber).join(', ')}`,
      priority: 'high',
      category: 'finance',
      targetSection: 'finance',
      timestamp: pendingRefundOrders[0].updatedAt || nowIso,
    });
  }

  // 2. Failed or pending settlements
  const failedSettlements = settlements.filter((s) => s.status === 'failed');
  if (failedSettlements.length > 0) {
    alerts.push({
      id: 'alt-failed-settlements',
      title: `${failedSettlements.length} failed payout settlement(s)`,
      description: 'Verify bank details and re-record transfer references.',
      priority: 'critical',
      category: 'finance',
      targetSection: 'finance',
      timestamp: failedSettlements[0].createdAt || nowIso,
    });
  }

  const pendingSettlements = settlements.filter((s) => s.status === 'pending');
  if (pendingSettlements.length > 0) {
    const totalDue = pendingSettlements.reduce((s, r) => s + r.netPayout, 0);
    alerts.push({
      id: 'alt-pending-settlements',
      title: `${pendingSettlements.length} pending settlement payout(s) (₹${totalDue})`,
      description: 'Send payouts via bank and record the UTR reference in Finance Control.',
      priority: 'medium',
      category: 'finance',
      targetSection: 'finance',
      timestamp: pendingSettlements[0].createdAt || nowIso,
    });
  }

  // 3. Low / Out of stock inventory
  const outStock = products.filter((p) => !p.inStock || p.stockQty === 0 || p.soldOutManual);
  const lowStock = products.filter((p) => p.inStock && p.stockQty > 0 && p.stockQty <= 5);
  if (outStock.length > 0) {
    alerts.push({
      id: 'alt-out-of-stock',
      title: `${outStock.length} catalog product(s) out of stock`,
      description: outStock.slice(0, 3).map((p) => p.name).join(', '),
      priority: 'medium',
      category: 'inventory',
      targetSection: 'vendors',
      timestamp: nowIso,
    });
  }
  if (lowStock.length > 0) {
    alerts.push({
      id: 'alt-low-stock',
      title: `${lowStock.length} product(s) running low on stock (≤ 5 units)`,
      description: lowStock.slice(0, 3).map((p) => `${p.name} (${p.stockQty})`).join(', '),
      priority: 'info',
      category: 'inventory',
      targetSection: 'vendors',
      timestamp: nowIso,
    });
  }

  // 4. Online rider shortage vs active demand
  const onlineApprovedRiders = riders.filter((r) => r.isOnline && r.kycStatus === 'approved' && !r.suspended);
  const unassigned = orders.filter(
    (o) => !o.riderId && o.deliveryMode !== 'prebooking_pickup' && !TERMINAL_STATUSES.includes(o.status) && o.status !== 'refund_pending'
  );
  if (onlineApprovedRiders.length === 0) {
    alerts.push({
      id: 'alt-no-riders-online',
      title: 'No KYC-approved riders online in Vadakara',
      description: 'Customer delivery quotes will show rider unavailability until at least one rider goes online.',
      priority: 'critical',
      category: 'rider',
      targetSection: 'riders',
      timestamp: nowIso,
    });
  } else if (unassigned.length > onlineApprovedRiders.length) {
    alerts.push({
      id: 'alt-unassigned-surge',
      title: `${unassigned.length} unassigned orders vs ${onlineApprovedRiders.length} online rider(s)`,
      description: 'Assign riders manually from Live Ops Command Centre.',
      priority: 'high',
      category: 'operations',
      targetSection: 'live_ops',
      timestamp: unassigned[0].createdAt || nowIso,
    });
  }

  // 5. Delayed orders
  const nowMs = now.getTime();
  const delayed = orders.filter((o) => {
    if (TERMINAL_STATUSES.includes(o.status) || o.status === 'refund_pending') return false;
    return (nowMs - Date.parse(o.createdAt)) / 60_000 > Math.max(45, (o.etaMinutes?.max || 45) + 10);
  });
  if (delayed.length > 0) {
    alerts.push({
      id: 'alt-delayed-orders',
      title: `${delayed.length} delayed active order(s) exceeding ETA`,
      description: delayed.slice(0, 3).map((o) => o.orderNumber).join(', '),
      priority: 'high',
      category: 'operations',
      targetSection: 'live_ops',
      timestamp: delayed[0].createdAt || nowIso,
    });
  }

  // 6. Pending Partner Onboarding / Support Tickets
  const pendingApps = partnerApplications.filter((a) => a.status === 'pending');
  if (pendingApps.length > 0) {
    alerts.push({
      id: 'alt-pending-apps',
      title: `${pendingApps.length} partner / rider onboarding application(s) awaiting review`,
      description: pendingApps.slice(0, 2).map((a) => a.businessName || a.applicantName).join(', '),
      priority: 'medium',
      category: 'vendor',
      targetSection: 'vendors',
      timestamp: pendingApps[0].createdAt || nowIso,
    });
  }

  const openTickets = supportTickets.filter((t) => ['open', 'in_review'].includes(t.status));
  if (openTickets.length > 0) {
    alerts.push({
      id: 'alt-open-tickets',
      title: `${openTickets.length} unresolved support ticket(s)`,
      description: openTickets.slice(0, 2).map((t) => t.subject).join(' · '),
      priority: 'medium',
      category: 'operations',
      targetSection: 'alerts',
      timestamp: openTickets[0].createdAt || nowIso,
    });
  }

  // 7. Vendor offline / high cancellation checks
  const offlineVendors = vendors.filter((v) => v.approved && !v.suspended && !v.isOpen);
  if (offlineVendors.length > 0) {
    alerts.push({
      id: 'alt-offline-vendors',
      title: `${offlineVendors.length} approved vendor store(s) currently closed/offline`,
      description: offlineVendors.slice(0, 3).map((v) => v.name).join(', '),
      priority: 'info',
      category: 'vendor',
      targetSection: 'vendors',
      timestamp: nowIso,
    });
  }

  const priorityOrder: Record<OperationalAlert['priority'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    info: 3,
  };

  return alerts
    .map((a) => {
      const ack = acknowledgements[a.id];
      return {
        ...a,
        acknowledged: Boolean(ack),
        acknowledgedBy: ack?.acknowledgedBy,
        acknowledgedAt: ack?.acknowledgedAt,
      };
    })
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged) || priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export function buildDailyAggregates(orders: Order[], nowIso = new Date().toISOString()): AdminDailyAggregate[] {
  const byDate = new Map<string, Order[]>();
  for (const o of orders) {
    const day = o.createdAt.slice(0, 10);
    if (!day) continue;
    const list = byDate.get(day) || [];
    list.push(o);
    byDate.set(day, list);
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, list]) => {
      const fin = summarizeFinancialOrders(list, [], null, null);
      return {
        date,
        ordersCount: list.length,
        completedCount: list.filter((o) => o.status === 'delivered').length,
        cancelledCount: list.filter((o) => o.status === 'cancelled').length,
        gmvInr: fin.gmv,
        netRevenueInr: fin.netPlatformRevenue,
        commissionsInr: fin.vendorCommissions,
        deliveryRevenueInr: fin.deliveryRevenue,
        tipsInr: fin.riderTips,
        refundsInr: fin.refunds,
        updatedAt: nowIso,
      };
    });
}

function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsvContent(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildExcelSpreadsheetXml(params: {
  sheetName: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
}): string {
  const safeSheet = escapeXml(params.sheetName.slice(0, 31) || 'FYOORA Report');
  const headerXml = `<Row>${params.headers
    .map((h) => `<Cell ss:StyleID="sHeader"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`)
    .join('')}</Row>`;

  const bodyXml = params.rows
    .map(
      (r) =>
        `<Row>${r
          .map((cell) => {
            if (typeof cell === 'number' && Number.isFinite(cell)) {
              return `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`;
            }
            return `<Cell><Data ss:Type="String">${escapeXml(cell === null || cell === undefined ? '' : String(cell))}</Data></Cell>`;
          })
          .join('')}</Row>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="sHeader">
   <Font ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#252525" ss:Pattern="Solid"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="${safeSheet}">
  <Table>
   ${headerXml}
   ${bodyXml}
  </Table>
 </Worksheet>
</Workbook>`;
}

export function buildCouponAnalytics(coupons: Coupon[], orders: Order[]) {
  return coupons.map((c) => {
    const usedOrders = orders.filter(
      (o) => o.pricing.couponCode?.toUpperCase() === c.code.toUpperCase() && !['cancelled', 'refunded'].includes(o.status)
    );
    const totalDiscountGiven = usedOrders.reduce((s, o) => s + o.pricing.discount, 0);
    const attributedGmv = usedOrders.reduce((s, o) => s + o.pricing.grandTotal, 0);
    return {
      coupon: c,
      redemptions: usedOrders.length,
      totalDiscountGiven,
      attributedGmv,
    };
  });
}

export function buildReviewLookup(reviews: ReviewRecord[]) {
  const flagged = reviews.filter((r) => r.status === 'flagged').length;
  const avg = reviews.length
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : null;
  return { total: reviews.length, flagged, avgRating: avg };
}
