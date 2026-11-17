import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  calculateDeliveryQuote,
  calculatePickupDropQuote,
  calculateSettlementSplit,
  haversineDistanceKm,
  isPointInServiceArea,
  isValidOrderTransition,
  validateCoupon,
  validateInventoryPurchase,
  validateSlotCapacity,
} from './src/shared/domain.ts';
import { isEnvFlagTrue, isGoogleMapsIntegrationEnabled } from './src/shared/authConfig.ts';
import type {
  CartItem,
  DeliveryTier,
  FeatureSuggestion,
  Order,
  OrderStatus,
  PartnerApplication,
  PaymentMethod,
  Product,
  ServiceType,
  SupportTicket,
  SuggestionArea,
  UserRole,
  Vendor,
} from './src/shared/types.ts';
import {
  attachOptionalAuth,
  clearSessionCookie,
  createAndDispatchOtp,
  getAuthConfigurationStatus,
  isDevRoleSwitchEnabled,
  normalizeIndianPhone,
  requireAuth,
  requireRole,
  setSessionCookie,
  signSessionToken,
  verifyFirebaseIdTokenSignIn,
  verifyOtpChallenge,
  type AuthenticatedRequest,
} from './src/server/auth.ts';
import { getDb, withTransaction } from './src/server/store.ts';
import {
  createGatewayPaymentOrder,
  getRazorpayConfigStatus,
  verifyRazorpayPaymentCaptured,
  verifyRazorpayPaymentSignature,
} from './src/server/payments.ts';
import { processRazorpayWebhook } from './src/server/razorpayWebhook.ts';
import { runFyooraAiChat } from './src/server/ai.ts';
import { createAdminRouter } from './src/server/adminRoutes.ts';

const PORT = Number(process.env.PORT || 3000);

