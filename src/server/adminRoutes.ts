import crypto from 'node:crypto';
import express from 'express';
import {
  buildCouponAnalytics,
  buildCsvContent,
  buildDailyAggregates,
  buildExcelSpreadsheetXml,
  buildRevenueSeries,
  computeCustomerAnalytics,
  computeExecutiveOverview,
  computeLiveOperations,
  computeOperationalAlerts,
  computeOrderAnalytics,
  computeRiderAnalytics,
  computeServiceAnalytics,
  computeVendorAnalytics,
  filterOrdersByCriteria,
  resolveDateWindow,
  type DateRangePreset,
} from '../shared/adminAnalytics.ts';
import type {
  AdminSectionKey,
  AdminServiceKey,
  Order,
  PaymentMethod,
  RiderProfile,
  SettlementRecord,
} from '../shared/types.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from './auth.ts';
import { getDb, withTransaction } from './store.ts';
import { fetchRazorpayRefundForOrder, requestRazorpayRefund } from './payments.ts';
import { runAdminBiAnalysis, type AdminBiRequest } from './ai.ts';

function parseDateFilter(query: Record<string, unknown>) {
  const preset = String(query.preset || 'all') as DateRangePreset;
  const startDate = query.startDate ? String(query.startDate) : undefined;
  const endDate = query.endDate ? String(query.endDate) : undefined;
  return { preset, startDate, endDate };
}

function parseCriteriaFilters(query: Record<string, unknown>) {
  return {
    serviceType: query.serviceType ? String(query.serviceType) : 'all',
    vendorId: query.vendorId ? String(query.vendorId) : 'all',
    riderId: query.riderId ? String(query.riderId) : 'all',
    paymentMethod: (query.paymentMethod ? String(query.paymentMethod) : 'all') as PaymentMethod | 'all',
  };
}

function getStaffPermissions(req: AuthenticatedRequest): AdminSectionKey[] {
  const user = req.authUser!;
  if (user.role === 'super_admin') {
    return [
      'overview',
      'analytics',
      'live_ops',
      'finance',
      'customers',
      'vendors',
      'riders',
      'services',
      'service_area',
      'marketing',
      'ai_bi',
      'alerts',
      'security',
      'reports',
    ];
  }
  const staff = getDb().adminStaff.find(
    (s) => s.id === user.id || (user.email && s.email.toLowerCase() === user.email.toLowerCase())
  );
  if (staff && staff.permissions.length > 0) return staff.permissions;
  if (user.role === 'admin') {
    return [
      'overview',
      'analytics',
      'live_ops',
      'finance',
      'customers',
      'vendors',
      'riders',
      'services',
      'service_area',
      'marketing',
      'ai_bi',
      'alerts',
      'reports',
    ];
  }
  return ['overview', 'live_ops', 'customers', 'alerts'];
}

function requireAdminSection(section: AdminSectionKey) {
  return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    const perms = getStaffPermissions(req);
    if (!perms.includes(section)) {
      return res.status(403).json({ error: `Forbidden: your admin role lacks "${section}" permission.` });
    }
    next();
  };
}

