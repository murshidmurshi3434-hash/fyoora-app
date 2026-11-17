import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCsvContent,
  buildDailyAggregates,
  buildExcelSpreadsheetXml,
  buildRevenueSeries,
  calculateChangePct,
  computeCustomerAnalytics,
  computeExecutiveOverview,
  computeOperationalAlerts,
  computeServiceAnalytics,
  resolveDateWindow,
} from './adminAnalytics.ts';
import type {
  OperatingExpenseRecord,
  Order,
  PlatformServiceConfig,
  Product,
  RiderProfile,
  SettlementRecord,
  UserProfile,
  Vendor,
} from './types.ts';

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    orderNumber: 'FYR-1001',
    customerId: 'cust-1',
    customerName: 'Amina K',
    customerPhone: '+919847000111',
    serviceType: 'food',
    vendorId: 'vnd-1',
    vendorName: 'Malabar Spice',
    subOrders: [
      {
        subOrderId: 'sub-1',
        vendorId: 'vnd-1',
        vendorName: 'Malabar Spice',
        status: 'delivered',
        items: [],
        subtotal: 400,
        commissionAmount: 64,
        vendorNetPayout: 336,
      },
    ],
    items: [],
    deliveryAddress: {
      id: 'a1',
      label: 'Home',
      line1: 'Vadakara',
      city: 'Vadakara',
      district: 'Kozhikode',
      state: 'Kerala',
      pincode: '673101',
      lat: 11.6085,
      lng: 75.5917,
    },
    deliveryTier: 'NORMAL',
    deliveryMode: 'instant',
    riderInstructions: [],
    pricing: {
      itemsSubtotal: 400,
      discount: 0,
      deliveryFee: 30,
      platformFee: 5,
      riderTip: 20,
      grandTotal: 455,
    },
    etaMinutes: { min: 25, max: 35 },
    distanceKm: 2.1,
    paymentMethod: 'razorpay_upi',
    paymentStatus: 'captured',
    status: 'delivered',
    statusHistory: [
      { status: 'order_placed', timestamp: '2026-11-10T10:00:00.000Z', actorRole: 'customer' },
      { status: 'vendor_accepted', timestamp: '2026-11-10T10:02:00.000Z', actorRole: 'restaurant_owner' },
      { status: 'ready_for_pickup', timestamp: '2026-11-10T10:14:00.000Z', actorRole: 'restaurant_owner' },
      { status: 'rider_assigned', timestamp: '2026-11-10T10:15:00.000Z', actorRole: 'rider' },
      { status: 'delivered', timestamp: '2026-11-10T10:30:00.000Z', actorRole: 'rider' },
    ],
    riderId: 'rdr-1',
    riderName: 'Vishnu Raj',
    pickupOtp: '1111',
    deliveryOtp: '2222',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:30:00.000Z',
    ...overrides,
  };
}

const sampleVendor: Vendor = {
  id: 'vnd-1',
  ownerUserId: 'owner-1',
  name: 'Malabar Spice',
  serviceCategory: 'food',
  supportsPreBooking: true,
  cuisinesOrTags: ['Malabar'],
  logoUrl: '',
  coverUrl: '',
  address: 'Vadakara',
  areaName: 'Edodi',
  location: { lat: 11.6085, lng: 75.5917 },
  openingHours: '10:00 - 22:00',
  isOpen: true,
  approved: true,
  avgPrepTimeMins: 18,
  rating: 4.8,
  reviewCount: 12,
  priceLevel: 2,
  commissionRate: 0.16,
  coverageRadiusKm: 10,
};

const sampleRider: RiderProfile = {
  id: 'rdr-1',
  userId: 'u-rdr-1',
  fullName: 'Vishnu Raj',
  phone: '+919847330001',
  vehicleType: 'EV Scooter',
  vehicleNumber: 'KL-18-AB-4421',
  licenseNumber: 'DL-123',
  aadhaarLast4: '8492',
  kycStatus: 'approved',
  isOnline: true,
  currentLocation: { lat: 11.6085, lng: 75.5917 },
  lastLocationUpdatedAt: '2026-11-10T10:30:00.000Z',
  completedDeliveries: 5,
  rating: 4.9,
  earningsTotal: 500,
  tipsTotal: 60,
  pendingSettlement: 120,
};