async function bootstrapServer() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
  );

  // Raw body capture for Razorpay webhook signature verification (must run before express.json)
  const handleRazorpayWebhook = async (req: express.Request, res: express.Response) => {
    const signature = String(req.headers['x-razorpay-signature'] || '');
    const eventIdHeader = req.headers['x-razorpay-event-id']
      ? String(req.headers['x-razorpay-event-id'])
      : undefined;
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : typeof req.body === 'string'
        ? req.body
        : '';

    const outcome = await processRazorpayWebhook({
      rawBody,
      signature,
      eventIdHeader,
    });
    return res.status(outcome.httpStatus).json(outcome.body);
  };

  app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), handleRazorpayWebhook);
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), handleRazorpayWebhook);

  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());
  app.use(attachOptionalAuth);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    message: { error: 'Too many OTP requests from this network. Please try again in 15 minutes.' },
  });

  app.use('/api', apiLimiter);

  // ── Public Health & Runtime Config ───────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    const db = getDb();
    const authStatus = getAuthConfigurationStatus();
    const mapsApiKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ||
      process.env.GOOGLE_MAPS_API_KEY?.trim() ||
      ''
    );
    const explicitlyDisabled =
      process.env.VITE_ENABLE_GOOGLE_MAPS?.trim().toLowerCase() === 'false' ||
      process.env.GOOGLE_MAPS_ENABLED?.trim().toLowerCase() === 'false';
    const mapsConfigured = isGoogleMapsIntegrationEnabled({
      flagEnabled:
        !explicitlyDisabled &&
        (isEnvFlagTrue(process.env.GOOGLE_MAPS_ENABLED) ||
          isEnvFlagTrue(process.env.VITE_ENABLE_GOOGLE_MAPS) ||
          Boolean(mapsApiKey)),
      apiKeyPresent: Boolean(mapsApiKey),
    });
    res.json({
      status: 'ok',
      service: 'FYOORA API',
      region: db.serviceAreas[0]?.name || 'Vadakara',
      razorpay: getRazorpayConfigStatus(),
      auth: authStatus,
      smsGatewayConfigured: authStatus.phoneAuth.provider === 'sms_gateway',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      mapsConfigured,
      timestamp: new Date().toISOString(),
    });
  });

  // ── Phase 1 & 9: Authentication & User Profile ───────────────────────────────
  app.post('/api/auth/otp/send', otpLimiter, async (req, res) => {
    try {
      const normalized = normalizeIndianPhone(String(req.body?.phone || ''));
      if (!normalized) {
        return res.status(400).json({
          error: 'Please enter a valid 10-digit Indian mobile number starting with 6-9.',
        });
      }
      const result = await createAndDispatchOtp(normalized);
      if (result.pendingConfiguration) {
        return res.status(503).json({
          error:
            'Phone OTP authentication is pending configuration. Please sign in with Google (Firebase Auth) or browse as a guest.',
          code: 'PHONE_AUTH_PENDING_CONFIGURATION',
          phoneAuthStatus: 'pending_configuration',
        });
      }
      if (!result.sent) {
        return res.status(429).json({
          error: `Please wait ${result.cooldownRemainingSec}s before requesting another OTP.`,
          cooldownRemainingSec: result.cooldownRemainingSec,
        });
      }
      return res.json({
        ok: true,
        phone: normalized,
        deliveryMode: result.deliveryMode,
        expiresInSec: result.expiresInSec,
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send OTP.' });
    }
  });

  app.post('/api/auth/otp/verify', otpLimiter, async (req, res) => {
    try {
      const normalized = normalizeIndianPhone(String(req.body?.phone || ''));
      const otp = String(req.body?.otp || '').trim();
      const privacyAccepted = Boolean(req.body?.privacyAccepted);
      if (!normalized || !/^\d{6}$/.test(otp)) {
        return res.status(400).json({ error: 'Valid +91 mobile number and 6-digit OTP are required.' });
      }
      const check = verifyOtpChallenge(normalized, otp);
      if (check.pendingConfiguration) {
        return res.status(503).json({
          error: check.reason || 'Phone OTP authentication is pending configuration.',
          code: 'PHONE_AUTH_PENDING_CONFIGURATION',
          phoneAuthStatus: 'pending_configuration',
        });
      }
      if (!check.valid) {
        return res.status(400).json({ error: check.reason });
      }

      const { user, isNewUser } = await withTransaction((db) => {
        let existing = db.users.find((u) => u.phone === normalized);
        let created = false;
        if (!existing) {
          if (!privacyAccepted) {
            throw new Error('PRIVACY_REQUIRED');
          }
          created = true;
          const now = new Date().toISOString();
          existing = {
            id: `usr-${crypto.randomBytes(4).toString('hex')}`,
            phone: normalized,
            fullName: '',
            preferredLanguage: 'en',
            role: 'customer',
            addresses: [
              {
                id: `addr-${Date.now()}`,
                label: 'Home',
                line1: 'Vadakara Town, Kozhikode',
                city: 'Vadakara',
                district: 'Kozhikode',
                state: 'Kerala',
                pincode: '673101',
                lat: 11.6085,
                lng: 75.5917,
                isDefault: true,
              },
            ],
            favourites: [],
            privacyAcceptedAt: now,
            profileCompleted: false,
            accountStatus: 'active',
            loyaltyPoints: 50,
            referralCode: `FYR${crypto.randomInt(1000, 9999)}`,
            createdAt: now,
          };
          db.users.push(existing);
          db.notifications.push({
            id: `ntf-${Date.now()}`,
            userId: existing.id,
            title: 'Welcome to FYOORA Vadakara',
            body: '50 welcome loyalty points credited. Use VADAKARA50 on your first order.',
            category: 'promo',
            read: false,
            createdAt: now,
          });
        }
        return { user: existing, isNewUser: created };
      });

      const token = signSessionToken(user);
      setSessionCookie(res, token, req);
      return res.json({ user, token, isNewUser });
    } catch (err) {
      if (err instanceof Error && err.message === 'PRIVACY_REQUIRED') {
        return res.status(400).json({ error: 'Please accept FYOORA Privacy Policy & Terms of Service to continue.' });
      }
      return res.status(500).json({ error: 'OTP verification failed.' });
    }
  });

  // Explicit opt-in Development Role Switcher (disabled by default; strictly non-production)
  app.post('/api/auth/dev-role-session', async (req, res) => {
    if (!isDevRoleSwitchEnabled()) {
      return res.status(403).json({
        error: 'Unverified quick role switching is disabled. Please sign in with verified authentication.',
      });
    }
    const role = String(req.body?.role || '') as UserRole;
    const db = getDb();
    const matched = db.users.find((u) => u.role === role);
    if (!matched) {
      return res.status(404).json({ error: `No seeded account found for role: ${role}` });
    }
    const token = signSessionToken(matched);
    setSessionCookie(res, token, req);
    return res.json({ user: matched, token, devSandboxSession: true });
  });

  app.post('/api/auth/firebase', async (req, res) => {
    try {
      const idToken = String(req.body?.idToken || '');
      const privacyAccepted =
        req.body?.privacyAccepted === undefined ? true : Boolean(req.body.privacyAccepted);
      const firestoreProfile =
        req.body?.firestoreProfile && typeof req.body.firestoreProfile === 'object'
          ? req.body.firestoreProfile
          : null;
      if (!idToken) return res.status(400).json({ error: 'Firebase ID token is required.' });
      const { user, isNewUser, linkedExistingAccount } = await verifyFirebaseIdTokenSignIn(idToken, {
        privacyAccepted,
        firestoreProfile,
      });
      const token = signSessionToken(user);
      setSessionCookie(res, token, req);
      return res.json({ user, token, isNewUser, linkedExistingAccount });
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err && typeof (err as { code?: unknown }).code === 'string'
          ? (err as { code: string }).code
          : err instanceof Error
            ? err.message
            : '';
      if (code === 'PRIVACY_REQUIRED') {
        return res.status(400).json({
          error: 'Please accept FYOORA Privacy Policy & Terms of Service to continue.',
          code: 'PRIVACY_REQUIRED',
        });
      }
      if (code === 'ACCOUNT_LINK_CONFLICT') {
        return res.status(409).json({
          error:
            'This email is already linked to a different Google account. Please sign in with that Google account or contact FYOORA support.',
          code: 'ACCOUNT_LINK_CONFLICT',
        });
      }
      if (code === 'ACCOUNT_EMAIL_UNVERIFIED_CONFLICT') {
        return res.status(409).json({
          error:
            'Please verify your Google email address before linking it with an existing FYOORA account.',
          code: 'ACCOUNT_EMAIL_UNVERIFIED_CONFLICT',
        });
      }
      if (code === 'ACCOUNT_SUSPENDED') {
        return res.status(403).json({
          error: 'This FYOORA account has been suspended. Please contact support.',
          code: 'ACCOUNT_SUSPENDED',
        });
      }
      if (code === 'auth/id-token-expired' || code === 'auth/id-token-revoked') {
        return res.status(401).json({
          error: 'Your Google sign-in token expired. Please click Continue with Google again.',
          code,
        });
      }
      console.warn('[auth] /api/auth/firebase verification failed:', code || err);
      return res.status(401).json({
        error: 'Unable to verify Firebase authentication token.',
        ...(code ? { code } : {}),
      });
    }
  });

  app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
    if (!req.authUser) {
      return res.json({ user: null });
    }
    return res.json({ user: req.authUser });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res, req);
    return res.json({ ok: true });
  });

  app.put('/api/users/profile', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { fullName, email, preferredLanguage, profileImage, address, contactPhone } = req.body || {};
    if (!fullName || String(fullName).trim().length < 2) {
      return res.status(400).json({ error: 'Full name (at least 2 characters) is required.' });
    }
    const normalizedContactPhone = contactPhone === undefined
      ? undefined
      : normalizeIndianPhone(String(contactPhone || ''));
    if (contactPhone !== undefined && !normalizedContactPhone) {
      return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number starting with 6-9.' });
    }
    const updated = await withTransaction((db) => {
      const user = db.users.find((u) => u.id === req.authUser!.id);
      if (!user) throw new Error('User not found.');
      const hasExistingContact = Boolean(user.contactPhone || (user.phone && user.phone !== '+910000000000'));
      if (!user.profileCompleted && !user.phoneVerified && !normalizedContactPhone && !hasExistingContact) {
        return null;
      }
      user.fullName = String(fullName).trim();
      if (normalizedContactPhone) {
        const unchangedContactPhone = user.contactPhone === normalizedContactPhone;
        user.contactPhone = normalizedContactPhone;
        user.contactPhoneVerified = Boolean(
          (user.phoneVerified && user.phone === normalizedContactPhone) ||
          (unchangedContactPhone && user.contactPhoneVerified)
        );
      } else if (!user.contactPhone && user.phoneVerified && user.phone) {
        user.contactPhone = user.phone;
        user.contactPhoneVerified = true;
      } else if (!user.contactPhone && hasExistingContact) {
        user.contactPhone = user.phone;
        user.contactPhoneVerified = Boolean(user.phoneVerified);
      }
      if (user.phone === '+910000000000') user.phone = '';
      if (email !== undefined) user.email = String(email).trim() || undefined;
      if (preferredLanguage === 'en' || preferredLanguage === 'ml') {
        user.preferredLanguage = preferredLanguage;
      }
      if (profileImage !== undefined) user.profileImage = String(profileImage) || undefined;
      if (address && address.line1) {
        const newAddr = {
          id: address.id || `addr-${Date.now()}`,
          label: String(address.label || 'Home'),
          line1: String(address.line1),
          landmark: address.landmark ? String(address.landmark) : undefined,
          city: String(address.city || 'Vadakara'),
          district: String(address.district || 'Kozhikode'),
          state: String(address.state || 'Kerala'),
          pincode: String(address.pincode || '673101'),
          lat: Number(address.lat) || 11.6085,
          lng: Number(address.lng) || 75.5917,
          isDefault: true,
        };
        user.addresses = [newAddr, ...user.addresses.map((a) => ({ ...a, isDefault: false }))];
      }
      user.profileCompleted = true;
      return user;
    });
    if (!updated) {
      return res.status(400).json({ error: 'A valid contact mobile number is required to complete your profile.' });
    }
    return res.json({ user: updated });
  });

  app.post('/api/users/addresses', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { label, line1, landmark, pincode, lat, lng } = req.body || {};
    if (!line1 || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return res.status(400).json({ error: 'Address line and valid coordinates are required.' });
    }
   const db = getDb();
const area = db.serviceAreas.find((item) => item.isActive);

if (!area) {
  return res.status(503).json({ error: 'No active service area is currently available.' });
}

const areaCheck = isPointInServiceArea(
  { lat: Number(lat), lng: Number(lng) },
  area
);

    const addresses = await withTransaction((txDb) => {
      const user = txDb.users.find((u) => u.id === req.authUser!.id)!;
      const next = {
        id: `addr-${Date.now()}`,
        label: String(label || 'Saved Place'),
        line1: String(line1),
        landmark: landmark ? String(landmark) : undefined,
        city: 'Vadakara',
        district: 'Kozhikode',
        state: 'Kerala',
        pincode: String(pincode || '673101'),
        lat: Number(lat),
        lng: Number(lng),
        isDefault: true,
      };
      user.addresses = [next, ...user.addresses.map((a) => ({ ...a, isDefault: false }))];
      return user.addresses;
    });
    return res.json({ addresses, areaCheck });
  });

  app.patch('/api/users/addresses/:addressId/default', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const addresses = await withTransaction((db) => {
        const user = db.users.find((u) => u.id === req.authUser!.id)!;
        const exists = user.addresses.some((a) => a.id === req.params.addressId);
        if (!exists) throw new Error('Address not found.');
        user.addresses = user.addresses.map((a) => ({
          ...a,
          isDefault: a.id === req.params.addressId,
        }));
        return user.addresses;
      });
      return res.json({ addresses });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Address not found.' });
    }
  });

  app.delete('/api/users/addresses/:addressId', requireAuth, async (req: AuthenticatedRequest, res) => {
    const addresses = await withTransaction((db) => {
      const user = db.users.find((u) => u.id === req.authUser!.id)!;
      user.addresses = user.addresses.filter((a) => a.id !== req.params.addressId);
      if (user.addresses.length > 0 && !user.addresses.some((a) => a.isDefault)) {
        user.addresses[0].isDefault = true;
      }
      return user.addresses;
    });
    return res.json({ addresses });
  });

  // Partner & Rider Onboarding Applications
  app.get('/api/applications/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const applications = db.partnerApplications.filter((a) => a.userId === req.authUser!.id);
    return res.json({ applications });
  });

  app.post('/api/applications', requireAuth, async (req: AuthenticatedRequest, res) => {
    const body = req.body || {};
    const type = body.type === 'rider' ? 'rider' : 'vendor';
    const phone = String(body.phone || req.authUser!.contactPhone || req.authUser!.phone || '').trim();

    if (type === 'vendor' && (!body.businessName || !body.address)) {
      return res.status(400).json({ error: 'Store / restaurant name and Vadakara address are required.' });
    }
    if (type === 'rider' && (!body.vehicleNumber || !body.licenseNumber || !body.aadhaarLast4)) {
      return res.status(400).json({ error: 'Vehicle number, driving license, and Aadhaar last 4 digits are required.' });
    }

    const application = await withTransaction((db) => {
      const now = new Date().toISOString();
      const rec: PartnerApplication = {
        id: `app-${crypto.randomBytes(4).toString('hex')}`,
        userId: req.authUser!.id,
        applicantName: String(body.applicantName || req.authUser!.fullName || 'FYOORA Applicant').trim(),
        phone,
        email: req.authUser!.email,
        type,
        businessName: type === 'vendor' ? String(body.businessName).trim() : undefined,
        serviceCategory: type === 'vendor' ? (body.serviceCategory || 'food') : undefined,
        areaName: body.areaName ? String(body.areaName).trim() : 'Vadakara Town',
        address: body.address ? String(body.address).trim() : undefined,
        vehicleType: type === 'rider' ? (body.vehicleType || 'Two-Wheeler') : undefined,
        vehicleNumber: type === 'rider' ? String(body.vehicleNumber).trim().toUpperCase() : undefined,
        licenseNumber: type === 'rider' ? String(body.licenseNumber).trim().toUpperCase() : undefined,
        aadhaarLast4: type === 'rider' ? String(body.aadhaarLast4).replace(/\D/g, '').slice(-4) : undefined,
        status: 'pending',
        createdAt: now,
      };
      db.partnerApplications.unshift(rec);
      db.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        actorId: req.authUser!.id,
        actorRole: req.authUser!.role,
        action: 'PARTNER_APPLICATION_SUBMITTED',
        targetType: 'partner_application',
        targetId: rec.id,
        details: `${rec.type.toUpperCase()} application submitted by ${rec.applicantName}`,
        createdAt: now,
      });
      return rec;
    });

    return res.status(201).json({ application });
  });

  app.post('/api/users/favourites/toggle', requireAuth, async (req: AuthenticatedRequest, res) => {
    const targetId = String(req.body?.targetId || '');
    if (!targetId) return res.status(400).json({ error: 'targetId required.' });
    const favourites = await withTransaction((db) => {
      const user = db.users.find((u) => u.id === req.authUser!.id)!;
      if (user.favourites.includes(targetId)) {
        user.favourites = user.favourites.filter((id) => id !== targetId);
      } else {
        user.favourites.push(targetId);
      }
      return user.favourites;
    });
    return res.json({ favourites });
  });

  app.post('/api/auth/delete-request', requireAuth, async (req: AuthenticatedRequest, res) => {
    const updated = await withTransaction((db) => {
      const user = db.users.find((u) => u.id === req.authUser!.id)!;
      user.accountStatus = 'deletion_requested';
      user.deletionRequestedAt = new Date().toISOString();
      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        actorId: user.id,
        actorRole: user.role,
        action: 'ACCOUNT_DELETION_REQUESTED',
        targetType: 'user',
        targetId: user.id,
        details: `Reason: ${String(req.body?.reason || 'User initiated')}`,
        createdAt: new Date().toISOString(),
      });
      return user;
    });
    return res.json({ user: updated });
  });
  // ── Phase 2: Marketplace Catalog & Discovery ─────────────────────────────────