export function createAdminRouter() {
  const router = express.Router();

  // Require verified admin/super_admin/support_staff session on all /api/admin endpoints
  router.use(requireAuth, requireRole('admin', 'super_admin', 'support_staff'));

  // ── 1. Comprehensive Executive Overview & BI Payload ─────────────────────────
  router.get('/overview', (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const dateFilter = parseDateFilter(req.query);
    const filters = parseCriteriaFilters(req.query);
    const permissions = getStaffPermissions(req);

    const exec = computeExecutiveOverview({
      orders: db.orders,
      users: db.users,
      vendors: db.vendors,
      riders: db.riders,
      expenses: db.expenses,
      dateFilter,
      filters,
    });

    const filteredOrders = filterOrdersByCriteria(
      db.orders,
      exec.window.startMs,
      exec.window.endMs,
      filters
    );

    const revenueSeriesDaily = buildRevenueSeries(filteredOrders, db.expenses, 'daily');
    const revenueSeriesWeekly = buildRevenueSeries(filteredOrders, db.expenses, 'weekly');
    const revenueSeriesMonthly = buildRevenueSeries(filteredOrders, db.expenses, 'monthly');
    const revenueSeriesYearly = buildRevenueSeries(filteredOrders, db.expenses, 'yearly');

    const orderAnalytics = computeOrderAnalytics(filteredOrders);
    const customerAnalytics = computeCustomerAnalytics({
      users: db.users,
      orders: db.orders,
      supportTickets: db.supportTickets,
    });
    const vendorAnalytics = computeVendorAnalytics({
      vendors: db.vendors,
      orders: filteredOrders,
      products: db.products,
      supportTickets: db.supportTickets,
    });
    const riderAnalytics = computeRiderAnalytics({
      riders: db.riders,
      orders: filteredOrders,
      supportTickets: db.supportTickets,
    });
    const serviceAnalytics = computeServiceAnalytics({
      orders: filteredOrders,
      vendors: db.vendors,
      serviceConfigs: db.serviceConfigs,
    });
    const liveOps = computeLiveOperations({
      orders: db.orders,
      riders: db.riders,
      users: db.users,
      partnerApplications: db.partnerApplications,
      auditLogs: db.auditLogs,
      paymentTransactions: db.paymentTransactions,
    });
    const alerts = computeOperationalAlerts({
      orders: db.orders,
      products: db.products,
      vendors: db.vendors,
      riders: db.riders,
      settlements: db.settlements,
      paymentTransactions: db.paymentTransactions,
      supportTickets: db.supportTickets,
      partnerApplications: db.partnerApplications,
      acknowledgements: db.alertAcknowledgements,
    });
    const dailyAggregates = buildDailyAggregates(db.orders);
    const couponAnalytics = buildCouponAnalytics(db.coupons, filteredOrders);

    // Backwards-compatible summary object
    const paidOrders = db.orders.filter(
      (o) => o.paymentStatus === 'captured' && !['cancelled', 'refunded', 'refund_pending'].includes(o.status)
    );
    const legacyStats = {
      totalOrders: exec.counts.totalOrders,
      grossSales: exec.summary.gmv,
      totalCommission: exec.summary.vendorCommissions,
      deliveryRevenue: exec.summary.deliveryRevenue,
      platformFees: exec.summary.platformFees,
      totalTips: exec.summary.riderTips,
      netOperatingRevenue: exec.summary.netPlatformRevenue,
      totalCustomers: exec.counts.registeredCustomers,
      totalVendors: db.vendors.length,
      activeRiders: exec.counts.onlineRiders,
      pendingOrders: exec.counts.pendingOrders,
      completedDeliveries: exec.counts.completedOrders,
      cancelledOrders: exec.counts.cancelledOrders,
      lifetimePaidOrders: paidOrders.length,
    };

    const canFinance = permissions.includes('finance');
    const canSecurity = permissions.includes('security');

    return res.json({
      permissions,
      stats: legacyStats,
      executive: exec,
      analytics: {
        revenueDaily: revenueSeriesDaily,
        revenueWeekly: revenueSeriesWeekly,
        revenueMonthly: revenueSeriesMonthly,
        revenueYearly: revenueSeriesYearly,
        orders: orderAnalytics,
        customers: customerAnalytics,
        vendors: vendorAnalytics,
        riders: riderAnalytics,
        services: serviceAnalytics,
        coupons: couponAnalytics,
      },
      liveOps,
      alerts,
      dailyAggregates,
      users: db.users
        .filter((u) => u.role === 'customer')
        .map((u) => ({
          id: u.id,
          fullName: u.fullName,
          phone: u.contactPhone || u.phone,
          email: u.email,
          accountStatus: u.accountStatus,
          profileCompleted: u.profileCompleted,
          loyaltyPoints: u.loyaltyPoints,
          createdAt: u.createdAt,
        })),
      vendors: db.vendors,
      products: db.products,
      riders: db.riders,
      orders: filteredOrders,
      allOrdersCount: db.orders.length,
      coupons: db.coupons,
      banners: db.banners,
      serviceAreas: db.serviceAreas,
      serviceConfigs: db.serviceConfigs,
      settlements: canFinance ? db.settlements : [],
      paymentTransactions: canFinance ? db.paymentTransactions : [],
      expenses: canFinance ? db.expenses : [],
      marketingCampaigns: db.marketingCampaigns,
      referralSettings: db.referralSettings,
      supportTickets: db.supportTickets,
      featureSuggestions: db.featureSuggestions,
      reviews: db.reviews,
      partnerApplications: db.partnerApplications,
      adminStaff: canSecurity ? db.adminStaff : [],
      auditLogs: canSecurity ? db.auditLogs : db.auditLogs.slice(0, 15),
    });
  });

  // ── 2. Paginated Orders Query ────────────────────────────────────────────────
  router.get('/orders', (req, res) => {
    const db = getDb();
    const dateFilter = parseDateFilter(req.query);
    const window = resolveDateWindow(dateFilter);
    const filters = parseCriteriaFilters(req.query);
    const status = req.query.status ? String(req.query.status) : 'all';
    const search = String(req.query.search || '').trim().toLowerCase();
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(5, Number(req.query.limit || 25)));

    let list = filterOrdersByCriteria(db.orders, window.startMs, window.endMs, filters);
    if (status !== 'all') {
      list = list.filter((o) => o.status === status);
    }
    if (search) {
      list = list.filter((o) =>
        `${o.orderNumber} ${o.customerName} ${o.customerPhone} ${o.vendorName || ''} ${o.riderName || ''}`
          .toLowerCase()
          .includes(search)
      );
    }
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const paged = list.slice((page - 1) * limit, page * limit);
    return res.json({ orders: paged, page, limit, total, totalPages });
  });

  // ── 3. Customer Detail (with Sensitive PII Access Logging) ───────────────────
  router.get('/customers/:customerId', requireAdminSection('customers'), async (req: AuthenticatedRequest, res) => {
    try {
      const result = await withTransaction((db) => {
        const customer = db.users.find((u) => u.id === req.params.customerId && u.role === 'customer');
        if (!customer) throw new Error('Customer not found.');
        const customerOrders = db.orders.filter((o) => o.customerId === customer.id);
        const customerTickets = db.supportTickets.filter((t) => t.userId === customer.id);
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_VIEW_CUSTOMER_PII',
          targetType: 'customer',
          targetId: customer.id,
          details: `Viewed profile & order history for customer ${customer.fullName || customer.id}`,
          createdAt: new Date().toISOString(),
        });
        return {
          customer: {
            id: customer.id,
            fullName: customer.fullName,
            phone: customer.contactPhone || customer.phone,
            email: customer.email,
            accountStatus: customer.accountStatus,
            profileCompleted: customer.profileCompleted,
            loyaltyPoints: customer.loyaltyPoints,
            referralCode: customer.referralCode,
            addressesCount: customer.addresses.length,
            addresses: customer.addresses,
            createdAt: customer.createdAt,
          },
          orders: customerOrders,
          tickets: customerTickets,
        };
      });
      return res.json(result);
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Customer not found.' });
    }
  });

  router.patch('/customers/:customerId/status', requireAdminSection('customers'), async (req: AuthenticatedRequest, res) => {
    const requestedStatus = req.body?.status;
    if (!['active', 'suspended'].includes(String(requestedStatus))) {
      return res.status(400).json({ error: 'Customer status must be active or suspended.' });
    }
    try {
      const customer = await withTransaction((db) => {
        const target = db.users.find((item) => item.id === req.params.customerId);
        if (!target || target.role !== 'customer') throw new Error('Customer not found.');
        const previousStatus = target.accountStatus;
        target.accountStatus = requestedStatus;
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: requestedStatus === 'suspended' ? 'ADMIN_SUSPEND_CUSTOMER' : 'ADMIN_REACTIVATE_CUSTOMER',
          targetType: 'customer',
          targetId: target.id,
          details: `Customer ${target.fullName} status changed from ${previousStatus} to ${requestedStatus}`,
          createdAt: new Date().toISOString(),
        });
        return {
          id: target.id,
          fullName: target.fullName,
          phone: target.contactPhone || target.phone,
          email: target.email,
          accountStatus: target.accountStatus,
          profileCompleted: target.profileCompleted,
          createdAt: target.createdAt,
        };
      });
      return res.json({ customer });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Customer update failed.' });
    }
  });

  // ── 4. Vadakara Service Area, Zones, Tiers & Restricted Areas ────────────────
  router.put('/service-area', requireAdminSection('service_area'), async (req: AuthenticatedRequest, res) => {
    const updated = await withTransaction((db) => {
     const area = db.serviceAreas[0];

if (!area) {
  throw new Error('No service area is configured.');
}
      if (req.body?.name) area.name = String(req.body.name);
      if (typeof req.body?.radiusKm === 'number') area.radiusKm = Math.max(1, Math.min(50, req.body.radiusKm));
      if (typeof req.body?.isActive === 'boolean') area.isActive = req.body.isActive;
      if (req.body?.center?.lat && req.body?.center?.lng) {
        area.center = { lat: Number(req.body.center.lat), lng: Number(req.body.center.lng) };
      }
      if (req.body?.deliveryPricing) {
        area.deliveryPricing = { ...area.deliveryPricing, ...req.body.deliveryPricing };
      }
      if (req.body?.pickupDropPricing) {
        area.pickupDropPricing = { ...area.pickupDropPricing, ...req.body.pickupDropPricing };
      }
      if (req.body?.operatingHours) {
        area.operatingHours = { ...area.operatingHours, ...req.body.operatingHours };
      }
      if (req.body?.deliveryTiersEnabled) {
        area.deliveryTiersEnabled = {
          ...(area.deliveryTiersEnabled || { EXPRESS: true, NORMAL: true, ECO: true }),
          ...req.body.deliveryTiersEnabled,
        };
      }
      if (Array.isArray(req.body?.deliveryZones)) {
        area.deliveryZones = req.body.deliveryZones;
      }
      if (Array.isArray(req.body?.restrictedZones)) {
        area.restrictedZones = req.body.restrictedZones;
      }
      if (req.body?.minOrderValues) {
        area.minOrderValues = { ...area.minOrderValues, ...req.body.minOrderValues };
      }
      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'UPDATE_SERVICE_AREA',
        targetType: 'service_area',
        targetId: area.id,
        details: `Updated radius=${area.radiusKm}km, active=${area.isActive}, baseFee=₹${area.deliveryPricing.baseFeeInr}`,
        createdAt: new Date().toISOString(),
      });
      return area;
    });
    return res.json({ serviceArea: updated });
  });

  // ── 5. Service Management (All 8 FYOORA Services) ────────────────────────────
  router.patch('/services/:serviceKey', requireAdminSection('services'), async (req: AuthenticatedRequest, res) => {
    const key = String(req.params.serviceKey) as AdminServiceKey;
    try {
      const updated = await withTransaction((db) => {
        const cfg = db.serviceConfigs.find((s) => s.serviceKey === key);
        if (!cfg) throw new Error('Service configuration not found.');
        if (typeof req.body?.enabled === 'boolean') cfg.enabled = req.body.enabled;
        if (typeof req.body?.commissionRate === 'number') {
          cfg.commissionRate = Math.max(0.01, Math.min(0.4, req.body.commissionRate));
        }
        if (typeof req.body?.minOrderInr === 'number') {
          cfg.minOrderInr = Math.max(0, Math.min(5000, req.body.minOrderInr));
          const area = db.serviceAreas[0];
          if (area && key !== 'pickup_drop' && key !== 'local_shopping') {
            area.minOrderValues[key] = cfg.minOrderInr;
          }
        }
        if (req.body?.notes !== undefined) cfg.notes = String(req.body.notes);
        cfg.updatedAt = new Date().toISOString();

        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_SERVICE_CONFIG_UPDATED',
          targetType: 'service',
          targetId: cfg.serviceKey,
          details: `${cfg.label}: enabled=${cfg.enabled}, commission=${Math.round(cfg.commissionRate * 100)}%, minOrder=₹${cfg.minOrderInr}`,
          createdAt: cfg.updatedAt,
        });
        return cfg;
      });
      return res.json({ service: updated });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Service update failed.' });
    }
  });

  // ── 6. Vendors, Inventory, Applications & Riders ─────────────────────────────
  router.patch('/vendors/:vendorId', requireAdminSection('vendors'), async (req: AuthenticatedRequest, res) => {
    try {
      const vendor = await withTransaction((db) => {
        const v = db.vendors.find((item) => item.id === req.params.vendorId);
        if (!v) throw new Error('Vendor not found.');
        if (typeof req.body?.approved === 'boolean') v.approved = req.body.approved;
        if (typeof req.body?.suspended === 'boolean') v.suspended = req.body.suspended;
        if (typeof req.body?.isOpen === 'boolean') v.isOpen = req.body.isOpen;
        if (req.body?.openingHours) v.openingHours = String(req.body.openingHours);
        if (typeof req.body?.commissionRate === 'number') {
          v.commissionRate = Math.max(0.01, Math.min(0.4, req.body.commissionRate));
        }
        if (typeof req.body?.coverageRadiusKm === 'number') {
          v.coverageRadiusKm = Math.max(1, Math.min(50, req.body.coverageRadiusKm));
        }
        if (typeof req.body?.featured === 'boolean') v.featured = req.body.featured;
        if (typeof req.body?.sponsored === 'boolean') v.sponsored = req.body.sponsored;
        if (['verified', 'pending', 'rejected'].includes(String(req.body?.verificationStatus))) {
          v.verificationStatus = req.body.verificationStatus;
        }
        if (req.body?.verificationNotes !== undefined) {
          v.verificationNotes = String(req.body.verificationNotes);
        }
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_VENDOR_UPDATE',
          targetType: 'vendor',
          targetId: v.id,
          details: `${v.name}: open=${v.isOpen}, approved=${v.approved}, suspended=${Boolean(v.suspended)}, commission=${Math.round(v.commissionRate * 100)}%`,
          createdAt: new Date().toISOString(),
        });
        return v;
      });
      return res.json({ vendor });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Vendor update failed.' });
    }
  });

  router.patch('/products/:productId', requireAdminSection('vendors'), async (req: AuthenticatedRequest, res) => {
    try {
      const product = await withTransaction((db) => {
        const p = db.products.find((item) => item.id === req.params.productId);
        if (!p) throw new Error('Product not found.');
        if (typeof req.body?.stockQty === 'number') {
          p.stockQty = Math.max(0, Math.round(req.body.stockQty));
          p.inStock = p.stockQty > 0 && !p.soldOutManual;
        }
        if (typeof req.body?.soldOutManual === 'boolean') {
          p.soldOutManual = req.body.soldOutManual;
          p.inStock = !p.soldOutManual && p.stockQty > 0;
        }
        if (typeof req.body?.price === 'number') {
          p.price = Math.max(1, Math.round(req.body.price));
        }
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_PRODUCT_INVENTORY_UPDATE',
          targetType: 'product',
          targetId: p.id,
          details: `${p.name}: stockQty=${p.stockQty}, inStock=${p.inStock}, price=₹${p.price}`,
          createdAt: new Date().toISOString(),
        });
        return p;
      });
      return res.json({ product });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Product update failed.' });
    }
  });

  router.patch('/riders/:riderId', requireAdminSection('riders'), async (req: AuthenticatedRequest, res) => {
    try {
      const rider = await withTransaction((db) => {
        const r = db.riders.find((item) => item.id === req.params.riderId);
        if (!r) throw new Error('Rider not found.');
        if (req.body?.kycStatus) r.kycStatus = req.body.kycStatus;
        if (typeof req.body?.suspended === 'boolean') {
          r.suspended = req.body.suspended;
          if (r.suspended) r.isOnline = false;
        }
        if (typeof req.body?.isOnline === 'boolean') {
          if (req.body.isOnline && (r.kycStatus !== 'approved' || r.suspended)) {
            throw new Error('Cannot set an unapproved or suspended rider online.');
          }
          r.isOnline = req.body.isOnline;
        }
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_RIDER_UPDATE',
          targetType: 'rider',
          targetId: r.id,
          details: `${r.fullName}: kyc=${r.kycStatus}, suspended=${Boolean(r.suspended)}, online=${r.isOnline}`,
          createdAt: new Date().toISOString(),
        });
        return r;
      });
      return res.json({ rider });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Rider update failed.' });
    }
  });

  router.patch('/applications/:id', requireAdminSection('vendors'), async (req: AuthenticatedRequest, res) => {
    try {
      const status = req.body?.status === 'approved' ? 'approved' : req.body?.status === 'rejected' ? 'rejected' : null;
      if (!status) {
        return res.status(400).json({ error: 'Valid status (approved or rejected) required.' });
      }
      const reviewNote = req.body?.reviewNote ? String(req.body.reviewNote).trim() : undefined;

      const updated = await withTransaction((db) => {
        const appItem = db.partnerApplications.find((a) => a.id === req.params.id);
        if (!appItem) throw new Error('Application not found.');
        const now = new Date().toISOString();
        appItem.status = status;
        appItem.reviewNote = reviewNote;
        appItem.reviewedAt = now;

        const applicantUser = db.users.find((u) => u.id === appItem.userId);
        if (status === 'approved') {
          if (appItem.type === 'vendor') {
            const cat = appItem.serviceCategory || 'food';
            const vendorId = `vnd-${crypto.randomBytes(4).toString('hex')}`;
            const defaultImg =
              cat === 'bakery'
                ? '/assets/images/bakery_chocolate_truffle_cake_1794743269847.jpg'
                : cat === 'grocery'
                  ? '/assets/images/grocery_fresh_produce_basket_1794743270074.jpg'
                  : cat === 'celebration'
                    ? '/assets/images/celebration_birthday_decor_kit_1794743270959.jpg'
                    : cat === 'flowers_gifts'
                      ? '/assets/images/florist_red_roses_bouquet_1794743271556.jpg'
                      : '/assets/images/vadakara_malabar_biriyani_1794743269068.jpg';

            db.vendors.unshift({
              id: vendorId,
              ownerUserId: appItem.userId,
              name: appItem.businessName || `${appItem.applicantName} Store`,
              serviceCategory: cat,
              supportsPreBooking: cat === 'food',
              cuisinesOrTags: ['Vadakara Local', 'FYOORA Verified'],
              logoUrl: defaultImg,
              coverUrl: defaultImg,
              address: appItem.address || 'Vadakara Town, Kozhikode',
              areaName: appItem.areaName || 'Vadakara',
              location: { lat: 11.6085, lng: 75.5917 },
              openingHours: '09:00 AM – 10:00 PM',
              isOpen: true,
              approved: true,
              verificationStatus: 'verified',
              avgPrepTimeMins: 20,
              rating: 4.8,
              reviewCount: 1,
              priceLevel: 2,
              commissionRate: cat === 'grocery' ? 0.1 : 0.15,
              coverageRadiusKm: 10,
            });
            if (applicantUser) {
              applicantUser.vendorId = vendorId;
              applicantUser.role =
                cat === 'bakery'
                  ? 'bakery_owner'
                  : cat === 'grocery'
                    ? 'grocery_owner'
                    : cat === 'food'
                      ? 'restaurant_owner'
                      : 'merchant';
            }
          } else {
            const riderId = `rdr-${crypto.randomBytes(4).toString('hex')}`;
            const newRider: RiderProfile = {
              id: riderId,
              userId: appItem.userId,
              fullName: appItem.applicantName,
              phone: appItem.phone,
              vehicleType: appItem.vehicleType || 'Two-Wheeler',
              vehicleNumber: appItem.vehicleNumber || 'KL-18-NEW',
              licenseNumber: appItem.licenseNumber || 'PENDING',
              aadhaarLast4: appItem.aadhaarLast4 || '0000',
              kycStatus: 'approved',
              isOnline: false,
              currentLocation: { lat: 11.6085, lng: 75.5917 },
              lastLocationUpdatedAt: now,
              completedDeliveries: 0,
              rating: 5.0,
              earningsTotal: 0,
              tipsTotal: 0,
              pendingSettlement: 0,
            };
            db.riders.unshift(newRider);
            if (applicantUser) {
              applicantUser.riderId = riderId;
              applicantUser.role = 'rider';
            }
          }
        }

        db.notifications.unshift({
          id: `ntf-${Date.now()}`,
          userId: appItem.userId,
          title: `FYOORA ${appItem.type === 'vendor' ? 'Partner' : 'Rider'} Application ${status.toUpperCase()}`,
          body:
            status === 'approved'
              ? `Welcome to FYOORA Vadakara! Your ${appItem.type} portal is now unlocked.`
              : `Your ${appItem.type} application was not approved.${reviewNote ? ` Note: ${reviewNote}` : ''}`,
          category: 'system',
          read: false,
          createdAt: now,
        });

        db.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: `ADMIN_${status.toUpperCase()}_APPLICATION`,
          targetType: 'partner_application',
          targetId: appItem.id,
          details: `${appItem.type} application by ${appItem.applicantName} ${status}`,
          createdAt: now,
        });

        return appItem;
      });
      return res.json({ application: updated });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to review application.' });
    }
  });

  // ── 7. Order Rider Assignment & Razorpay Refund Reconciliation ───────────────
  router.patch('/orders/:orderId/assign-rider', requireAdminSection('live_ops'), async (req: AuthenticatedRequest, res) => {
    try {
      const riderId = String(req.body?.riderId || '');
      if (!riderId) return res.status(400).json({ error: 'riderId is required.' });
      const order = await withTransaction((db) => {
        const ord = db.orders.find((o) => o.id === req.params.orderId);
        if (!ord) throw new Error('Order not found.');
        const rider = db.riders.find((r) => r.id === riderId && r.kycStatus === 'approved' && !r.suspended);
        if (!rider) throw new Error('Approved active rider not found.');
        const now = new Date().toISOString();
        ord.riderId = rider.id;
        ord.riderName = rider.fullName;
        ord.riderPhone = rider.phone;
        if (['order_placed', 'payment_confirmed', 'vendor_accepted', 'preparation_started', 'ready_for_pickup'].includes(ord.status)) {
          ord.status = 'rider_assigned';
          ord.statusHistory.push({
            status: 'rider_assigned',
            timestamp: now,
            actorRole: req.authUser!.role,
            note: `Manually assigned to ${rider.fullName}`,
          });
        }
        ord.updatedAt = now;
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_ASSIGN_RIDER',
          targetType: 'order',
          targetId: ord.id,
          details: `Assigned ${rider.fullName} to ${ord.orderNumber}`,
          createdAt: now,
        });
        return ord;
      });
      return res.json({ order });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to assign rider.' });
    }
  });

  router.post('/orders/:orderId/refund', requireAdminSection('finance'), async (req: AuthenticatedRequest, res) => {
    let reservedOrder: Order;
    try {
      const reservation = await withTransaction((db) => {
        const order = db.orders.find((item) => item.id === req.params.orderId);
        if (!order) throw new Error('Order not found.');
        if (order.paymentStatus === 'refunded') {
          return { order, complete: true, inProgress: false };
        }
        if (order.razorpayRefundStatus === 'processed') {
          throw new Error('A partial refund was processed. Reconcile the remaining balance in Razorpay before continuing.');
        }
        if (order.razorpayRefundId && order.paymentStatus === 'refund_pending') {
          return { order, complete: false, inProgress: true };
        }
        if (order.refundRequestStartedAt) {
          return { order, complete: false, inProgress: true };
        }
        if (!['cancelled', 'refund_pending'].includes(order.status)) {
          throw new Error('Cancel the order before requesting a refund.');
        }
        if (!order.razorpayPaymentId) {
          throw new Error('This order has no verified Razorpay payment to refund.');
        }
        if (!['captured', 'refund_pending'].includes(order.paymentStatus)) {
          throw new Error('Only a captured Razorpay payment can be refunded.');
        }
        const now = new Date().toISOString();
        order.paymentStatus = 'refund_pending';
        order.refundRequestStartedAt = now;
        order.razorpayRefundId = undefined;
        order.razorpayRefundStatus = undefined;
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_RAZORPAY_REFUND_REQUESTED',
          targetType: 'order',
          targetId: order.id,
          details: `Full Razorpay refund requested for ${order.orderNumber}`,
          createdAt: now,
        });
        return { order, complete: false, inProgress: false };
      });

      if (reservation.complete) return res.json({ order: reservation.order, alreadyRefunded: true });
      if (reservation.inProgress) {
        return res.status(409).json({ error: 'A refund request is already in progress. Check the Razorpay dashboard or wait for its webhook update.' });
      }
      reservedOrder = reservation.order;
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to request refund.' });
    }

    try {
      const refund = await requestRazorpayRefund({
        paymentId: reservedOrder.razorpayPaymentId!,
        orderId: reservedOrder.id,
      });
      const order = await withTransaction((db) => {
        const current = db.orders.find((item) => item.id === reservedOrder.id);
        if (!current) throw new Error('Order disappeared while updating refund status.');
        if (
          current.razorpayRefundStatus === 'processed' ||
          current.paymentStatus === 'refunded' ||
          (current.razorpayRefundStatus === 'failed' && !current.refundRequestStartedAt)
        ) return current;
        current.razorpayRefundId = refund.refundId;
        current.razorpayRefundStatus = refund.status;
        current.refundRequestStartedAt = refund.status === 'pending' ? current.refundRequestStartedAt : undefined;
        current.paymentStatus = refund.status === 'processed' ? 'refunded' : refund.status === 'failed' ? 'captured' : 'refund_pending';
        if (refund.status === 'processed') {
          current.status = 'refunded';
          current.statusHistory.push({
            status: 'refunded',
            timestamp: new Date().toISOString(),
            actorRole: req.authUser!.role,
            note: `Razorpay refund ${refund.refundId} processed`,
          });
        }
        current.updatedAt = new Date().toISOString();
        db.paymentTransactions
          .filter((tx) => tx.orderId === current.id && tx.gateway === 'razorpay')
          .forEach((tx) => {
            tx.status = current.paymentStatus;
            tx.updatedAt = current.updatedAt;
          });
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: `RAZORPAY_REFUND_${refund.status.toUpperCase()}`,
          targetType: 'order',
          targetId: current.id,
          details: `Razorpay refund ${refund.refundId} for ${current.orderNumber} is ${refund.status}`,
          createdAt: current.updatedAt,
        });
        if (refund.status === 'processed') {
          db.notifications.unshift({
            id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
            userId: current.customerId,
            title: `Refund processed for ${current.orderNumber}`,
            body: `Your refund of ₹${current.pricing.grandTotal} has been processed by Razorpay.`,
            category: 'payment',
            orderId: current.id,
            read: false,
            createdAt: current.updatedAt,
          });
        }
        return current;
      });
      return res.json({ order, refundStatus: refund.status });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Razorpay refund request failed.';
      return res.status(502).json({ error: `${message} Check Razorpay before retrying; the request may still be processing.` });
    }
  });

  router.post('/orders/:orderId/refund-status', requireAdminSection('finance'), async (req: AuthenticatedRequest, res) => {
    const snapshot = getDb().orders.find((item) => item.id === req.params.orderId);
    if (!snapshot) return res.status(404).json({ error: 'Order not found.' });
    if (!snapshot.razorpayPaymentId) return res.status(400).json({ error: 'This order has no Razorpay payment to check.' });
    try {
      const refund = await fetchRazorpayRefundForOrder({
        paymentId: snapshot.razorpayPaymentId,
        orderId: snapshot.id,
      });
      if (!refund) return res.json({ found: false, order: snapshot });

      const order = await withTransaction((db) => {
        const current = db.orders.find((item) => item.id === snapshot.id);
        if (!current) throw new Error('Order disappeared while updating refund status.');
        if (current.paymentStatus === 'refunded') return current;
        const now = new Date().toISOString();
        current.razorpayRefundId = refund.refundId;
        current.razorpayRefundStatus = refund.status;
        if (refund.status === 'failed') {
          current.razorpayRefundId = undefined;
          current.paymentStatus = 'captured';
          current.refundRequestStartedAt = undefined;
        } else if (refund.status === 'processed' && refund.amount >= Math.round(current.pricing.grandTotal * 100)) {
          current.paymentStatus = 'refunded';
          current.status = 'refunded';
          current.refundRequestStartedAt = undefined;
          current.statusHistory.push({
            status: 'refunded',
            timestamp: now,
            actorRole: req.authUser!.role,
            note: `Razorpay refund ${refund.refundId} confirmed from gateway`,
          });
          db.notifications.unshift({
            id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
            userId: current.customerId,
            title: `Refund processed for ${current.orderNumber}`,
            body: `Your refund of ₹${current.pricing.grandTotal} has been processed by Razorpay.`,
            category: 'payment',
            orderId: current.id,
            read: false,
            createdAt: now,
          });
        } else if (refund.status === 'processed') {
          current.paymentStatus = 'refund_pending';
          current.refundRequestStartedAt = undefined;
        } else {
          current.paymentStatus = 'refund_pending';
        }
        current.updatedAt = now;
        db.paymentTransactions
          .filter((tx) => tx.orderId === current.id && tx.gateway === 'razorpay')
          .forEach((tx) => {
            tx.status = current.paymentStatus;
            tx.updatedAt = now;
          });
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: `ADMIN_RECONCILE_RAZORPAY_REFUND_${refund.status.toUpperCase()}`,
          targetType: 'order',
          targetId: current.id,
          details: `Checked Razorpay refund ${refund.refundId} for ${current.orderNumber}: ${refund.status}`,
          createdAt: now,
        });
        return current;
      });
      return res.json({ found: true, order, refundStatus: refund.status });
    } catch (err) {
      return res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to check refund status with Razorpay.' });
    }
  });

  // ── 8. Financial Expenses & Settlements ──────────────────────────────────────
  router.post('/expenses', requireAdminSection('finance'), async (req: AuthenticatedRequest, res) => {
    const category = String(req.body?.category || 'other') as 'delivery_ops' | 'marketing' | 'infrastructure' | 'support' | 'other';
    const description = String(req.body?.description || '').trim();
    const amountInr = Number(req.body?.amountInr || 0);
    const incurredOn = String(req.body?.incurredOn || new Date().toISOString());
    if (!description || !Number.isFinite(amountInr) || amountInr <= 0) {
      return res.status(400).json({ error: 'Valid expense description and positive amount in ₹ are required.' });
    }
    const expense = await withTransaction((db) => {
      const now = new Date().toISOString();
      const rec = {
        id: `exp-${crypto.randomBytes(4).toString('hex')}`,
        category,
        description,
        amountInr: Math.round(amountInr),
        incurredOn,
        createdBy: req.authUser!.fullName || req.authUser!.id,
        createdAt: now,
      };
      db.expenses.unshift(rec);
      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'ADMIN_RECORD_EXPENSE',
        targetType: 'expense',
        targetId: rec.id,
        details: `Recorded ₹${rec.amountInr} (${rec.category}): ${rec.description}`,
        createdAt: now,
      });
      return rec;
    });
    return res.status(201).json({ expense });
  });

  router.post('/settlements/generate', requireAdminSection('finance'), async (req: AuthenticatedRequest, res) => {
    const periodLabel = String(req.body?.periodLabel || `Batch ${new Date().toISOString().slice(0, 10)}`);
    const created = await withTransaction((db) => {
      const now = new Date().toISOString();
      const newRecords: SettlementRecord[] = [];
      for (const r of db.riders) {
        const alreadyBatched = db.settlements
          .filter((s) => s.recipientType === 'rider' && s.recipientId === r.id && s.status === 'pending')
          .reduce((sum, s) => sum + s.netPayout, 0);
        const unbatchedBalance = Math.max(0, r.pendingSettlement - alreadyBatched);
        if (unbatchedBalance > 0) {
          const rec: SettlementRecord = {
            id: `stl-${crypto.randomBytes(4).toString('hex')}`,
            recipientType: 'rider',
            recipientId: r.id,
            recipientName: r.fullName,
            grossAmount: unbatchedBalance,
            commissionOrFee: 0,
            tipsIncluded: Math.min(r.tipsTotal, unbatchedBalance),
            netPayout: unbatchedBalance,
            status: 'pending',
            periodLabel,
            createdAt: now,
          };
          db.settlements.unshift(rec);
          newRecords.push(rec);
        }
      }
      const vendorTotals = new Map<string, { name: string; gross: number; commission: number; net: number }>();
      for (const order of db.orders) {
        if (order.status !== 'delivered' || order.paymentStatus !== 'captured') continue;
        for (const subOrder of order.subOrders) {
          if (subOrder.status !== 'delivered') continue;
          const total = vendorTotals.get(subOrder.vendorId) || {
            name: subOrder.vendorName,
            gross: 0,
            commission: 0,
            net: 0,
          };
          total.gross += subOrder.subtotal;
          total.commission += subOrder.commissionAmount;
          total.net += subOrder.vendorNetPayout;
          vendorTotals.set(subOrder.vendorId, total);
        }
      }
      for (const [vendorId, total] of vendorTotals) {
        const alreadyBatched = db.settlements
          .filter((s) => s.recipientType === 'vendor' && s.recipientId === vendorId)
          .reduce((sum, s) => sum + s.netPayout, 0);
        const unbatchedNet = Math.max(0, total.net - alreadyBatched);
        if (!unbatchedNet) continue;
        const factor = unbatchedNet / total.net;
        const rec: SettlementRecord = {
          id: `stl-${crypto.randomBytes(4).toString('hex')}`,
          recipientType: 'vendor',
          recipientId: vendorId,
          recipientName: total.name,
          grossAmount: Math.round(total.gross * factor),
          commissionOrFee: Math.round(total.commission * factor),
          tipsIncluded: 0,
          netPayout: unbatchedNet,
          status: 'pending',
          periodLabel,
          createdAt: now,
        };
        db.settlements.unshift(rec);
        newRecords.push(rec);
      }
      db.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'ADMIN_GENERATE_SETTLEMENTS',
        targetType: 'settlement',
        targetId: periodLabel,
        details: `Generated ${newRecords.length} pending settlement record(s)`,
        createdAt: now,
      });
      return newRecords;
    });
    return res.status(201).json({ settlements: created });
  });

  router.patch('/settlements/:id', requireAdminSection('finance'), async (req: AuthenticatedRequest, res) => {
    try {
      const settlement = await withTransaction((db) => {
        const stl = db.settlements.find((s) => s.id === req.params.id);
        if (!stl) throw new Error('Settlement record not found.');
        if (stl.status === 'settled') return stl;
        const nextStatus = String(req.body?.status || '');
        if (nextStatus === 'failed') {
          stl.status = 'failed';
          stl.failureReason = String(req.body?.failureReason || 'Bank transfer bounced / verification failed');
          db.auditLogs.unshift({
            id: `aud-${crypto.randomBytes(4).toString('hex')}`,
            actorId: req.authUser!.id,
            actorRole: req.authUser!.role,
            action: 'ADMIN_SETTLEMENT_FAILED',
            targetType: 'settlement',
            targetId: stl.id,
            details: `${stl.recipientName} payout ₹${stl.netPayout} marked failed: ${stl.failureReason}`,
            createdAt: new Date().toISOString(),
          });
          return stl;
        }
        if (nextStatus !== 'settled') throw new Error('Status must be settled or failed.');
        const transferReference = String(req.body?.transferReference || '').trim();
        if (transferReference.length < 6 || transferReference.length > 50) {
          throw new Error('Enter a bank UTR or transfer reference between 6 and 50 characters.');
        }
        stl.status = 'settled';
        stl.failureReason = undefined;
        stl.transferReference = transferReference;
        stl.settledAt = new Date().toISOString();
        if (stl.recipientType === 'rider') {
          const r = db.riders.find((item) => item.id === stl.recipientId);
          if (r) r.pendingSettlement = Math.max(0, r.pendingSettlement - stl.netPayout);
        }
        db.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_SETTLEMENT_STATUS',
          targetType: 'settlement',
          targetId: stl.id,
          details: `${stl.recipientName} payout ₹${stl.netPayout} recorded as paid with transfer reference ${transferReference}`,
          createdAt: stl.settledAt,
        });
        return stl;
      });
      return res.json({ settlement });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Settlement update failed.' });
    }
  });

  // ── 9. Marketing, Coupons, Banners, Campaigns, Push & Referrals ──────────────
  router.post('/coupons', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    const coupon = await withTransaction((db) => {
      const c = {
        id: `cpn-${Date.now()}`,
        code: String(req.body?.code || 'FYOORA25').toUpperCase().trim(),
        title: String(req.body?.title || 'Special Offer'),
        description: String(req.body?.description || 'Vadakara local promotion'),
        discountType: (req.body?.discountType === 'percent' ? 'percent' : 'flat') as 'flat' | 'percent',
        discountValue: Number(req.body?.discountValue || 25),
        maxDiscountInr: Number(req.body?.maxDiscountInr || 100),
        minOrderInr: Number(req.body?.minOrderInr || 199),
        firstOrderOnly: Boolean(req.body?.firstOrderOnly),
        applicableServices: Array.isArray(req.body?.applicableServices) ? req.body.applicableServices : ('all' as const),
        active: true,
        expiresAt: String(req.body?.expiresAt || '2028-12-31T23:59:59Z'),
      };
      db.coupons.unshift(c);
      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'ADMIN_CREATE_COUPON',
        targetType: 'coupon',
        targetId: c.id,
        details: `Created coupon ${c.code} (${c.title})`,
        createdAt: new Date().toISOString(),
      });
      return c;
    });
    return res.status(201).json({ coupon });
  });

  router.patch('/coupons/:couponId', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    try {
      const coupon = await withTransaction((db) => {
        const c = db.coupons.find((item) => item.id === req.params.couponId);
        if (!c) throw new Error('Coupon not found.');
        if (typeof req.body?.active === 'boolean') c.active = req.body.active;
        if (req.body?.title) c.title = String(req.body.title).trim();
        return c;
      });
      return res.json({ coupon });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Coupon update failed.' });
    }
  });

  router.post('/banners', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const subtitle = String(req.body?.subtitle || '').trim();
    if (!title) return res.status(400).json({ error: 'Banner title is required.' });
    const banner = await withTransaction((db) => {
      const b = {
        id: `bnr-${crypto.randomBytes(4).toString('hex')}`,
        title,
        subtitle: subtitle || 'Vadakara local highlights',
        ctaLabel: String(req.body?.ctaLabel || 'Explore Now'),
        targetService: req.body?.targetService || 'food',
        imageUrl: String(req.body?.imageUrl || '/assets/images/vadakara_malabar_biriyani_1794743269068.jpg'),
        active: true,
      };
      db.banners.unshift(b);
      return b;
    });
    return res.status(201).json({ banner });
  });

  router.patch('/banners/:bannerId', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    try {
      const banner = await withTransaction((db) => {
        const b = db.banners.find((item) => item.id === req.params.bannerId);
        if (!b) throw new Error('Banner not found.');
        if (typeof req.body?.active === 'boolean') b.active = req.body.active;
        if (req.body?.title) b.title = String(req.body.title).trim();
        if (req.body?.subtitle) b.subtitle = String(req.body.subtitle).trim();
        return b;
      });
      return res.json({ banner });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Banner update failed.' });
    }
  });

  router.post('/campaigns', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!title) return res.status(400).json({ error: 'Campaign title is required.' });
    const type = (req.body?.type || 'seasonal') as 'seasonal' | 'featured_vendor' | 'push_notification' | 'sponsored' | 'referral';

    const campaign = await withTransaction((db) => {
      const now = new Date().toISOString();
      let sentCount = 0;
      if (type === 'push_notification') {
        const activeCustomers = db.users.filter((u) => u.role === 'customer' && u.accountStatus === 'active');
        for (const cust of activeCustomers) {
          db.notifications.unshift({
            id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
            userId: cust.id,
            title,
            body: description || 'Check out the latest offers on FYOORA Vadakara.',
            category: 'promo',
            read: false,
            createdAt: now,
          });
          sentCount += 1;
        }
      }
      const c = {
        id: `cmp-${crypto.randomBytes(4).toString('hex')}`,
        title,
        type,
        description,
        targetService: req.body?.targetService || 'all',
        vendorId: req.body?.vendorId ? String(req.body.vendorId) : undefined,
        discountCode: req.body?.discountCode ? String(req.body.discountCode).toUpperCase() : undefined,
        budgetInr: req.body?.budgetInr ? Number(req.body.budgetInr) : undefined,
        active: true,
        startDate: String(req.body?.startDate || now.slice(0, 10)),
        endDate: String(req.body?.endDate || '2028-12-31'),
        sentCount: type === 'push_notification' ? sentCount : undefined,
        createdAt: now,
      };
      db.marketingCampaigns.unshift(c);
      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: type === 'push_notification' ? 'ADMIN_SEND_PUSH_CAMPAIGN' : 'ADMIN_CREATE_CAMPAIGN',
        targetType: 'campaign',
        targetId: c.id,
        details: `${c.type}: "${c.title}"${sentCount ? ` (${sentCount} customer notifications queued)` : ''}`,
        createdAt: now,
      });
      return c;
    });
    return res.status(201).json({ campaign });
  });

  router.patch('/campaigns/:campaignId', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    try {
      const campaign = await withTransaction((db) => {
        const c = db.marketingCampaigns.find((item) => item.id === req.params.campaignId);
        if (!c) throw new Error('Campaign not found.');
        if (typeof req.body?.active === 'boolean') c.active = req.body.active;
        return c;
      });
      return res.json({ campaign });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Campaign not found.' });
    }
  });

  router.put('/referrals', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    const referralSettings = await withTransaction((db) => {
      const now = new Date().toISOString();
      db.referralSettings = {
        enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : db.referralSettings.enabled,
        referrerRewardPoints: Math.max(0, Number(req.body?.referrerRewardPoints ?? db.referralSettings.referrerRewardPoints)),
        refereeWelcomePoints: Math.max(0, Number(req.body?.refereeWelcomePoints ?? db.referralSettings.refereeWelcomePoints)),
        minOrderForRewardInr: Math.max(0, Number(req.body?.minOrderForRewardInr ?? db.referralSettings.minOrderForRewardInr)),
        updatedAt: now,
      };
      return db.referralSettings;
    });
    return res.json({ referralSettings });
  });

  router.patch('/reviews/:reviewId', requireAdminSection('marketing'), async (req: AuthenticatedRequest, res) => {
    try {
      const review = await withTransaction((db) => {
        const rev = db.reviews.find((r) => r.id === req.params.reviewId);
        if (!rev) throw new Error('Review not found.');
        if (['published', 'flagged', 'hidden'].includes(String(req.body?.status))) {
          rev.status = req.body.status;
        }
        return rev;
      });
      return res.json({ review });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Review update failed.' });
    }
  });

  // ── 10. Alerts Acknowledgement ───────────────────────────────────────────────
  router.post('/alerts/:alertId/acknowledge', requireAdminSection('alerts'), async (req: AuthenticatedRequest, res) => {
    const ack = await withTransaction((db) => {
      const now = new Date().toISOString();
      const record = {
        alertId: req.params.alertId,
        acknowledgedBy: req.authUser!.fullName || req.authUser!.email || req.authUser!.id,
        acknowledgedAt: now,
        note: req.body?.note ? String(req.body.note) : undefined,
      };
      db.alertAcknowledgements[req.params.alertId] = record;
      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'ADMIN_ACKNOWLEDGE_ALERT',
        targetType: 'alert',
        targetId: req.params.alertId,
        details: `Alert ${req.params.alertId} acknowledged`,
        createdAt: now,
      });
      return record;
    });
    return res.json({ acknowledgement: ack });
  });

  router.post('/alerts/acknowledge-all', requireAdminSection('alerts'), async (req: AuthenticatedRequest, res) => {
    const ids = Array.isArray(req.body?.alertIds) ? (req.body.alertIds as string[]) : [];
    await withTransaction((db) => {
      const now = new Date().toISOString();
      const actor = req.authUser!.fullName || req.authUser!.email || req.authUser!.id;
      for (const id of ids) {
        db.alertAcknowledgements[id] = { alertId: id, acknowledgedBy: actor, acknowledgedAt: now };
      }
    });
    return res.json({ ok: true });
  });

  // ── 11. Admin Staff & Granular Permissions (Strictly super_admin) ────────────
  router.post('/staff', requireRole('super_admin'), async (req: AuthenticatedRequest, res) => {
    const fullName = String(req.body?.fullName || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = (['super_admin', 'admin', 'support_staff'].includes(String(req.body?.role))
      ? req.body.role
      : 'support_staff') as 'super_admin' | 'admin' | 'support_staff';
    const permissions = Array.isArray(req.body?.permissions)
      ? (req.body.permissions as AdminSectionKey[])
      : (['overview', 'live_ops', 'alerts'] as AdminSectionKey[]);

    if (!fullName || !email) {
      return res.status(400).json({ error: 'Staff fullName and verified email are required.' });
    }

    const member = await withTransaction((db) => {
      const now = new Date().toISOString();
      const existing = db.adminStaff.find((s) => s.email.toLowerCase() === email);
      if (existing) {
        existing.fullName = fullName;
        existing.role = role;
        existing.permissions = permissions;
        existing.updatedAt = now;
        return existing;
      }
      const created = {
        id: `stf-${crypto.randomBytes(4).toString('hex')}`,
        fullName,
        email,
        role,
        permissions,
        status: 'active' as const,
        updatedAt: now,
      };
      db.adminStaff.push(created);

      // Sync matching existing user role if they have already signed in once
      const userRecord = db.users.find((u) => u.email?.toLowerCase() === email);
      if (userRecord) {
        userRecord.role = role;
      }

      db.auditLogs.unshift({
        id: `aud-${crypto.randomBytes(4).toString('hex')}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'SUPER_ADMIN_ADD_STAFF',
        targetType: 'admin_staff',
        targetId: created.id,
        details: `Granted ${role} access (${permissions.join(', ')}) to ${email}`,
        createdAt: now,
      });
      return created;
    });
    return res.status(201).json({ staff: member });
  });

  router.patch('/staff/:staffId', requireRole('super_admin'), async (req: AuthenticatedRequest, res) => {
    try {
      const member = await withTransaction((db) => {
        const s = db.adminStaff.find((item) => item.id === req.params.staffId);
        if (!s) throw new Error('Staff member not found.');
        if (s.email.toLowerCase() === 'mtechmini@gmail.com' && req.body?.status === 'suspended') {
          throw new Error('Root super admin account cannot be suspended.');
        }
        if (['super_admin', 'admin', 'support_staff'].includes(String(req.body?.role))) {
          s.role = req.body.role;
        }
        if (Array.isArray(req.body?.permissions)) {
          s.permissions = req.body.permissions;
        }
        if (['active', 'suspended'].includes(String(req.body?.status))) {
          s.status = req.body.status;
        }
        s.updatedAt = new Date().toISOString();
        const userRecord = db.users.find((u) => u.email?.toLowerCase() === s.email.toLowerCase());
        if (userRecord) {
          userRecord.role = s.role;
          if (s.status === 'suspended') userRecord.accountStatus = 'suspended';
        }
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'SUPER_ADMIN_UPDATE_STAFF_PERMISSIONS',
          targetType: 'admin_staff',
          targetId: s.id,
          details: `${s.email}: role=${s.role}, status=${s.status}, permissions=${s.permissions.length}`,
          createdAt: s.updatedAt,
        });
        return s;
      });
      return res.json({ staff: member });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Staff update failed.' });
    }
  });

  // ── 12. AI Business Intelligence Assistant ───────────────────────────────────
  router.post('/ai-bi', requireAdminSection('ai_bi'), async (req: AuthenticatedRequest, res) => {
    try {
      const question = String(req.body?.question || 'Provide an executive performance summary and identify operational priorities.').trim();
      const mode = (req.body?.mode || 'qa') as AdminBiRequest['mode'];
      const dateFilter = parseDateFilter(req.body || {});
      const db = getDb();

      const exec = computeExecutiveOverview({
        orders: db.orders,
        users: db.users,
        vendors: db.vendors,
        riders: db.riders,
        expenses: db.expenses,
        dateFilter,
      });
      const filteredOrders = filterOrdersByCriteria(db.orders, exec.window.startMs, exec.window.endMs);
      const vendors = computeVendorAnalytics({
        vendors: db.vendors,
        orders: filteredOrders,
        products: db.products,
        supportTickets: db.supportTickets,
      });
      const riders = computeRiderAnalytics({
        riders: db.riders,
        orders: filteredOrders,
        supportTickets: db.supportTickets,
      });
      const services = computeServiceAnalytics({
        orders: filteredOrders,
        vendors: db.vendors,
        serviceConfigs: db.serviceConfigs,
      });
      const alerts = computeOperationalAlerts({
        orders: db.orders,
        products: db.products,
        vendors: db.vendors,
        riders: db.riders,
        settlements: db.settlements,
        paymentTransactions: db.paymentTransactions,
        supportTickets: db.supportTickets,
        partnerApplications: db.partnerApplications,
        acknowledgements: db.alertAcknowledgements,
      });

      const metricsContext = {
        dateWindow: exec.window.label,
        financialSummaryInr: exec.summary,
        operationsCounts: exec.counts,
        servicesBreakdown: services.map((s) => ({
          service: s.label,
          enabled: s.enabled,
          orders: s.orders,
          gmvInr: s.gmv,
          netRevenueInr: s.netRevenue,
        })),
        topVendors: vendors.slice(0, 8).map((v) => ({
          name: v.vendor.name,
          category: v.vendor.serviceCategory,
          isOpen: v.vendor.isOpen,
          orders: v.orderCount,
          gmvInr: v.gmv,
          rating: v.vendor.rating,
          alerts: v.alerts,
        })),
        ridersSummary: riders.map((r) => ({
          name: r.rider.fullName,
          isOnline: r.rider.isOnline,
          kycStatus: r.rider.kycStatus,
          totalDeliveriesAllTime: r.rider.completedDeliveries,
          periodDeliveries: r.periodDeliveries,
          earningsPeriodInr: r.periodEarnings,
        })),
        activeAlerts: alerts.map((a) => ({
          priority: a.priority,
          title: a.title,
          acknowledged: a.acknowledged,
        })),
      };

      const aiRes = await runAdminBiAnalysis({ question, mode, metricsContext });
      await withTransaction((txDb) => {
        txDb.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_AI_BI_QUERY',
          targetType: 'ai_bi',
          targetId: mode,
          details: `BI (${mode}): ${question.slice(0, 120)}`,
          createdAt: aiRes.generatedAt,
        });
      });
      return res.json(aiRes);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'AI BI analysis failed.' });
    }
  });

  // ── 13. Backwards-Compatible Orders CSV + Comprehensive Reports Export ────────
  router.get('/reports/orders.csv', requireAdminSection('reports'), (_req, res) => {
    const db = getDb();
    const headers = [
      'OrderNumber',
      'ServiceType',
      'Vendor',
      'Customer',
      'Subtotal',
      'Discount',
      'DeliveryFee',
      'Tip',
      'GrandTotal',
      'PaymentMethod',
      'Status',
      'CreatedAt',
    ];
    const rows = db.orders.map((o) => [
      o.orderNumber,
      o.serviceType,
      o.vendorName || 'Pickup & Drop',
      o.customerName,
      o.pricing.itemsSubtotal,
      o.pricing.discount,
      o.pricing.deliveryFee,
      o.pricing.riderTip,
      o.pricing.grandTotal,
      o.paymentMethod,
      o.status,
      o.createdAt,
    ]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fyoora-vadakara-orders.csv"');
    return res.send(buildCsvContent(headers, rows));
  });

  router.get('/reports/export', requireAdminSection('reports'), (req, res) => {
    const db = getDb();
    const reportType = String(req.query.reportType || 'orders');
    const format = req.query.format === 'xls' ? 'xls' : 'csv';
    const dateFilter = parseDateFilter(req.query);
    const window = resolveDateWindow(dateFilter);
    const filteredOrders = filterOrdersByCriteria(db.orders, window.startMs, window.endMs);

    let sheetName = 'FYOORA Report';
    let headers: string[] = [];
    let rows: Array<Array<string | number | boolean | null | undefined>> = [];

    if (reportType === 'financial' || reportType === 'pnl') {
      sheetName = 'Profit & Loss';
      const series = buildRevenueSeries(filteredOrders, db.expenses, 'daily');
      headers = ['Date', 'Orders', 'Completed', 'Cancelled', 'GMV (INR)', 'Commissions (INR)', 'Delivery Revenue (INR)', 'Net Revenue (INR)', 'Operating Expenses (INR)', 'Est. Net Profit (INR)'];
      rows = series.map((r) => [
        r.label,
        r.orders,
        r.completedOrders,
        r.cancelledOrders,
        r.gmv,
        r.commissions,
        r.deliveryRevenue,
        r.netRevenue,
        r.expenses,
        r.netProfit,
      ]);
    } else if (reportType === 'settlements') {
      sheetName = 'Settlements Ledger';
      headers = ['ID', 'Type', 'Recipient', 'Period', 'Gross (INR)', 'Commission/Fee (INR)', 'Tips (INR)', 'Net Payout (INR)', 'Status', 'Transfer Ref', 'Settled At'];
      rows = db.settlements.map((s) => [
        s.id,
        s.recipientType,
        s.recipientName,
        s.periodLabel,
        s.grossAmount,
        s.commissionOrFee,
        s.tipsIncluded,
        s.netPayout,
        s.status,
        s.transferReference || '',
        s.settledAt || '',
      ]);
    } else if (reportType === 'vendors') {
      sheetName = 'Vendor Performance';
      const vAnalytics = computeVendorAnalytics({
        vendors: db.vendors,
        orders: filteredOrders,
        products: db.products,
        supportTickets: db.supportTickets,
      });
      headers = ['Vendor', 'Category', 'Status', 'Commission Rate %', 'Orders', 'Delivered', 'Cancelled', 'GMV (INR)', 'Commission (INR)', 'Net Payout (INR)', 'Rating', 'Score'];
      rows = vAnalytics.map((v) => [
        v.vendor.name,
        v.vendor.serviceCategory,
        v.vendor.suspended ? 'Suspended' : v.vendor.isOpen ? 'Open' : 'Offline',
        Math.round(v.vendor.commissionRate * 100),
        v.orderCount,
        v.deliveredCount,
        v.cancelledCount,
        v.gmv,
        v.commissionGenerated,
        v.netPayout,
        v.vendor.rating,
        v.performanceScore,
      ]);
    } else if (reportType === 'riders') {
      sheetName = 'Rider Settlements & Performance';
      const rAnalytics = computeRiderAnalytics({
        riders: db.riders,
        orders: filteredOrders,
        supportTickets: db.supportTickets,
      });
      headers = ['Rider', 'Vehicle', 'KYC', 'Online', 'Period Deliveries', 'All-Time Deliveries', 'Period Earnings (INR)', 'Period Tips (INR)', 'Pending Settlement (INR)', 'Rating'];
      rows = rAnalytics.map((r) => [
        r.rider.fullName,
        r.rider.vehicleNumber,
        r.rider.kycStatus,
        r.rider.isOnline ? 'Online' : 'Offline',
        r.periodDeliveries,
        r.rider.completedDeliveries,
        r.periodEarnings,
        r.periodTips,
        r.rider.pendingSettlement,
        r.rider.rating,
      ]);
    } else if (reportType === 'customers') {
      sheetName = 'Customer Growth';
      const cAnalytics = computeCustomerAnalytics({
        users: db.users,
        orders: db.orders,
        supportTickets: db.supportTickets,
      });
      headers = ['Customer', 'Phone', 'Email', 'Segment', 'Status', 'Orders', 'Total Spend (INR)', 'Avg Order (INR)', 'Loyalty Points', 'Joined'];
      rows = cAnalytics.items.map((c) => [
        c.fullName,
        c.phone,
        c.email || '',
        c.segment,
        c.accountStatus,
        c.orderCount,
        c.totalSpend,
        c.avgOrderValue,
        c.loyaltyPoints,
        c.createdAt.slice(0, 10),
      ]);
    } else if (reportType === 'services') {
      sheetName = 'Service Breakdown';
      const sAnalytics = computeServiceAnalytics({
        orders: filteredOrders,
        vendors: db.vendors,
        serviceConfigs: db.serviceConfigs,
      });
      headers = ['Service', 'Enabled', 'Orders', 'Completed', 'GMV (INR)', 'Commissions (INR)', 'Net Revenue (INR)', 'Vendors'];
      rows = sAnalytics.map((s) => [
        s.label,
        s.enabled ? 'Active' : 'Disabled',
        s.orders,
        s.completedOrders,
        s.gmv,
        s.commissionRevenue,
        s.netRevenue,
        s.vendorCount,
      ]);
    } else if (reportType === 'marketing') {
      sheetName = 'Coupons & Marketing';
      const cpAnalytics = buildCouponAnalytics(db.coupons, filteredOrders);
      headers = ['Coupon Code', 'Title', 'Discount Type', 'Value', 'Active', 'Redemptions', 'Discount Given (INR)', 'Attributed GMV (INR)'];
      rows = cpAnalytics.map((c) => [
        c.coupon.code,
        c.coupon.title,
        c.coupon.discountType,
        c.coupon.discountValue,
        c.coupon.active ? 'Active' : 'Paused',
        c.redemptions,
        c.totalDiscountGiven,
        c.attributedGmv,
      ]);
    } else if (reportType === 'tax') {
      sheetName = 'Platform Tax & Fee Summary';
      headers = ['Order Number', 'Date', 'Payment Method', 'Payment Status', 'Items Subtotal (INR)', 'Platform Fee (INR)', 'Delivery Fee (INR)', 'Commission (INR)', 'Est. Razorpay MDR 2% (INR)', 'Grand Total (INR)'];
      rows = filteredOrders
        .filter((o) => o.paymentStatus === 'captured')
        .map((o) => [
          o.orderNumber,
          o.createdAt.slice(0, 10),
          o.paymentMethod,
          o.paymentStatus,
          o.pricing.itemsSubtotal,
          o.pricing.platformFee,
          o.pricing.deliveryFee,
          o.subOrders.reduce((s, sub) => s + sub.commissionAmount, 0),
          o.paymentMethod === 'cod' ? 0 : Math.round(o.pricing.grandTotal * 0.02),
          o.pricing.grandTotal,
        ]);
    } else {
      sheetName = 'Orders Report';
      headers = ['Order Number', 'Service', 'Vendor', 'Customer', 'Subtotal (INR)', 'Discount (INR)', 'Delivery Fee (INR)', 'Platform Fee (INR)', 'Tip (INR)', 'Grand Total (INR)', 'Payment', 'Payment Status', 'Order Status', 'Created At'];
      rows = filteredOrders.map((o) => [
        o.orderNumber,
        o.serviceType,
        o.vendorName || 'Pickup & Drop',
        o.customerName,
        o.pricing.itemsSubtotal,
        o.pricing.discount,
        o.pricing.deliveryFee,
        o.pricing.platformFee,
        o.pricing.riderTip,
        o.pricing.grandTotal,
        o.paymentMethod,
        o.paymentStatus,
        o.status,
        o.createdAt,
      ]);
    }

    const filenameBase = `fyoora-${reportType}-${new Date().toISOString().slice(0, 10)}`;
    if (format === 'xls') {
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xls"`);
      return res.send(buildExcelSpreadsheetXml({ sheetName, headers, rows }));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    return res.send(buildCsvContent(headers, rows));
  });

  return router;
}
