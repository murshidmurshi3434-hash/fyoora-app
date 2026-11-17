import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAndDispatchOtp,
  getAuthConfigurationStatus,
  getSessionCookieOptions,
  isDevRoleSwitchEnabled,
  resolveAndLinkFirebaseUser,
  signSessionToken,
  verifyOtpChallenge,
  verifySessionToken,
} from './auth.ts';
import { getRazorpayConfigStatus } from './payments.ts';
import { createInitialSeedState } from './seedData.ts';

test('getAuthConfigurationStatus reports phone authentication as PENDING CONFIGURATION when optional env vars are empty', () => {
  const prevFb = process.env.FIREBASE_PHONE_AUTH_ENABLED;
  const prevViteFb = process.env.VITE_ENABLE_FIREBASE_PHONE_AUTH;
  const prevSmsUrl = process.env.SMS_PROVIDER_URL;
  const prevSmsKey = process.env.SMS_API_KEY;
  process.env.FIREBASE_PHONE_AUTH_ENABLED = '';
  process.env.VITE_ENABLE_FIREBASE_PHONE_AUTH = '';
  process.env.SMS_PROVIDER_URL = '';
  process.env.SMS_API_KEY = '';

  try {
    const status = getAuthConfigurationStatus();
    assert.equal(status.googleAuthConfigured, true);
    assert.equal(status.phoneAuth.configured, false);
    assert.equal(status.phoneAuth.provider, 'pending_configuration');
    assert.equal(status.phoneAuth.statusLabel, 'PENDING CONFIGURATION');
    assert.equal(status.devRoleSwitcherEnabled, false);
  } finally {
    if (prevFb === undefined) delete process.env.FIREBASE_PHONE_AUTH_ENABLED;
    else process.env.FIREBASE_PHONE_AUTH_ENABLED = prevFb;
    if (prevViteFb === undefined) delete process.env.VITE_ENABLE_FIREBASE_PHONE_AUTH;
    else process.env.VITE_ENABLE_FIREBASE_PHONE_AUTH = prevViteFb;
    if (prevSmsUrl === undefined) delete process.env.SMS_PROVIDER_URL;
    else process.env.SMS_PROVIDER_URL = prevSmsUrl;
    if (prevSmsKey === undefined) delete process.env.SMS_API_KEY;
    else process.env.SMS_API_KEY = prevSmsKey;
  }
});

test('isDevRoleSwitchEnabled stays false when empty and never activates in production', () => {
  const prevSwitch = process.env.ENABLE_DEV_ROLE_SWITCH;
  const prevLegacy = process.env.ENABLE_DEV_ROLE_SWITCHER;
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    process.env.ENABLE_DEV_ROLE_SWITCH = '';
    process.env.ENABLE_DEV_ROLE_SWITCHER = '';
    assert.equal(isDevRoleSwitchEnabled(), false);

    process.env.ENABLE_DEV_ROLE_SWITCH = 'true';
    assert.equal(isDevRoleSwitchEnabled(), true);

    process.env.NODE_ENV = 'test';
    assert.equal(isDevRoleSwitchEnabled(), false);

    process.env.NODE_ENV = 'production';
    assert.equal(isDevRoleSwitchEnabled(), false);
  } finally {
    if (prevSwitch === undefined) delete process.env.ENABLE_DEV_ROLE_SWITCH;
    else process.env.ENABLE_DEV_ROLE_SWITCH = prevSwitch;
    if (prevLegacy === undefined) delete process.env.ENABLE_DEV_ROLE_SWITCHER;
    else process.env.ENABLE_DEV_ROLE_SWITCHER = prevLegacy;
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  }
});