const sampleCustomer: UserProfile = {
  id: 'cust-1',
  phone: '+919847000111',
  fullName: 'Amina K',
  preferredLanguage: 'en',
  role: 'customer',
  addresses: [],
  favourites: [],
  profileCompleted: true,
  accountStatus: 'active',
  loyaltyPoints: 50,
  referralCode: 'AMINA10',
  createdAt: '2026-11-10T09:00:00.000Z',
};

test('resolveDateWindow computes accurate current and prior windows', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');
  const today = resolveDateWindow({ preset: 'today', now });
  assert.equal(new Date(today.startMs!).toISOString(), '2026-11-15T00:00:00.000Z');
  assert.equal(new Date(today.prevStartMs!).toISOString(), '2026-11-14T00:00:00.000Z');

  const custom = resolveDateWindow({
    preset: 'custom',
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    now,
  });
  assert.ok(custom.startMs! < custom.endMs!);
  assert.ok(custom.prevEndMs! < custom.startMs!);
});

test('calculateChangePct returns null when prior period baseline is zero and current > 0', () => {
  assert.equal(calculateChangePct(100, 0), null);
  assert.equal(calculateChangePct(0, 0), 0);
  assert.equal(calculateChangePct(150, 100), 50);
  assert.equal(calculateChangePct(75, 100), -25);
});

test('computeExecutiveOverview reconciles financial KPIs and operations counts from real orders and logged expenses', () => {
  const now = new Date('2026-11-10T18:00:00.000Z');
  const o1 = makeOrder();
  const o2 = makeOrder({
    id: 'ord-2',
    orderNumber: 'FYR-1002',
    paymentMethod: 'cod',
    paymentStatus: 'refunded',
    status: 'refunded',
    pricing: {
      itemsSubtotal: 200,
      discount: 0,
      deliveryFee: 25,
      platformFee: 5,
      riderTip: 0,
      grandTotal: 230,
    },
    createdAt: '2026-11-10T11:00:00.000Z',
  });
  const expenses: OperatingExpenseRecord[] = [
    {
      id: 'exp-1',
      category: 'marketing',
      description: 'Vadakara Launch Flyer Print',
      amountInr: 15,
      incurredOn: '2026-11-10T08:00:00.000Z',
      createdBy: 'usr-admin-1',
      createdAt: '2026-11-10T08:00:00.000Z',
    },
  ];

  const ov = computeExecutiveOverview({
    orders: [o1, o2],
    users: [sampleCustomer],
    vendors: [sampleVendor],
    riders: [sampleRider],
    expenses,
    dateFilter: { preset: 'today', now },
  });

  // o1 only contributes to GMV/commissions/delivery/tips; o2 contributes to Refunds (230)
  // o1 grandTotal = 455, commission = 64, deliveryFee = 30, platformFee = 5, riderDeliveryShare = 24 (80% of 30)
  // gatewayFee = 2% of 455 = 9, other expense = 15 => totalOperatingExpenses = 24 + 9 + 15 = 48
  // grossPlatformIncome = 64 + 5 + 30 = 99 => netProfit = 99 - 48 = 51
  assert.equal(ov.summary.gmv, 455);
  assert.equal(ov.summary.vendorCommissions, 64);
  assert.equal(ov.summary.deliveryRevenue, 30);
  assert.equal(ov.summary.deliveryExpenses, 24);
  assert.equal(ov.summary.gatewayFees, 9);
  assert.equal(ov.summary.refunds, 230);
  assert.equal(ov.summary.totalOperatingExpenses, 48);
  assert.equal(ov.summary.estimatedNetProfit, 51);
  assert.equal(ov.financialKpis.length, 10);
  assert.equal(ov.operationsKpis.length, 12);
  assert.equal(ov.counts.completedOrders, 1);
  assert.equal(ov.counts.activeVendors, 1);
  assert.equal(ov.counts.onlineRiders, 1);
});

