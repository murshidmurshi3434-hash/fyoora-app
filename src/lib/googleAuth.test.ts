import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFirestoreCustomerProfileDoc,
  classifyGoogleAuthError,
  extractFirestoreHydrationProfile,
} from './googleAuthCore.ts';
import type { UserProfile } from '../shared/types.ts';

test('classifyGoogleAuthError handles popup cancellation cleanly without raw Firebase prefixes', () => {
  const closed = classifyGoogleAuthError({ code: 'auth/popup-closed-by-user', message: 'Firebase: Error (auth/popup-closed-by-user).' });
  assert.equal(closed.kind, 'cancelled');
  assert.equal(closed.shouldFallbackToRedirect, false);
  assert.match(closed.userMessage, /cancelled/i);
  assert.doesNotMatch(closed.userMessage, /Firebase: Error/i);

  const cancelledReq = classifyGoogleAuthError({ code: 'auth/cancelled-popup-request' });
  assert.equal(cancelledReq.kind, 'cancelled');
  assert.equal(cancelledReq.shouldFallbackToRedirect, false);
});

test('classifyGoogleAuthError triggers redirect fallback when browser blocks popup or environment disallows popups', () => {
  const blocked = classifyGoogleAuthError({ code: 'auth/popup-blocked' });
  assert.equal(blocked.kind, 'popup_fallback');
  assert.equal(blocked.shouldFallbackToRedirect, true);

  const unsupported = classifyGoogleAuthError({ code: 'auth/operation-not-supported-in-this-environment' });
  assert.equal(unsupported.kind, 'popup_fallback');
  assert.equal(unsupported.shouldFallbackToRedirect, true);

  const webStorage = classifyGoogleAuthError({ code: 'auth/web-storage-unsupported' });
  assert.equal(webStorage.kind, 'popup_fallback');
  assert.equal(webStorage.shouldFallbackToRedirect, true);
});

test('classifyGoogleAuthError surfaces account linking conflict, unauthorized domain with hostname, and network errors clearly', () => {
  const conflict = classifyGoogleAuthError({ code: 'auth/account-exists-with-different-credential' });
  assert.equal(conflict.kind, 'account_conflict');
  assert.equal(conflict.shouldFallbackToRedirect, false);
  assert.match(conflict.userMessage, /already exists/i);

  const domain = classifyGoogleAuthError(
    { code: 'auth/unauthorized-domain' },
    { hostname: 'fyoora.vercel.app' }
  );
  assert.equal(domain.kind, 'unauthorized_domain');
  assert.match(domain.userMessage, /fyoora\.vercel\.app/i);

  const expired = classifyGoogleAuthError({ code: 'auth/id-token-expired' });
  assert.match(expired.userMessage, /expired/i);

  const net = classifyGoogleAuthError({ code: 'auth/network-request-failed' });
  assert.equal(net.kind, 'network');

  const badKey = classifyGoogleAuthError({ code: 'auth/api-key-not-valid.-please-pass-a-valid-api-key.' });
  assert.equal(badKey.kind, 'unauthorized_domain');
  assert.match(badKey.userMessage, /API key is invalid/i);

  const disabledProvider = classifyGoogleAuthError({ code: 'auth/operation-not-allowed' });
  assert.match(disabledProvider.userMessage, /not enabled/i);
});