test('getRazorpayConfigStatus reports PENDING CONFIGURATION without blocking when optional keys are empty', () => {
  const prevKeyId = process.env.RAZORPAY_KEY_ID;
  const prevKeySecret = process.env.RAZORPAY_KEY_SECRET;
  const prevWebhook = process.env.RAZORPAY_WEBHOOK_SECRET;
  process.env.RAZORPAY_KEY_ID = '';
  process.env.RAZORPAY_KEY_SECRET = '';
  process.env.RAZORPAY_WEBHOOK_SECRET = '';
  try {
    const status = getRazorpayConfigStatus();
    assert.equal(status.configured, false);
    assert.equal(status.webhookConfigured, false);
    assert.equal(status.statusLabel, 'PENDING CONFIGURATION');
    assert.equal(status.webhookStatusLabel, 'PENDING CONFIGURATION');
    assert.equal(status.webhookPath, '/api/webhooks/razorpay');
  } finally {
    if (prevKeyId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prevKeyId;
    if (prevKeySecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prevKeySecret;
    if (prevWebhook === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = prevWebhook;
  }
});

test('createAndDispatchOtp refuses to generate insecure fake sandbox OTPs when unconfigured', async () => {
  const prevSmsUrl = process.env.SMS_PROVIDER_URL;
  const prevSmsKey = process.env.SMS_API_KEY;
  delete process.env.SMS_PROVIDER_URL;
  delete process.env.SMS_API_KEY;

  try {
    const res = await createAndDispatchOtp('+919847112233');
    assert.equal(res.sent, false);
    assert.equal(res.pendingConfiguration, true);
    assert.equal(res.deliveryMode, 'pending_configuration');
    assert.equal('devOtpCode' in res, false);
  } finally {
    if (prevSmsUrl !== undefined) process.env.SMS_PROVIDER_URL = prevSmsUrl;
    if (prevSmsKey !== undefined) process.env.SMS_API_KEY = prevSmsKey;
  }
});

test('verifyOtpChallenge never authenticates unverified phone numbers when unconfigured', () => {
  const prevSmsUrl = process.env.SMS_PROVIDER_URL;
  const prevSmsKey = process.env.SMS_API_KEY;
  delete process.env.SMS_PROVIDER_URL;
  delete process.env.SMS_API_KEY;

  try {
    const check = verifyOtpChallenge('+919847112233', '123456');
    assert.equal(check.valid, false);
    assert.equal(check.pendingConfiguration, true);
    assert.match(check.reason || '', /pending configuration/i);
  } finally {
    if (prevSmsUrl !== undefined) process.env.SMS_PROVIDER_URL = prevSmsUrl;
    if (prevSmsKey !== undefined) process.env.SMS_API_KEY = prevSmsKey;
  }
});

test('resolveAndLinkFirebaseUser creates customer profile for new Google user and preserves profileCompleted for returning user', () => {
  const db = createInitialSeedState();

  const firstSignIn = resolveAndLinkFirebaseUser(
    db,
    {
      uid: 'fb-uid-new-1',
      email: 'newcustomer@example.com',
      emailVerified: true,
      name: 'Neha Krishnan',
      picture: 'https://example.com/photo.jpg',
      signInProvider: 'google.com',
    },
    { privacyAccepted: true, nowIso: '2026-11-16T00:00:00.000Z' }
  );

  assert.equal(firstSignIn.isNewUser, true);
  assert.equal(firstSignIn.linkedExistingAccount, false);
  assert.equal(firstSignIn.user.id, 'fb-uid-new-1');
  assert.equal(firstSignIn.user.firebaseUid, 'fb-uid-new-1');
  assert.equal(firstSignIn.user.role, 'customer');
  assert.equal(firstSignIn.user.emailVerified, true);
  assert.equal(firstSignIn.user.authProvider, 'firebase_google');
  assert.deepEqual(firstSignIn.user.linkedProviders, ['firebase_google']);
  assert.equal(firstSignIn.user.profileCompleted, false);

  // Simulate customer completing onboarding profile (without changing Google UID)
  firstSignIn.user.profileCompleted = true;
  firstSignIn.user.contactPhone = '+919847001122';

  // Simulate returning sign-in without phone_number on Google token
  const secondSignIn = resolveAndLinkFirebaseUser(db, {
    uid: 'fb-uid-new-1',
    email: 'newcustomer@example.com',
    emailVerified: true,
    name: 'Neha Krishnan',
    signInProvider: 'google.com',
  });

  assert.equal(secondSignIn.isNewUser, false);
  assert.equal(secondSignIn.user.profileCompleted, true);
  assert.equal(secondSignIn.user.contactPhone, '+919847001122');
});

test('resolveAndLinkFirebaseUser safely links existing account when verified email matches and preserves role & rewards', () => {
  const db = createInitialSeedState();
  const seededVendorOwner = db.users.find((u) => u.email === 'rasheed@malabarspice.in');
  assert.ok(seededVendorOwner);
  assert.equal(seededVendorOwner.firebaseUid, undefined);

  const res = resolveAndLinkFirebaseUser(db, {
    uid: 'fb-uid-vendor-google',
    email: 'RASHEED@malabarspice.in',
    emailVerified: true,
    name: 'Malabar Spice Kitchen',
    signInProvider: 'google.com',
  });

  assert.equal(res.isNewUser, false);
  assert.equal(res.linkedExistingAccount, true);
  assert.equal(res.user.id, seededVendorOwner.id);
  assert.equal(res.user.role, seededVendorOwner.role);
  assert.equal(res.user.vendorId, seededVendorOwner.vendorId);
  assert.equal(res.user.firebaseUid, 'fb-uid-vendor-google');
  assert.equal(res.user.emailVerified, true);
  assert.equal(res.user.profileCompleted, true);
  assert.ok(res.user.linkedProviders?.includes('firebase_google'));

  // A different Google UID claiming the same email must be rejected safely
  assert.throws(
    () =>
      resolveAndLinkFirebaseUser(db, {
        uid: 'fb-uid-attacker-999',
        email: 'rasheed@malabarspice.in',
        emailVerified: true,
        signInProvider: 'google.com',
      }),
    /ACCOUNT_LINK_CONFLICT/
  );
});

test('resolveAndLinkFirebaseUser blocks unverified email hijacking and suspended accounts', () => {
  const db = createInitialSeedState();
  const existingCustomer = db.users.find((u) => u.id === 'usr-cust-1');
  assert.ok(existingCustomer?.email);

  assert.throws(
    () =>
      resolveAndLinkFirebaseUser(db, {
        uid: 'fb-uid-unverified',
        email: existingCustomer.email,
        emailVerified: false,
        signInProvider: 'google.com',
      }),
    /ACCOUNT_EMAIL_UNVERIFIED_CONFLICT/
  );

  existingCustomer.accountStatus = 'suspended';
  assert.throws(
    () =>
      resolveAndLinkFirebaseUser(db, {
        uid: 'fb-uid-cust',
        email: existingCustomer.email,
        emailVerified: true,
        signInProvider: 'google.com',
      }),
    /ACCOUNT_SUSPENDED/
  );
});

test('resolveAndLinkFirebaseUser hydrates returning user profile from Firestore without trusting privileged fields', () => {
  const db = createInitialSeedState();

  const res = resolveAndLinkFirebaseUser(
    db,
    {
      uid: 'fb-uid-returning-fs',
      email: 'returning@example.com',
      emailVerified: true,
      name: 'Returning User',
      signInProvider: 'google.com',
    },
    {
      firestoreProfile: {
        fullName: 'Returning Vadakara User',
        contactPhone: '+919847556677',
        preferredLanguage: 'ml',
        profileCompleted: true,
      },
    }
  );

  assert.equal(res.user.role, 'customer');
  assert.equal(res.user.profileCompleted, true);
  assert.equal(res.user.contactPhone, '+919847556677');
  assert.equal(res.user.preferredLanguage, 'ml');
  assert.equal(res.user.loyaltyPoints, 50);
});

test('getSessionCookieOptions adapts SameSite/Secure for HTTP localhost vs HTTPS iframe/Vercel proxy', () => {
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development';
    const localOpts = getSessionCookieOptions({
      secure: false,
      headers: {},
    } as never);
    assert.equal(localOpts.httpOnly, true);
    assert.equal(localOpts.sameSite, 'lax');
    assert.equal(localOpts.secure, false);

    const iframeProxyOpts = getSessionCookieOptions({
      secure: false,
      headers: { 'x-forwarded-proto': 'https' },
    } as never);
    assert.equal(iframeProxyOpts.httpOnly, true);
    assert.equal(iframeProxyOpts.sameSite, 'none');
    assert.equal(iframeProxyOpts.secure, true);
  } finally {
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  }
});

test('signSessionToken and verifySessionToken round-trip and reject tampered tokens', () => {
  const token = signSessionToken({ id: 'usr-cust-1', role: 'customer' });
  const verified = verifySessionToken(token);
  assert.ok(verified);
  assert.equal(verified.userId, 'usr-cust-1');
  assert.equal(verified.role, 'customer');

  assert.equal(verifySessionToken(`${token}tampered`), null);
});