test('computeCustomerAnalytics classifies repeat high-value vs at-risk customers accurately', () => {
  const now = new Date('2026-11-20T10:00:00.000Z');
  const vipOrder = makeOrder({
    pricing: { itemsSubtotal: 2400, discount: 0, deliveryFee: 0, platformFee: 5, riderTip: 50, grandTotal: 2455 },
    createdAt: '2026-11-19T10:00:00.000Z',
  });
  const dormantUser: UserProfile = {
    ...sampleCustomer,
    id: 'cust-2',
    fullName: 'Dormant User',
    createdAt: '2026-09-01T10:00:00.000Z',
  };
  const res = computeCustomerAnalytics({
    users: [sampleCustomer, dormantUser],
    orders: [vipOrder],
    supportTickets: [],
    now,
  });

  const vip = res.items.find((i) => i.id === 'cust-1')!;
  const dormant = res.items.find((i) => i.id === 'cust-2')!;
  assert.equal(vip.segment, 'high_value');
  assert.equal(dormant.segment, 'inactive');
  assert.equal(res.totals.totalCustomers, 2);
});

test('computeServiceAnalytics returns all 8 FYOORA services including local_shopping without fake numbers', () => {
  const configs: PlatformServiceConfig[] = [
    { serviceKey: 'food', label: 'Food Delivery', enabled: true, commissionRate: 0.16, minOrderInr: 99, updatedAt: '' },
    { serviceKey: 'local_shopping', label: 'Local Shopping', enabled: false, commissionRate: 0.12, minOrderInr: 199, updatedAt: '' },
  ];
  const res = computeServiceAnalytics({
    orders: [makeOrder()],
    vendors: [sampleVendor],
    serviceConfigs: configs,
  });
  assert.equal(res.length, 8);
  const food = res.find((s) => s.serviceKey === 'food')!;
  const local = res.find((s) => s.serviceKey === 'local_shopping')!;
  assert.equal(food.orders, 1);
  assert.equal(food.gmv, 455);
  assert.equal(local.orders, 0);
  assert.equal(local.gmv, 0);
  assert.equal(local.enabled, false);
});

test('computeOperationalAlerts detects out-of-stock, pending settlements, and no online riders', () => {
  const products: Product[] = [
    {
      id: 'p1',
      vendorId: 'vnd-1',
      serviceCategory: 'grocery',
      category: 'Oil',
      name: 'Coconut Oil',
      description: '',
      imageUrl: '',
      price: 200,
      inStock: false,
      stockQty: 0,
    },
  ];
  const settlements: SettlementRecord[] = [
    {
      id: 'stl-1',
      recipientType: 'vendor',
      recipientId: 'vnd-1',
      recipientName: 'Malabar Spice',
      grossAmount: 400,
      commissionOrFee: 64,
      tipsIncluded: 0,
      netPayout: 336,
      status: 'pending',
      periodLabel: 'Cycle 1',
      createdAt: '2026-11-10T10:00:00.000Z',
    },
  ];
  const alerts = computeOperationalAlerts({
    orders: [],
    products,
    vendors: [sampleVendor],
    riders: [{ ...sampleRider, isOnline: false }],
    settlements,
    paymentTransactions: [],
    supportTickets: [],
    partnerApplications: [],
    acknowledgements: { 'alt-no-riders-online': { alertId: 'alt-no-riders-online', acknowledgedBy: 'admin', acknowledgedAt: '2026-11-10T12:00:00.000Z' } },
  });

  const noRiderAlert = alerts.find((a) => a.id === 'alt-no-riders-online');
  assert.ok(noRiderAlert);
  assert.equal(noRiderAlert.acknowledged, true);
  assert.ok(alerts.some((a) => a.id === 'alt-out-of-stock'));
  assert.ok(alerts.some((a) => a.id === 'alt-pending-settlements'));
});

test('buildRevenueSeries, buildDailyAggregates, buildCsvContent and buildExcelSpreadsheetXml produce valid outputs', () => {
  const o1 = makeOrder();
  const series = buildRevenueSeries([o1], [], 'daily');
  assert.equal(series.length, 1);
  assert.equal(series[0].gmv, 455);

  const daily = buildDailyAggregates([o1]);
  assert.equal(daily[0].date, '2026-11-10');
  assert.equal(daily[0].ordersCount, 1);

  const csv = buildCsvContent(['Order', 'Amount'], [['FYR-1001, VIP', 455]]);
  assert.equal(csv, 'Order,Amount\n"FYR-1001, VIP",455');

  const xls = buildExcelSpreadsheetXml({
    sheetName: 'Sales',
    headers: ['Order', 'Amount'],
    rows: [['FYR-1001', 455]],
  });
  assert.ok(xls.includes('<Workbook'));
  assert.ok(xls.includes('<Data ss:Type="Number">455</Data>'));
});