test('buildFirestoreCustomerProfileDoc generates valid schema for new Google users without empty-name or undefined violations', () => {
  const user: UserProfile = {
    id: 'uid-google-123',
    phone: '',
    fullName: '',
    email: 'amina@example.com',
    emailVerified: true,
    preferredLanguage: 'en',
    role: 'customer',
    addresses: [],
    favourites: ['vnd-1'],
    profileCompleted: false,
    accountStatus: 'active',
    loyaltyPoints: 50,
    referralCode: 'FYR4821',
    authProvider: 'firebase_google',
    linkedProviders: ['firebase_google'],
    createdAt: '2026-11-16T00:00:00.000Z',
  };

  const doc = buildFirestoreCustomerProfileDoc({
    authUid: 'uid-google-123',
    user,
    existingDoc: null,
    nowIso: '2026-11-16T01:00:00.000Z',
  });

  assert.equal(doc.id, 'uid-google-123');
  assert.equal(doc.appUserId, 'uid-google-123');
  assert.equal(doc.phone, '');
  assert.equal(doc.fullName, 'FYOORA Customer');
  assert.equal(doc.role, 'customer');
  assert.equal(doc.loyaltyPoints, 50);
  assert.equal(doc.createdAt, '2026-11-16T00:00:00.000Z');
  assert.equal(doc.updatedAt, '2026-11-16T01:00:00.000Z');
  assert.deepEqual(doc.linkedProviders, ['firebase_google']);
  assert.equal('contactPhone' in doc, false);
  assert.equal('profileImage' in doc, false);
});

test('buildFirestoreCustomerProfileDoc preserves immutable Firestore fields when updating existing profile', () => {
  const existingDoc = {
    id: 'uid-google-123',
    createdAt: '2026-01-01T00:00:00.000Z',
    role: 'customer',
    loyaltyPoints: 120,
    referralCode: 'FYR9999',
    privacyAcceptedAt: '2026-01-01T00:00:00.000Z',
  };
  const updatedUser: UserProfile = {
    id: 'usr-cust-001',
    phone: '+919847112233',
    contactPhone: '+919847112233',
    fullName: 'Amina K',
    email: 'amina@example.com',
    preferredLanguage: 'ml',
    role: 'customer',
    addresses: [
      {
        id: 'addr-1',
        label: 'Home',
        line1: 'Edodi Road, Vadakara',
        city: 'Vadakara',
        district: 'Kozhikode',
        state: 'Kerala',
        pincode: '673101',
        lat: 11.6085,
        lng: 75.5917,
        isDefault: true,
      },
    ],
    favourites: ['vnd-malabar'],
    profileCompleted: true,
    accountStatus: 'active',
    loyaltyPoints: 999,
    referralCode: 'FYR0001',
    authProvider: 'firebase_google',
    linkedProviders: ['sms_otp', 'firebase_google'],
    createdAt: '2026-11-16T00:00:00.000Z',
  };

  const doc = buildFirestoreCustomerProfileDoc({
    authUid: 'uid-google-123',
    user: updatedUser,
    existingDoc,
    nowIso: '2026-11-16T02:00:00.000Z',
  });

  assert.equal(doc.appUserId, 'usr-cust-001');
  assert.equal(doc.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(doc.loyaltyPoints, 120);
  assert.equal(doc.referralCode, 'FYR9999');
  assert.equal(doc.privacyAcceptedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(doc.profileCompleted, true);
  assert.deepEqual(doc.linkedProviders, ['sms_otp', 'firebase_google']);
});

test('extractFirestoreHydrationProfile strips privileged fields and returns safe customer profile properties', () => {
  const extracted = extractFirestoreHydrationProfile({
    fullName: 'Fathima Nizar',
    contactPhone: '+919847112233',
    preferredLanguage: 'ml',
    profileCompleted: true,
    role: 'super_admin',
    loyaltyPoints: 99999,
    accountStatus: 'suspended',
    addresses: [
      {
        id: 'addr-home',
        label: 'Home',
        line1: 'Link Road, Vadakara',
        city: 'Vadakara',
        district: 'Kozhikode',
        state: 'Kerala',
        pincode: '673101',
        lat: 11.6085,
        lng: 75.5917,
        isDefault: true,
      },
    ],
  });

  assert.ok(extracted);
  assert.equal(extracted.fullName, 'Fathima Nizar');
  assert.equal(extracted.contactPhone, '+919847112233');
  assert.equal(extracted.preferredLanguage, 'ml');
  assert.equal(extracted.profileCompleted, true);
  assert.equal(extracted.addresses?.length, 1);
  assert.equal('role' in extracted, false);
  assert.equal('loyaltyPoints' in extracted, false);
  assert.equal('accountStatus' in extracted, false);
});