app.get('/api/marketplace/bootstrap', (req: AuthenticatedRequest, res) => {
  const db = getDb();

  const activeVendors = db.vendors.filter(
    (v) => v.approved && !v.suspended && !v.isSampleSeed
  );

  const activeVendorIds = new Set(activeVendors.map((v) => v.id));

  const publicVendors = activeVendors.map((v) => ({
    id: v.id,
    name: v.name,
    serviceCategory: v.serviceCategory,
    supportsPreBooking: v.supportsPreBooking,
    cuisinesOrTags: v.cuisinesOrTags,
    logoUrl: v.logoUrl,
    coverUrl: v.coverUrl,
    address: v.address,
    areaName: v.areaName,
    location: v.location,
    openingHours: v.openingHours,
    isOpen: v.isOpen,
    avgPrepTimeMins: v.avgPrepTimeMins,
    rating: v.rating,
    reviewCount: v.reviewCount,
    priceLevel: v.priceLevel,
    coverageRadiusKm: v.coverageRadiusKm,
        featured: v.featured,
    sponsored: v.sponsored,
  }));

  const publicProducts = db.products
    .filter((p) => activeVendorIds.has(p.vendorId) && !p.isSampleSeed)
    .map((p) => ({
      id: p.id,
      vendorId: p.vendorId,
      serviceCategory: p.serviceCategory,
      category: p.category,
      name: p.name,
      nameMl: p.nameMl,
      description: p.description,
      imageUrl: p.imageUrl,
      price: p.price,
      mrp: p.mrp,
      unit: p.unit,
      isVeg: p.isVeg,
      inStock: p.inStock && !p.soldOutManual && (p.stockQty > 0),
      variations: p.variations,
      addons: p.addons,
      tags: p.tags,
      allowCustomCake: p.allowCustomCake,
      allowGiftCustomisation: p.allowGiftCustomisation,
      safetyVerified: p.safetyVerified,
      trending: p.trending,
    }));

  const area = db.serviceAreas.find((a) => a.isActive);

 const publicServiceArea = area
  ? {
      id: area.id,
      name: area.name,
      city: area.city,
      district: area.district,
      state: area.state,
      center: area.center,
      radiusKm: area.radiusKm,
      polygon: area.polygon,
      isActive: area.isActive,
      deliveryPricing: area.deliveryPricing,
      pickupDropPricing: area.pickupDropPricing,
    }
  : null;

  const publicServiceConfigs = db.serviceConfigs.map((config) => ({
    serviceKey: config.serviceKey,
    label: config.label,
    enabled: config.enabled,
    minOrderInr: config.minOrderInr,
  }));

  return res.json({
    serviceArea: publicServiceArea,
    serviceConfigs: publicServiceConfigs,
    vendors: publicVendors,
    products: publicProducts,
   preBookingSlots: db.preBookingSlots
  .filter((s) => s.isActive && activeVendorIds.has(s.vendorId))
  .map((s) => ({
    id: s.id,
    vendorId: s.vendorId,
    date: s.date,
    timeLabel: s.timeLabel,
    remainingCapacity: Math.max(0, s.maxCapacity - s.bookedCount),
  })),
   coupons: db.coupons
  .filter((c) => c.active && new Date(c.expiresAt).getTime() > Date.now())
  .map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    description: c.description,
    discountType: c.discountType,
    discountValue: c.discountValue,
    maxDiscountInr: c.maxDiscountInr,
    minOrderInr: c.minOrderInr,
    firstOrderOnly: c.firstOrderOnly,
    applicableServices: c.applicableServices,
    expiresAt: c.expiresAt,
  })),
    banners: db.banners
  .filter((b) => b.active)
  .map((b) => ({
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    targetService: b.targetService,
    imageUrl: b.imageUrl,
  })),
    reviews: db.reviews
  .filter((r) => r.status === 'published')
  .map((r) => ({
    id: r.id,
    customerName: r.customerName,
    vendorId: r.vendorId,
    productId: r.productId,
    rating: r.rating,
    deliveryRating: r.deliveryRating,
    comment: r.comment,
    createdAt: r.createdAt,
  })),
    onlineRidersCount: db.riders.filter(
      (r) => r.isOnline && r.kycStatus === 'approved'
    ).length,
    notifications: req.authUser
      ? db.notifications.filter((n) => n.userId === req.authUser!.id)
      : [],
  });
});


  app.post('/api/service-area/check', (req, res) => {
    const lat = Number(req.body?.lat);
    const lng = Number(req.body?.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ error: 'Valid lat/lng required.' });
    }
   const area = getDb().serviceAreas.find((item) => item.isActive);

if (!area) {
  return res.status(503).json({ error: 'No active service area is currently available.' });
}

return res.json({
  area: {
    id: area.id,
    name: area.name,
    city: area.city,
    district: area.district,
    state: area.state,
    center: area.center,
    radiusKm: area.radiusKm,
    polygon: area.polygon,
    isActive: area.isActive,
  },
  check: isPointInServiceArea({ lat, lng }, area),
});
  });

  app.post('/api/delivery/quote', (req, res) => {
    const db = getDb();
   const area = db.serviceAreas.find((item) => item.isActive);

if (!area) {
  return res.status(503).json({ error: 'No active service area is currently available.' });
}

const vendor = db.vendors.find((v) => v.id === req.body?.vendorId);
    const lat = Number(req.body?.lat) || area.center.lat;
    const lng = Number(req.body?.lng) || area.center.lng;
    const itemsSubtotal = Number(req.body?.itemsSubtotal) || 0;
    const activeRidersCount = db.riders.filter((r) => r.isOnline && r.kycStatus === 'approved').length;

    const areaCheck = isPointInServiceArea({ lat, lng }, area);
    const distanceKm = vendor ? Math.max(0.6, haversineDistanceKm(vendor.location, { lat, lng })) : 2.0;
    const prepTimeMins = vendor?.avgPrepTimeMins || 15;

    const tiers: DeliveryTier[] = (['EXPRESS', 'NORMAL', 'ECO'] as DeliveryTier[]).filter(
      (tier) => area.deliveryTiersEnabled?.[tier] !== false
    );
    const quotes = (tiers.length ? tiers : (['NORMAL'] as DeliveryTier[])).map((tier) =>
      calculateDeliveryQuote({
        distanceKm,
        prepTimeMins,
        itemsSubtotal,
        tier,
        activeRidersCount,
        serviceArea: area,
      })
    );

    return res.json({
      insideServiceArea: areaCheck.inside,
      areaReason: areaCheck.reason,
      distanceKm,
      activeRidersCount,
      quotes,
    });
  });

  app.post('/api/pickup-drop/quote', (req, res) => {
    const db = getDb();
   const area = db.serviceAreas.find((item) => item.isActive);

if (!area) {
  return res.status(503).json({ error: 'No active service area is currently available.' });
}
    const pickup = req.body?.pickup;
    const drop = req.body?.drop;
    const size = (req.body?.size || 'small') as 'small' | 'medium' | 'large';
    const weightKg = Number(req.body?.weightKg || 1);

    if (!pickup || !drop || Number.isNaN(Number(pickup.lat)) || Number.isNaN(Number(drop.lat))) {
      return res.status(400).json({ error: 'Valid pickup and drop coordinates are required.' });
    }

    const quote = calculatePickupDropQuote({
      pickup: { lat: Number(pickup.lat), lng: Number(pickup.lng) },
      drop: { lat: Number(drop.lat), lng: Number(drop.lng) },
      size,
      weightKg,
      serviceArea: area,
    });

    return res.json(quote);
  });

  app.post('/api/coupons/validate', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const code = String(req.body?.code || '').trim().toUpperCase();
    const subtotal = Number(req.body?.subtotal || 0);
    const serviceType = (req.body?.serviceType || 'food') as ServiceType;
    const coupon = db.coupons.find((c) => c.code.toUpperCase() === code);
    if (!coupon) {
      return res.status(404).json({ valid: false, error: `Coupon "${code}" not found.` });
    }
    const userOrderCount = db.orders.filter((o) => o.customerId === req.authUser!.id).length;
    const result = validateCoupon(coupon, subtotal, userOrderCount, serviceType);
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.reason });
    }
    return res.json({ valid: true, coupon, discountAmount: result.discountAmount });
  });

  // ── Phase 3 & 5: Order Creation, Payments, Pre-booking & Pickup-Drop ─────────
  app.post('/api/orders', requireAuth, async (req: AuthenticatedRequest, res) => {
    const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '');
    const user = req.authUser!;
    if (!user.contactPhone && !user.phone) {
      return res.status(400).json({ error: 'Add a contact mobile number before placing an order.' });
    }

    try {
      const result = await withTransaction(async (db) => {
        if (idempotencyKey && db.idempotencyKeys[idempotencyKey]) {
          const existingOrder = db.orders.find((o) => o.id === db.idempotencyKeys[idempotencyKey].orderId);
          if (existingOrder) {
            return { order: existingOrder, duplicatePrevented: true };
          }
        }

        const area = db.serviceAreas.find((item) => item.isActive);

if (!area) {
  throw new Error('No active service area is currently available.');
}
        const body = req.body || {};
        const serviceType = (body.serviceType || 'food') as ServiceType;
        const paymentMethod = (body.paymentMethod || 'cod') as PaymentMethod;
        const riderTip = Math.max(0, Math.min(2000, Number(body.riderTip || 0)));
        const deliveryMode = (body.deliveryMode || 'instant') as Order['deliveryMode'];
        const deliveryTier = (body.deliveryTier || 'NORMAL') as DeliveryTier;

        // Branch A: Pickup & Drop Public Courier Order
        if (serviceType === 'pickup_drop') {
          const pd = body.pickupDropDetails;
          if (!pd || !pd.pickupAddress || !pd.dropAddress || !pd.recipientPhone || !pd.parcelDescription) {
            throw new Error('Incomplete Pickup & Drop parcel details.');
          }
          if (!pd.prohibitedPolicyAccepted) {
            throw new Error('You must confirm the parcel complies with the prohibited items policy.');
          }
          const quote = calculatePickupDropQuote({
            pickup: { lat: Number(pd.pickupAddress.lat), lng: Number(pd.pickupAddress.lng) },
            drop: { lat: Number(pd.dropAddress.lat), lng: Number(pd.dropAddress.lng) },
            size: pd.parcelSize || 'small',
            weightKg: Number(pd.weightKg || 1),
            serviceArea: area,
          });
          if (!quote.valid) {
            throw new Error(quote.reason || 'Pickup & Drop out of Vadakara service area.');
          }

          const grandTotal = quote.totalFee + riderTip;
          const now = new Date().toISOString();
          const onlineRider = db.riders.find((r) => r.isOnline && r.kycStatus === 'approved');
          const orderId = `ord-${crypto.randomBytes(4).toString('hex')}`;
          const orderNumber = `FYR-PD-${crypto.randomInt(1000, 9999)}`;

          let razorpayOrderId: string | undefined;
          if (paymentMethod !== 'cod') {
            const gw = await createGatewayPaymentOrder({
              amountInr: grandTotal,
              receipt: orderNumber,
              notes: { orderId, serviceType: 'pickup_drop' },
            });
            razorpayOrderId = gw.gatewayOrderId;
          }

          const initialStatus: OrderStatus =
            paymentMethod === 'cod'
              ? onlineRider
                ? 'rider_assigned'
                : 'order_placed'
              : 'payment_pending';

          const newOrder: Order = {
            id: orderId,
            orderNumber,
            customerId: user.id,
            customerName: user.fullName || 'FYOORA Customer',
            customerPhone: user.contactPhone || user.phone,
            serviceType: 'pickup_drop',
            subOrders: [],
            items: [],
            deliveryAddress: pd.dropAddress,
            deliveryTier,
            deliveryMode: 'instant',
            riderInstructions: Array.isArray(body.riderInstructions) ? body.riderInstructions : [],
            riderCustomNote: body.riderCustomNote ? String(body.riderCustomNote) : undefined,
            pricing: {
              itemsSubtotal: 0,
              discount: 0,
              deliveryFee: quote.deliveryFee,
              platformFee: quote.platformFee,
              riderTip,
              grandTotal,
            },
            etaMinutes: { min: quote.etaMinMins, max: quote.etaMaxMins },
            distanceKm: quote.distanceKm,
            paymentMethod,
            paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
            razorpayOrderId,
            status: initialStatus,
            statusHistory: [
              { status: 'order_placed', timestamp: now, actorRole: user.role },
              ...(initialStatus !== 'order_placed'
                ? [{ status: initialStatus, timestamp: now, actorRole: 'admin' as UserRole }]
                : []),
            ],
            riderId: onlineRider?.id,
            riderName: onlineRider?.fullName,
            riderPhone: onlineRider?.phone,
            pickupOtp: String(crypto.randomInt(1000, 9999)),
            deliveryOtp: String(crypto.randomInt(1000, 9999)),
            pickupDropDetails: pd,
            createdAt: now,
            updatedAt: now,
          };

          db.orders.unshift(newOrder);
          db.notifications.unshift({
            id: `ntf-${Date.now()}`,
            userId: user.id,
            title: `Parcel ${orderNumber} booked`,
            body: onlineRider
              ? `Rider ${onlineRider.fullName} assigned. Share Pickup OTP ${newOrder.pickupOtp} at pickup.`
              : `Booking confirmed. Assigning nearest Vadakara rider.`,
            category: 'order',
            orderId: newOrder.id,
            read: false,
            createdAt: now,
          });
          if (idempotencyKey) {
            db.idempotencyKeys[idempotencyKey] = { orderId: newOrder.id, createdAt: now };
          }
          const rzpCfg = getRazorpayConfigStatus();
          return {
            order: newOrder,
            duplicatePrevented: false,
            razorpayConfigured: rzpCfg.configured,
            razorpayKeyId: rzpCfg.configured ? process.env.RAZORPAY_KEY_ID?.trim() : undefined,
          };
        }

        // Branch B: Marketplace Orders (Food, Pre-Booking, Bakery, Grocery, Celebration, Flowers, Local)
        const itemsInput = Array.isArray(body.items) ? (body.items as CartItem[]) : [];
        if (itemsInput.length === 0) {
          throw new Error('Your cart is empty.');
        }

        const deliveryAddress = body.deliveryAddress || user.addresses[0];
        if (!deliveryAddress) {
          throw new Error('Delivery address is required.');
        }

        if (deliveryMode !== 'prebooking_pickup') {
          const areaCheck = isPointInServiceArea(
            { lat: Number(deliveryAddress.lat), lng: Number(deliveryAddress.lng) },
            area
          );
          if (!areaCheck.inside) {
            throw new Error(areaCheck.reason || 'Delivery address is outside Vadakara active zone.');
          }
        }

        // Group by vendor (multi-vendor suborder ready, enforcing strict server-side pricing & stock)
        const vendorMap = new Map<string, Vendor>();
        const validatedItems: CartItem[] = [];
        let itemsSubtotal = 0;

        for (const reqItem of itemsInput) {
          const product = db.products.find((p) => p.id === reqItem.productId);
          if (!product) {
            throw new Error(`Product ${reqItem.name || reqItem.productId} no longer exists.`);
          }
          const vendor = db.vendors.find((v) => v.id === product.vendorId);
          if (!vendor || !vendor.approved || vendor.suspended) {
            throw new Error(`Store for ${product.name} is currently unavailable.`);
          }
          if (!vendor.isOpen && deliveryMode === 'instant') {
            throw new Error(`${vendor.name} is currently closed. Try scheduled delivery or another open store.`);
          }
          const invCheck = validateInventoryPurchase(product, Number(reqItem.quantity || 1));
          if (!invCheck.ok) {
            throw new Error(invCheck.reason);
          }

          // Decrement stock transactionally
          product.stockQty -= Number(reqItem.quantity);
          if (product.stockQty <= 0) {
            product.stockQty = 0;
            product.inStock = false;
          }

          const variationDelta = reqItem.selectedVariation
            ? product.variations?.find((v) => v.id === reqItem.selectedVariation?.id)?.priceDelta || 0
            : 0;
          const addonsTotal = (reqItem.selectedAddons || []).reduce((acc, a) => {
            const realAddon = product.addons?.find((pa) => pa.id === a.id);
            return acc + (realAddon ? realAddon.price : 0);
          }, 0);
          const customCakeExtra =
            reqItem.customCake?.size === '1 kg'
              ? 450
              : reqItem.customCake?.size === '1.5 kg'
                ? 850
                : reqItem.customCake?.size === '2 kg'
                  ? 1250
                  : 0;
          const giftPackagingExtra =
            reqItem.giftCustomisation?.packagingTier === 'Premium Keepsake Box (+₹60)' ? 60 : 0;

          const authoritativeUnitPrice = Math.max(
            1,
            product.price + variationDelta + addonsTotal + customCakeExtra + giftPackagingExtra
          );

          itemsSubtotal += authoritativeUnitPrice * Number(reqItem.quantity);
          vendorMap.set(vendor.id, vendor);
          validatedItems.push({
            ...reqItem,
            vendorId: vendor.id,
            vendorName: vendor.name,
            unitPrice: authoritativeUnitPrice,
            imageUrl: product.imageUrl,
          });
        }

        const primaryVendor = Array.from(vendorMap.values())[0];

        // Pre-booking slot validation
        if (deliveryMode === 'prebooking_pickup') {
          const slotId = String(body.preBookingSlotId || '');
          const slot = db.preBookingSlots.find((s) => s.id === slotId && s.vendorId === primaryVendor.id);
          if (!slot) {
            throw new Error('Valid pickup time slot must be selected for Food Pre-Booking.');
          }
          const capCheck = validateSlotCapacity(slot, 1);
          if (!capCheck.available) {
            throw new Error(capCheck.reason);
          }
          slot.bookedCount += 1;
        }

        // Coupon validation
        let discount = 0;
        let couponCode: string | undefined;
        if (body.couponCode) {
          const code = String(body.couponCode).trim().toUpperCase();
          const coupon = db.coupons.find((c) => c.code.toUpperCase() === code);
          if (!coupon) throw new Error(`Invalid coupon code: ${code}`);
          const userOrdersCount = db.orders.filter((o) => o.customerId === user.id).length;
          const cpRes = validateCoupon(coupon, itemsSubtotal, userOrdersCount, serviceType);
          if (!cpRes.valid) throw new Error(cpRes.reason);
          discount = cpRes.discountAmount;
          couponCode = coupon.code;
        }

        const activeRidersCount = db.riders.filter((r) => r.isOnline && r.kycStatus === 'approved').length;
        const distanceKm =
          deliveryMode === 'prebooking_pickup'
            ? 0
            : Math.max(0.6, haversineDistanceKm(primaryVendor.location, deliveryAddress));

        let deliveryFee = 0;
        let platformFee = area.deliveryPricing.platformFeeInr;
        let etaMinutes = { min: primaryVendor.avgPrepTimeMins, max: primaryVendor.avgPrepTimeMins + 5 };

        if (deliveryMode !== 'prebooking_pickup') {
          const quote = calculateDeliveryQuote({
            distanceKm,
            prepTimeMins: primaryVendor.avgPrepTimeMins,
            itemsSubtotal,
            tier: deliveryTier,
            activeRidersCount,
            serviceArea: area,
          });
          if (!quote.feasible) {
            throw new Error(quote.reason || 'Selected delivery option is currently unavailable.');
          }
          deliveryFee = quote.deliveryFee;
          platformFee = quote.platformFee;
          etaMinutes = { min: quote.etaMinMins, max: quote.etaMaxMins };
        }

        const grandTotal = Math.max(1, itemsSubtotal - discount + deliveryFee + platformFee + riderTip);
        const now = new Date().toISOString();
        const orderId = `ord-${crypto.randomBytes(4).toString('hex')}`;
        const orderNumber = `FYR-2026-${crypto.randomInt(1000, 9999)}`;

        let razorpayOrderId: string | undefined;
        if (paymentMethod !== 'cod') {
          const gw = await createGatewayPaymentOrder({
            amountInr: grandTotal,
            receipt: orderNumber,
            notes: { orderId, serviceType },
          });
          razorpayOrderId = gw.gatewayOrderId;
        }

        const subOrders = Array.from(vendorMap.values()).map((v) => {
          const vItems = validatedItems.filter((i) => i.vendorId === v.id);
          const vSubtotal = vItems.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
          const split = calculateSettlementSplit({
            itemsSubtotal: vSubtotal,
            deliveryFee: 0,
            platformFee: 0,
            riderTip: 0,
            commissionRate: v.commissionRate,
          });
          return {
            subOrderId: `sub-${orderId}-${v.id}`,
            vendorId: v.id,
            vendorName: v.name,
            status: (paymentMethod === 'cod' ? 'order_placed' : 'payment_pending') as OrderStatus,
            items: vItems,
            subtotal: vSubtotal,
            commissionAmount: split.platformCommission,
            vendorNetPayout: split.vendorNetPayout,
          };
        });

        const initialStatus: OrderStatus = paymentMethod === 'cod' ? 'order_placed' : 'payment_pending';

        const newOrder: Order = {
          id: orderId,
          orderNumber,
          customerId: user.id,
          customerName: user.fullName || 'FYOORA Customer',
          customerPhone: user.contactPhone || user.phone,
          serviceType,
          vendorId: primaryVendor.id,
          vendorName: primaryVendor.name,
          subOrders,
          items: validatedItems,
          deliveryAddress,
          deliveryTier,
          deliveryMode,
          scheduledDate: body.scheduledDate,
          scheduledSlot: body.scheduledSlot,
          preBookingSlotId: body.preBookingSlotId,
          riderInstructions: Array.isArray(body.riderInstructions) ? body.riderInstructions : [],
          riderCustomNote: body.riderCustomNote ? String(body.riderCustomNote) : undefined,
          unavailableReplacementPolicy: body.unavailableReplacementPolicy || 'call_me',
          pricing: {
            itemsSubtotal,
            discount,
            couponCode,
            deliveryFee,
            platformFee,
            riderTip,
            grandTotal,
          },
          etaMinutes,
          distanceKm,
          paymentMethod,
          paymentStatus: 'pending',
          razorpayOrderId,
          status: initialStatus,
          statusHistory: [{ status: initialStatus, timestamp: now, actorRole: user.role }],
          pickupOtp: String(crypto.randomInt(1000, 9999)),
          deliveryOtp: String(crypto.randomInt(1000, 9999)),
          createdAt: now,
          updatedAt: now,
        };

        db.orders.unshift(newOrder);
        db.notifications.unshift({
          id: `ntf-${Date.now()}`,
          userId: user.id,
          title: `Order ${orderNumber} placed`,
          body: `${primaryVendor.name} received your order (${validatedItems.length} item(s), ₹${grandTotal}).`,
          category: 'order',
          orderId: newOrder.id,
          read: false,
          createdAt: now,
        });

        if (idempotencyKey) {
          db.idempotencyKeys[idempotencyKey] = { orderId: newOrder.id, createdAt: now };
        }

        const rzpCfg = getRazorpayConfigStatus();
        return {
          order: newOrder,
          duplicatePrevented: false,
          razorpayConfigured: rzpCfg.configured,
          razorpayKeyId: rzpCfg.configured ? process.env.RAZORPAY_KEY_ID?.trim() : undefined,
        };
      });

      return res.status(201).json(result);
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to create order.' });
    }
  });

  app.post('/api/payments/razorpay/verify', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body || {};
      if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ error: 'All Razorpay verification fields are required.' });
      }

      const rzpStatus = getRazorpayConfigStatus();
      if (!rzpStatus.configured) {
        return res.status(400).json({
          error:
            'Razorpay server credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured. Use Cash on Delivery until live credentials are set.',
        });
      }

      const orderIdValue = String(orderId);
      const razorpayOrderIdValue = String(razorpayOrderId);
      const razorpayPaymentIdValue = String(razorpayPaymentId);
      const validSig = verifyRazorpayPaymentSignature({
        razorpayOrderId: razorpayOrderIdValue,
        razorpayPaymentId: razorpayPaymentIdValue,
        razorpaySignature: String(razorpaySignature),
      });
      if (!validSig) {
        return res.status(400).json({ error: 'Razorpay cryptographic signature verification failed.' });
      }

      const candidateOrder = getDb().orders.find(
        (candidate) => candidate.id === orderIdValue && candidate.customerId === req.authUser!.id
      );
      if (!candidateOrder) return res.status(404).json({ error: 'Order not found.' });
      if (!candidateOrder.razorpayOrderId || candidateOrder.razorpayOrderId !== razorpayOrderIdValue) {
        return res.status(400).json({ error: 'Razorpay order ID mismatch.' });
      }

      const captured = await verifyRazorpayPaymentCaptured({
        razorpayOrderId: razorpayOrderIdValue,
        razorpayPaymentId: razorpayPaymentIdValue,
        amountInr: candidateOrder.pricing.grandTotal,
      });
      if (!captured) {
        return res.status(409).json({
          error: 'Razorpay has not confirmed a captured payment for this order and amount yet. Retry shortly.',
          code: 'PAYMENT_NOT_CAPTURED',
        });
      }

      const order = await withTransaction((db) => {
        const ord = db.orders.find((candidate) => candidate.id === orderIdValue && candidate.customerId === req.authUser!.id);
        if (!ord) throw new Error('Order not found.');
        if (ord.razorpayOrderId !== razorpayOrderIdValue) throw new Error('Razorpay order ID mismatch.');
        if (ord.razorpayPaymentId && ord.razorpayPaymentId !== razorpayPaymentIdValue) {
          throw new Error('A different Razorpay payment is already attached to this order.');
        }
        if (ord.paymentStatus !== 'captured') {
          const now = new Date().toISOString();
          ord.paymentStatus = 'captured';
          ord.razorpayPaymentId = razorpayPaymentIdValue;
          if (ord.status === 'payment_pending' || ord.status === 'order_placed') {
            ord.status = 'payment_confirmed';
            ord.statusHistory.push({
              status: 'payment_confirmed',
              timestamp: now,
              actorRole: 'customer',
              note: 'Confirmed captured status with Razorpay API after signature verification',
            });
          }
          ord.subOrders.forEach((sub) => {
            if (sub.status === 'payment_pending' || sub.status === 'order_placed') {
              sub.status = 'payment_confirmed';
            }
          });
          ord.updatedAt = now;
          db.paymentTransactions.unshift({
            id: `pay-${crypto.randomBytes(4).toString('hex')}`,
            orderId: ord.id,
            userId: ord.customerId,
            method: ord.paymentMethod,
            amount: ord.pricing.grandTotal,
            currency: 'INR',
            status: 'captured',
            gateway: 'razorpay',
            gatewayOrderId: razorpayOrderIdValue,
            gatewayPaymentId: razorpayPaymentIdValue,
            createdAt: now,
            updatedAt: now,
          });
        }
        return ord;
      });

      return res.json({ verified: true, order });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Razorpay verification failed.' });
    }
  });

  app.get('/api/orders/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const myOrders = db.orders.filter((o) => o.customerId === req.authUser!.id);
    return res.json({ orders: myOrders });
  });

  app.post('/api/orders/:id/transition', requireAuth, async (req: AuthenticatedRequest, res) => {
    const user = req.authUser!;
    const targetStatus = req.body?.status as OrderStatus;
    const note = req.body?.note ? String(req.body.note) : undefined;
    const otpInput = req.body?.otp ? String(req.body.otp).trim() : undefined;
    const proofPhotoUrl = req.body?.proofPhotoUrl ? String(req.body.proofPhotoUrl) : undefined;

    if (targetStatus === 'refunded') {
      return res.status(400).json({ error: 'Use the admin refund action to request and track a payment refund.' });
    }

    try {
      const updated = await withTransaction((db) => {
        const ord = db.orders.find((o) => o.id === req.params.id);
        if (!ord) throw new Error('Order not found.');

        // Strict RBAC ownership verification
        const isCustomerOwner = ord.customerId === user.id;
        const isVendorOwner = Boolean(user.vendorId && ord.vendorId === user.vendorId);
        const isAssignedRider = Boolean(user.riderId && ord.riderId === user.riderId);
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';

        if (['restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'].includes(user.role)) {
          throw new Error('FORBIDDEN');
        }

        if (!isCustomerOwner && !isVendorOwner && !isAssignedRider && !isAdmin) {
          throw new Error('FORBIDDEN');
        }

        const check = isValidOrderTransition(ord.status, targetStatus, user.role);
        if (!check.valid) {
          throw new Error(check.reason);
        }

        // OTP checks for Pickup & Drop / Rider verification
        if (targetStatus === 'picked_up' && ord.serviceType === 'pickup_drop' && user.role === 'rider') {
          if (otpInput !== ord.pickupOtp) {
            throw new Error('Invalid Pickup OTP. Ask sender for the 4-digit Pickup OTP.');
          }
          if (proofPhotoUrl) ord.pickupProofPhotoUrl = proofPhotoUrl;
        }
        if (targetStatus === 'delivered' && user.role === 'rider') {
          if (otpInput !== ord.deliveryOtp) {
            throw new Error('Invalid Delivery OTP. Ask recipient for the 4-digit Delivery OTP.');
          }
          if (proofPhotoUrl) ord.deliveryProofPhotoUrl = proofPhotoUrl;

          if (ord.paymentMethod === 'cod') {
            ord.paymentStatus = 'captured';
          }
          // Credit rider earnings & individual tip
          if (ord.riderId) {
            const rider = db.riders.find((r) => r.id === ord.riderId);
            if (rider) {
              const split = calculateSettlementSplit({
                itemsSubtotal: ord.pricing.itemsSubtotal,
                deliveryFee: ord.pricing.deliveryFee,
                platformFee: ord.pricing.platformFee,
                riderTip: ord.pricing.riderTip,
                commissionRate: 0.15,
              });
              rider.completedDeliveries += 1;
              rider.earningsTotal += split.riderTotalPayout;
              rider.tipsTotal += split.riderTip;
              rider.pendingSettlement += split.riderTotalPayout;
            }
          }
        }

        // Auto-assign an online rider when vendor marks ready_for_pickup on delivery orders
        if (targetStatus === 'ready_for_pickup' && ord.deliveryMode !== 'prebooking_pickup' && !ord.riderId) {
          const onlineRider = db.riders.find((r) => r.isOnline && r.kycStatus === 'approved');
          if (onlineRider) {
            ord.riderId = onlineRider.id;
            ord.riderName = onlineRider.fullName;
            ord.riderPhone = onlineRider.phone;
          }
        }

        if (targetStatus === 'cancelled' && ord.paymentStatus === 'captured') {
          ord.paymentStatus = 'refund_pending';
        }
        const now = new Date().toISOString();
        ord.status = targetStatus;
        ord.updatedAt = now;
        ord.statusHistory.push({ status: targetStatus, timestamp: now, actorRole: user.role, note });

        db.notifications.unshift({
          id: `ntf-${Date.now()}`,
          userId: ord.customerId,
          title: `Order ${ord.orderNumber} updated`,
          body: `Status changed to ${targetStatus.replace(/_/g, ' ')}.`,
          category: 'order',
          orderId: ord.id,
          read: false,
          createdAt: now,
        });

        return ord;
      });
      return res.json({ order: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to update order status.';
      return res.status(msg === 'FORBIDDEN' ? 403 : 400).json({ error: msg });
    }
  });

  app.post('/api/orders/:id/review', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const rating = Math.max(1, Math.min(5, Number(req.body?.rating || 5)));
      const deliveryRating = Math.max(1, Math.min(5, Number(req.body?.deliveryRating || 5)));
      const comment = String(req.body?.comment || '').trim();

      const review = await withTransaction((db) => {
        const ord = db.orders.find((o) => o.id === req.params.id && o.customerId === req.authUser!.id);
        if (!ord) throw new Error('Verified order not found for your account.');
        if (ord.status !== 'delivered') throw new Error('Only delivered orders can be reviewed.');
        if (ord.reviewed) throw new Error('Order already reviewed.');

        ord.reviewed = true;
        const rec = {
          id: `rev-${Date.now()}`,
          orderId: ord.id,
          customerId: req.authUser!.id,
          customerName: req.authUser!.fullName || 'Customer',
          vendorId: ord.vendorId,
          riderId: ord.riderId,
          rating,
          deliveryRating,
          comment,
          status: 'published' as const,
          createdAt: new Date().toISOString(),
        };
        db.reviews.unshift(rec);
        if (ord.vendorId) {
          const vendor = db.vendors.find((v) => v.id === ord.vendorId);
          if (vendor) {
            vendor.rating = Number(
              ((vendor.rating * vendor.reviewCount + rating) / (vendor.reviewCount + 1)).toFixed(1)
            );
            vendor.reviewCount += 1;
          }
        }
        return rec;
      });
      return res.json({ review });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to submit review.' });
    }
  });

  // ── Phase 4: Vendor Portals (Restaurant, Bakery, Grocery, Local Merchant) ────
  app.get(
    '/api/vendor/dashboard',
    requireAuth,
    requireRole('restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'),
    (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authUser!;
      const myVendors =
        user.role === 'super_admin'
          ? db.vendors
          : db.vendors.filter((v) => v.ownerUserId === user.id || v.id === user.vendorId);
      const myVendorIds = new Set(myVendors.map((v) => v.id));

      const myProducts = db.products.filter((p) => myVendorIds.has(p.vendorId));
      const myOrders = db.orders.filter(
        (o) =>
          (o.vendorId && myVendorIds.has(o.vendorId)) ||
          o.subOrders.some((subOrder) => myVendorIds.has(subOrder.vendorId))
      );
      const mySlots = db.preBookingSlots.filter((s) => myVendorIds.has(s.vendorId));
      const mySettlements = db.settlements.filter(
        (s) => s.recipientType === 'vendor' && myVendorIds.has(s.recipientId)
      );

      return res.json({
        vendors: myVendors,
        products: myProducts,
        orders: myOrders,
        preBookingSlots: mySlots,
        settlements: mySettlements,
      });
    }
  );

  app.post(
    '/api/vendor/orders/:orderId/transition',
    requireAuth,
    requireRole('restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const targetStatus = String(req.body?.status || '') as OrderStatus;
        const vendorId = String(req.body?.vendorId || '');
        const allowedTargets: OrderStatus[] = [
          'vendor_accepted',
          'preparation_started',
          'ready_for_pickup',
          'delivered',
          'cancelled',
        ];
        if (!allowedTargets.includes(targetStatus)) {
          return res.status(400).json({ error: 'This status change is not available to store owners.' });
        }

        const order = await withTransaction((db) => {
          const vendor = db.vendors.find(
            (item) =>
              item.id === vendorId &&
              (req.authUser!.role === 'super_admin' ||
                item.ownerUserId === req.authUser!.id ||
                item.id === req.authUser!.vendorId)
          );
          if (!vendor) throw new Error('FORBIDDEN');
          const ord = db.orders.find((item) => item.id === req.params.orderId);
          if (!ord) throw new Error('Order not found.');
          const ownedSubOrders = ord.subOrders.filter((item) => item.vendorId === vendor.id);
          if (!ownedSubOrders.length) throw new Error('This order does not contain items from your store.');
          if (targetStatus === 'delivered' && ord.deliveryMode !== 'prebooking_pickup') {
            throw new Error('Only self-pickup orders can be completed by the store.');
          }
          if (targetStatus === 'cancelled' && ord.subOrders.some((item) => item.vendorId !== vendor.id)) {
            throw new Error('A store cannot cancel only part of a multi-store order. Contact FYOORA support for help.');
          }

          for (const subOrder of ownedSubOrders) {
            const transition = isValidOrderTransition(subOrder.status, targetStatus, req.authUser!.role);
            if (!transition.valid) throw new Error(transition.reason || 'Order status change is not allowed.');
          }
          const now = new Date().toISOString();
          ownedSubOrders.forEach((subOrder) => {
            subOrder.status = targetStatus;
          });

          const allReadyForPickup = ord.subOrders.every((item) =>
            ['ready_for_pickup', 'delivered'].includes(item.status)
          );
          const allDelivered = ord.subOrders.every((item) => item.status === 'delivered');
          let nextOrderStatus = ord.status;
          if (targetStatus === 'cancelled') {
            nextOrderStatus = 'cancelled';
            if (ord.paymentStatus === 'captured') ord.paymentStatus = 'refund_pending';
          } else if (targetStatus === 'delivered' && allDelivered) {
            nextOrderStatus = 'delivered';
            if (ord.paymentMethod === 'cod') ord.paymentStatus = 'captured';
          } else if (allReadyForPickup) {
            nextOrderStatus = 'ready_for_pickup';
          } else if (ord.subOrders.every((item) =>
            ['vendor_accepted', 'preparation_started', 'ready_for_pickup', 'delivered'].includes(item.status)
          )) {
            nextOrderStatus = ord.subOrders.some((item) =>
              ['preparation_started', 'ready_for_pickup', 'delivered'].includes(item.status)
            ) ? 'preparation_started' : 'vendor_accepted';
          }

          if (
            nextOrderStatus === 'ready_for_pickup' &&
            ord.deliveryMode !== 'prebooking_pickup' &&
            !ord.riderId
          ) {
            const onlineRider = db.riders.find((rider) => rider.isOnline && rider.kycStatus === 'approved');
            if (onlineRider) {
              ord.riderId = onlineRider.id;
              ord.riderName = onlineRider.fullName;
              ord.riderPhone = onlineRider.phone;
            }
          }

          if (nextOrderStatus !== ord.status) ord.status = nextOrderStatus;
          ord.updatedAt = now;
          ord.statusHistory.push({
            status: ord.status,
            timestamp: now,
            actorRole: req.authUser!.role,
            note: `${vendor.name} marked its items ${targetStatus.replace(/_/g, ' ')}`,
          });
          db.notifications.unshift({
            id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
            userId: ord.customerId,
            title: `Order ${ord.orderNumber} updated`,
            body: `${vendor.name} updated its items to ${targetStatus.replace(/_/g, ' ')}.`,
            category: 'order',
            orderId: ord.id,
            read: false,
            createdAt: now,
          });
          return ord;
        });
        return res.json({ order });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update this store order.';
        return res.status(message === 'FORBIDDEN' ? 403 : 400).json({ error: message });
      }
    }
  );

  app.patch(
    '/api/vendor/store/:vendorId',
    requireAuth,
    requireRole('restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const updated = await withTransaction((db) => {
          const vendor = db.vendors.find((v) => v.id === req.params.vendorId);
          if (!vendor) throw new Error('Vendor not found.');
          if (
            req.authUser!.role !== 'super_admin' &&
            vendor.ownerUserId !== req.authUser!.id &&
            req.authUser!.vendorId !== vendor.id
          ) {
            throw new Error('FORBIDDEN');
          }
          if (typeof req.body?.isOpen === 'boolean') vendor.isOpen = req.body.isOpen;
          if (typeof req.body?.avgPrepTimeMins === 'number') {
            vendor.avgPrepTimeMins = Math.max(5, Math.min(120, req.body.avgPrepTimeMins));
          }
          if (req.body?.openingHours) vendor.openingHours = String(req.body.openingHours);
          return vendor;
        });
        return res.json({ vendor: updated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed.';
        return res.status(msg === 'FORBIDDEN' ? 403 : 400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/vendor/products',
    requireAuth,
    requireRole('restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const created = await withTransaction((db) => {
          const vendorId = String(req.body?.vendorId || req.authUser!.vendorId || '');
          const vendor = db.vendors.find((v) => v.id === vendorId);
          if (!vendor) throw new Error('Valid vendorId required.');
          if (req.authUser!.role !== 'super_admin' && vendor.ownerUserId !== req.authUser!.id) {
            throw new Error('FORBIDDEN');
          }
          const product: Product = {
            id: `prd-${crypto.randomBytes(4).toString('hex')}`,
            vendorId: vendor.id,
            serviceCategory: vendor.serviceCategory,
            category: String(req.body?.category || 'General'),
            name: String(req.body?.name || '').trim(),
            description: String(req.body?.description || ''),
            imageUrl: String(req.body?.imageUrl || vendor.logoUrl),
            price: Math.max(1, Number(req.body?.price || 100)),
            unit: req.body?.unit ? String(req.body.unit) : '1 Unit',
            isVeg: typeof req.body?.isVeg === 'boolean' ? req.body.isVeg : true,
            inStock: Number(req.body?.stockQty ?? 10) > 0,
            stockQty: Math.max(0, Number(req.body?.stockQty ?? 10)),
            soldOutManual: false,
          };
          if (!product.name) throw new Error('Product name is required.');
          db.products.unshift(product);
          return product;
        });
        return res.status(201).json({ product: created });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to add product.';
        return res.status(msg === 'FORBIDDEN' ? 403 : 400).json({ error: msg });
      }
    }
  );

  app.patch(
    '/api/vendor/products/:productId',
    requireAuth,
    requireRole('restaurant_owner', 'bakery_owner', 'grocery_owner', 'merchant'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const updated = await withTransaction((db) => {
          const product = db.products.find((p) => p.id === req.params.productId);
          if (!product) throw new Error('Product not found.');
          const vendor = db.vendors.find((v) => v.id === product.vendorId);
          if (req.authUser!.role !== 'super_admin' && vendor?.ownerUserId !== req.authUser!.id) {
            throw new Error('FORBIDDEN');
          }
          if (typeof req.body?.price === 'number') product.price = Math.max(1, req.body.price);
          if (typeof req.body?.stockQty === 'number') {
            product.stockQty = Math.max(0, req.body.stockQty);
            product.inStock = product.stockQty > 0 && !product.soldOutManual;
          }
          if (typeof req.body?.soldOutManual === 'boolean') {
            product.soldOutManual = req.body.soldOutManual;
            product.inStock = !product.soldOutManual && product.stockQty > 0;
          }
          return product;
        });
        return res.json({ product: updated });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Update failed.';
        return res.status(msg === 'FORBIDDEN' ? 403 : 400).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/vendor/prebooking-slots',
    requireAuth,
    requireRole('restaurant_owner'),
    async (req: AuthenticatedRequest, res) => {
      try {
        const slot = await withTransaction((db) => {
          const vendorId = String(req.body?.vendorId || req.authUser!.vendorId);
          const vendor = db.vendors.find((v) => v.id === vendorId);
          if (!vendor) throw new Error('Vendor not found.');
          if (req.authUser!.role !== 'super_admin' && vendor.ownerUserId !== req.authUser!.id) {
            throw new Error('FORBIDDEN');
          }
          const created = {
            id: `slot-${Date.now()}`,
            vendorId: vendor.id,
            date: String(req.body?.date || new Date().toISOString().slice(0, 10)),
            timeLabel: String(req.body?.timeLabel || '07:00 PM - 07:30 PM'),
            maxCapacity: Math.max(1, Number(req.body?.maxCapacity || 10)),
            bookedCount: 0,
            isActive: true,
          };
          db.preBookingSlots.push(created);
          return created;
        });
        return res.status(201).json({ slot });
      } catch (err) {
        return res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create slot.' });
      }
    }
  );

  // ── Phase 5: Rider Portal ────────────────────────────────────────────────────
  app.get('/api/rider/dashboard', requireAuth, requireRole('rider'), (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const requestedRiderId = req.query?.riderId ? String(req.query.riderId) : undefined;
    const rider =
      req.authUser!.role === 'super_admin'
        ? (requestedRiderId ? db.riders.find((r) => r.id === requestedRiderId) : db.riders[0])
        : db.riders.find((r) => r.userId === req.authUser!.id || r.id === req.authUser!.riderId);
    if (!rider) {
      return res.status(404).json({ error: 'Rider profile not found.' });
    }
    // Riders ONLY see orders assigned to them OR unassigned jobs needing pickup when rider is online
    const assignedOrders = db.orders.filter((o) => o.riderId === rider.id);
    const availableJobs =
      rider.isOnline && rider.kycStatus === 'approved'
        ? db.orders.filter(
            (o) =>
              !o.riderId &&
              o.deliveryMode !== 'prebooking_pickup' &&
              ['order_placed', 'payment_confirmed', 'ready_for_pickup'].includes(o.status)
          )
        : [];
    const settlements = db.settlements.filter(
      (s) => s.recipientType === 'rider' && s.recipientId === rider.id
    );

    return res.json({ rider, assignedOrders, availableJobs, settlements });
  });

  app.post('/api/rider/status', requireAuth, requireRole('rider'), async (req: AuthenticatedRequest, res) => {
    try {
      const rider = await withTransaction((db) => {
        const r = db.riders.find((item) => item.userId === req.authUser!.id || item.id === req.authUser!.riderId);
        if (!r) throw new Error('Rider not found.');
        if (req.body?.isOnline === true && r.kycStatus !== 'approved') {
          throw new Error('KYC approval is required before going online.');
        }
        if (typeof req.body?.isOnline === 'boolean') r.isOnline = req.body.isOnline;
        if (req.body?.lat !== undefined || req.body?.lng !== undefined) {
          const lat = Number(req.body?.lat);
          const lng = Number(req.body?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            throw new Error('A valid latitude and longitude are required.');
          }
          r.currentLocation = { lat, lng };
          r.lastLocationUpdatedAt = new Date().toISOString();
        }
        return r;
      });
      return res.json({ rider });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update rider status.';
      return res.status(message.includes('KYC') ? 403 : 400).json({ error: message });
    }
  });

  app.post('/api/rider/jobs/:orderId/accept', requireAuth, requireRole('rider'), async (req: AuthenticatedRequest, res) => {
    try {
      const order = await withTransaction((db) => {
        const rider = db.riders.find((r) => r.userId === req.authUser!.id || r.id === req.authUser!.riderId);
        if (!rider || !rider.isOnline || rider.kycStatus !== 'approved') {
          throw new Error('Rider must be online and KYC approved to accept jobs.');
        }
        const ord = db.orders.find((o) => o.id === req.params.orderId);
        if (!ord) throw new Error('Order not found.');
        if (ord.riderId && ord.riderId !== rider.id) {
          throw new Error('Job already claimed by another rider.');
        }
        ord.riderId = rider.id;
        ord.riderName = rider.fullName;
        ord.riderPhone = rider.phone;
        if (['order_placed', 'payment_confirmed', 'ready_for_pickup'].includes(ord.status)) {
          ord.status = 'rider_assigned';
          ord.updatedAt = new Date().toISOString();
          ord.statusHistory.push({
            status: 'rider_assigned',
            timestamp: ord.updatedAt,
            actorRole: 'rider',
            note: `Accepted by ${rider.fullName}`,
          });
        }
        return ord;
      });
      return res.json({ order });
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to accept job.' });
    }
  });

  // ── Phase 6: Super Admin Enterprise Dashboard & BI APIs ──────────────────────
  app.use('/api/admin', createAdminRouter());

  // ── Support Tickets & Notifications ──────────────────────────────────────────
  app.get('/api/support/tickets', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const isAdminOrStaff = ['admin', 'super_admin', 'support_staff'].includes(req.authUser!.role);
    const tickets = isAdminOrStaff
      ? db.supportTickets
      : db.supportTickets.filter((t) => t.userId === req.authUser!.id);
    return res.json({ tickets });
  });

  const suggestionAreas: SuggestionArea[] = [
    'food', 'bakery', 'grocery', 'flowers_gifts', 'celebration', 'delivery', 'payments', 'profile', 'other',
  ];
  const suggestionStatuses: FeatureSuggestion['status'][] = [
    'new', 'reviewing', 'planned', 'in_progress', 'completed', 'declined',
  ];

  app.get('/api/feedback/suggestions/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const suggestions = getDb().featureSuggestions
      .filter((item) => item.userId === req.authUser!.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ suggestions });
  });

  app.post('/api/feedback/suggestions', requireAuth, requireRole('customer'), async (req: AuthenticatedRequest, res) => {
    const area = String(req.body?.area || '') as SuggestionArea;
    const title = String(req.body?.title || '').trim();
    const details = String(req.body?.details || '').trim();
    if (!suggestionAreas.includes(area)) return res.status(400).json({ error: 'Choose an area for your suggestion.' });
    if (title.length < 3 || title.length > 120) return res.status(400).json({ error: 'Title must be between 3 and 120 characters.' });
    if (details.length < 10 || details.length > 2000) return res.status(400).json({ error: 'Please describe your idea in 10 to 2,000 characters.' });

    try {
      const suggestion = await withTransaction((db) => {
        const since = Date.now() - 24 * 60 * 60 * 1000;
        const recentCount = db.featureSuggestions.filter(
          (item) => item.userId === req.authUser!.id && Date.parse(item.createdAt) >= since
        ).length;
        if (recentCount >= 5) throw new Error('FEEDBACK_LIMIT');
        const now = new Date().toISOString();
        const record: FeatureSuggestion = {
          id: `sug-${crypto.randomBytes(5).toString('hex')}`,
          userId: req.authUser!.id,
          userName: req.authUser!.fullName || req.authUser!.contactPhone || req.authUser!.phone,
          area,
          title,
          details,
          status: 'new',
          createdAt: now,
          updatedAt: now,
        };
        db.featureSuggestions.unshift(record);
        return record;
      });
      return res.status(201).json({ suggestion });
    } catch (err) {
      if (err instanceof Error && err.message === 'FEEDBACK_LIMIT') {
        return res.status(429).json({ error: 'You have sent five suggestions in the last 24 hours. Please try again tomorrow.' });
      }
      return res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to send suggestion.' });
    }
  });

  app.patch('/api/admin/suggestions/:id/status', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthenticatedRequest, res) => {
    const status = String(req.body?.status || '') as FeatureSuggestion['status'];
    if (!suggestionStatuses.includes(status)) return res.status(400).json({ error: 'Invalid suggestion status.' });
    try {
      const suggestion = await withTransaction((db) => {
        const record = db.featureSuggestions.find((item) => item.id === req.params.id);
        if (!record) throw new Error('Suggestion not found.');
        const previousStatus = record.status;
        const now = new Date().toISOString();
        record.status = status;
        record.updatedAt = now;
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'ADMIN_UPDATE_CUSTOMER_SUGGESTION',
          targetType: 'feature_suggestion',
          targetId: record.id,
          details: `Suggestion "${record.title}" status changed from ${previousStatus} to ${status}`,
          createdAt: now,
        });
        db.notifications.unshift({
          id: `ntf-${crypto.randomBytes(4).toString('hex')}`,
          userId: record.userId,
          title: 'Update on your FYOORA suggestion',
          body: `"${record.title}" is now ${status.replace(/_/g, ' ')}.`,
          category: 'system',
          read: false,
          createdAt: now,
        });
        return record;
      });
      return res.json({ suggestion });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to update suggestion.' });
    }
  });

  app.post('/api/support/tickets', requireAuth, async (req: AuthenticatedRequest, res) => {
    const { orderId, category, subject, description } = req.body || {};
    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required.' });
    }
    const ticket = await withTransaction((db) => {
      const ord = orderId ? db.orders.find((o) => o.id === orderId) : undefined;
      const now = new Date().toISOString();
      const created = {
        id: `tkt-${Date.now()}`,
        userId: req.authUser!.id,
        userName: req.authUser!.fullName || req.authUser!.contactPhone || req.authUser!.phone,
        orderId: ord?.id,
        orderNumber: ord?.orderNumber,
        category: category || 'other',
        subject: String(subject),
        description: String(description),
        status: 'open' as const,
        messages: [
          {
            senderRole: req.authUser!.role,
            senderName: req.authUser!.fullName || req.authUser!.contactPhone || req.authUser!.phone,
            text: String(description),
            createdAt: now,
          },
        ],
        createdAt: now,
      };
      db.supportTickets.unshift(created);
      return created;
    });
    return res.status(201).json({ ticket });
  });

  app.post('/api/support/tickets/:id/reply', requireAuth, async (req: AuthenticatedRequest, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Reply text required.' });
    const requestedStatus = req.body?.status;
    const validStatuses = ['open', 'in_review', 'resolved', 'closed'];
    const isStaffRole = ['admin', 'super_admin', 'support_staff'].includes(req.authUser!.role);
    if (requestedStatus && !isStaffRole) return res.status(403).json({ error: 'Only support staff can change ticket status.' });
    if (requestedStatus && !validStatuses.includes(String(requestedStatus))) {
      return res.status(400).json({ error: 'Invalid ticket status.' });
    }
    const ticket = await withTransaction((db) => {
      const t = db.supportTickets.find((item) => item.id === req.params.id);
      if (!t) throw new Error('Ticket not found.');
      const isStaff = isStaffRole;
      if (!isStaff && t.userId !== req.authUser!.id) throw new Error('Unauthorized');
      t.messages.push({
        senderRole: req.authUser!.role,
        senderName: req.authUser!.fullName || 'Support',
        text,
        createdAt: new Date().toISOString(),
      });
      if (isStaff && req.body?.status) {
        t.status = req.body.status;
      }
      return t;
    });
    return res.json({ ticket });
  });

  app.patch('/api/support/tickets/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
    if (!['admin', 'super_admin', 'support_staff'].includes(req.authUser!.role)) {
      return res.status(403).json({ error: 'Only support staff can change ticket status.' });
    }
    const status = String(req.body?.status || '');
    if (!['open', 'in_review', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid ticket status.' });
    }
    try {
      const ticket = await withTransaction((db) => {
        const record = db.supportTickets.find((item) => item.id === req.params.id);
        if (!record) throw new Error('Ticket not found.');
        const previous = record.status;
        record.status = status as SupportTicket['status'];
        const now = new Date().toISOString();
        db.auditLogs.unshift({
          id: `aud-${crypto.randomBytes(4).toString('hex')}`,
          actorId: req.authUser!.id,
          actorRole: req.authUser!.role,
          action: 'SUPPORT_TICKET_STATUS_CHANGED',
          targetType: 'support_ticket',
          targetId: record.id,
          details: `${record.orderNumber || record.subject}: ${previous} → ${record.status}`,
          createdAt: now,
        });
        return record;
      });
      return res.json({ ticket });
    } catch (err) {
      return res.status(404).json({ error: err instanceof Error ? err.message : 'Unable to update ticket status.' });
    }
  });

  app.post('/api/notifications/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    await withTransaction((db) => {
      db.notifications.forEach((n) => {
        if (n.userId === req.authUser!.id) n.read = true;
      });
    });
    return res.json({ ok: true });
  });

  // ── Phase 7: Gemini AI Assistant (Live DB Grounded, EN & ML) ─────────────────
  app.post('/api/ai/chat', async (req: AuthenticatedRequest, res) => {
    try {
      const message = String(req.body?.message || '').trim();
      const language = (req.body?.language === 'ml' ? 'ml' : 'en') as 'en' | 'ml';
      if (!message) {
        return res.status(400).json({ error: 'Please enter a message for FYOORA AI.' });
      }
      const aiResult = await runFyooraAiChat({
        message,
        language,
        user: req.authUser,
      });

      await withTransaction((db) => {
        const key = req.authUser?.id || 'guest';
        if (!db.aiConversations[key]) {
          db.aiConversations[key] = { id: `ai-${key}`, userId: key, messages: [] };
        }
        const now = new Date().toISOString();
        db.aiConversations[key].messages.push(
          { role: 'user', text: message, createdAt: now },
          { role: 'assistant', text: aiResult.reply, createdAt: now }
        );
      });

      return res.json(aiResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'FYOORA AI service error.';
      return res.status(500).json({ error: msg });
    }
  });

  // ── Vite Dev Middleware OR Production Static Serving ─────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        return res.sendFile(indexHtml);
      }
      return res.status(404).send('Build output not found. Run npm run build.');
    });
  }


  return app;
}

export const appPromise = bootstrapServer();

if (process.env.VERCEL !== '1') {
  appPromise
    .then((app) => {
      const host = '0.0.0.0';
      app.listen(PORT, host, () => {
        console.log(`FYOORA server listening on http://${host}:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start FYOORA server:', err);
      process.exit(1);
    });
}