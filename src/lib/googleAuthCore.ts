import type { LanguageCode, SavedAddress, UserProfile, UserRole } from '../shared/types.ts';

export type GoogleAuthErrorKind =
  | 'cancelled'
  | 'popup_fallback'
  | 'account_conflict'
  | 'unauthorized_domain'
  | 'network'
  | 'suspended'
  | 'unknown';

export interface ClassifiedGoogleAuthError {
  kind: GoogleAuthErrorKind;
  code?: string;
  shouldFallbackToRedirect: boolean;
  userMessage: string;
}

export interface FirestoreCustomerProfileDoc {
  id: string;
  appUserId: string;
  phone: string;
  contactPhone?: string;
  contactPhoneVerified?: boolean;
  fullName: string;
  email?: string;
  emailVerified?: boolean;
  profileImage?: string;
  preferredLanguage: LanguageCode;
  role: UserRole;
  addresses: SavedAddress[];
  favourites: string[];
  privacyAcceptedAt?: string;
  profileCompleted: boolean;
  accountStatus: 'active' | 'suspended' | 'deletion_requested';
  deletionRequestedAt?: string;
  loyaltyPoints: number;
  referralCode: string;
  phoneVerified?: boolean;
  authProvider?: 'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed';
  linkedProviders?: Array<'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed'>;
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreHydrationProfile {
  fullName?: string;
  contactPhone?: string;
  contactPhoneVerified?: boolean;
  preferredLanguage?: LanguageCode;
  profileImage?: string;
  addresses?: SavedAddress[];
  favourites?: string[];
  privacyAcceptedAt?: string;
  profileCompleted?: boolean;
  referralCode?: string;
}

function extractFirebaseErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code.toLowerCase();
  }
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = msg.match(/auth\/[a-z0-9._-]+/i);
  return match ? match[0].toLowerCase() : undefined;
}

export function classifyGoogleAuthError(
  error: unknown,
  options?: { hostname?: string }
): ClassifiedGoogleAuthError {
  const code = extractFirebaseErrorCode(error);
  const rawMessage = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const hostname =
    options?.hostname ||
    (typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : '');

  if (
    code === 'auth/popup-blocked' ||
    code === 'auth/operation-not-supported-in-this-environment' ||
    code === 'auth/web-storage-unsupported'
  ) {
    return {
      kind: 'popup_fallback',
      code,
      shouldFallbackToRedirect: true,
      userMessage: 'Pop-up sign-in was blocked by your browser. Redirecting to Google Sign-In...',
    };
  }

  if (
    code === 'auth/popup-closed-by-user' ||
    code === 'auth/cancelled-popup-request' ||
    code === 'auth/redirect-cancelled-by-user'
  ) {
    return {
      kind: 'cancelled',
      code,
      shouldFallbackToRedirect: false,
      userMessage: 'Google sign-in was cancelled. You can try again anytime or browse as a guest.',
    };
  }

  if (code === 'auth/redirect-operation-pending') {
    return {
      kind: 'cancelled',
      code,
      shouldFallbackToRedirect: false,
      userMessage: 'A Google sign-in attempt is already in progress. Please complete it or try again.',
    };
  }

  if (
    code === 'auth/invalid-api-key' ||
    code?.startsWith('auth/api-key-not-valid') ||
    /api[_ ]key[_ ]not[_ ]valid|api_key_invalid/i.test(rawMessage)
  ) {
    return {
      kind: 'unauthorized_domain',
      code: code || 'auth/invalid-api-key',
      shouldFallbackToRedirect: false,
      userMessage:
        'Firebase API key is invalid or not configured for this project. Update firebase-applet-config.json with a valid Firebase Web API key.',
    };
  }

  if (code === 'auth/operation-not-allowed') {
    return {
      kind: 'unauthorized_domain',
      code,
      shouldFallbackToRedirect: false,
      userMessage:
        'Google Sign-In provider is not enabled in Firebase Authentication. Enable Google in Firebase Console → Authentication → Sign-in method.',
    };
  }

  if (code === 'auth/configuration-not-found') {
    return {
      kind: 'unauthorized_domain',
      code,
      shouldFallbackToRedirect: false,
      userMessage:
        'Firebase Authentication is not initialized for this project yet. Enable Authentication in Firebase Console.',
    };
  }

  if (code === 'auth/account-exists-with-different-credential') {
    return {
      kind: 'account_conflict',
      code,
      shouldFallbackToRedirect: false,
      userMessage:
        'An account with this email already exists using a different sign-in method. Sign in with your original method or contact FYOORA support.',
    };
  }

  if (code === 'auth/unauthorized-domain' || code === 'auth/app-not-authorized') {
    const domainNote = hostname ? ` (${hostname})` : '';
    return {
      kind: 'unauthorized_domain',
      code,
      shouldFallbackToRedirect: false,
      userMessage: `This domain${domainNote} is not authorized in Firebase Authentication settings. Add ${hostname || 'this domain'} under Firebase Console → Authentication → Settings → Authorized domains.`,
    };
  }

  if (code === 'auth/network-request-failed') {
    return {
      kind: 'network',
      code,
      shouldFallbackToRedirect: false,
      userMessage: 'Network error while connecting to Google Sign-In. Check your internet connection and retry.',
    };
  }

  if (code === 'auth/user-disabled') {
    return {
      kind: 'suspended',
      code,
      shouldFallbackToRedirect: false,
      userMessage: 'This Google account has been disabled. Please contact FYOORA support.',
    };
  }

  if (code === 'auth/id-token-expired' || code === 'auth/user-token-expired') {
    return {
      kind: 'unknown',
      code,
      shouldFallbackToRedirect: false,
      userMessage: 'Your Google sign-in session expired. Please click Continue with Google again.',
    };
  }

  if (/suspended/i.test(rawMessage)) {
    return {
      kind: 'suspended',
      code,
      shouldFallbackToRedirect: false,
      userMessage: rawMessage,
    };
  }

  if (/different google account|link accounts|verify your google email/i.test(rawMessage)) {
    return {
      kind: 'account_conflict',
      code,
      shouldFallbackToRedirect: false,
      userMessage: rawMessage,
    };
  }

  if (rawMessage && !/^firebase:/i.test(rawMessage) && !/auth\//i.test(rawMessage)) {
    return {
      kind: 'unknown',
      code,
      shouldFallbackToRedirect: false,
      userMessage: rawMessage,
    };
  }

  return {
    kind: 'unknown',
    code,
    shouldFallbackToRedirect: false,
    userMessage: code
      ? `Google sign-in failed (${code}). Please check Firebase Authentication configuration or browse as a guest.`
      : 'Google sign-in could not be completed. Please try again or browse as a guest.',
  };
}

function clampString(value: unknown, maxLen: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

function sanitizeAddresses(addresses: unknown): SavedAddress[] {
  if (!Array.isArray(addresses)) return [];
  return addresses
    .filter((a): a is SavedAddress => Boolean(a && typeof a === 'object' && typeof (a as SavedAddress).line1 === 'string'))
    .slice(0, 20)
    .map((a, idx) => ({
      id: clampString(a.id, 128) || `addr-${idx + 1}`,
      label: clampString(a.label, 40) || 'Home',
      line1: clampString(a.line1, 200),
      ...(a.landmark ? { landmark: clampString(a.landmark, 120) } : {}),
      city: clampString(a.city, 60) || 'Vadakara',
      district: clampString(a.district, 60) || 'Kozhikode',
      state: clampString(a.state, 60) || 'Kerala',
      pincode: clampString(a.pincode, 12) || '673101',
      lat: Number.isFinite(Number(a.lat)) ? Number(a.lat) : 11.6085,
      lng: Number.isFinite(Number(a.lng)) ? Number(a.lng) : 75.5917,
      isDefault: Boolean(a.isDefault),
    }));
}

function sanitizeFavourites(favourites: unknown): string[] {
  if (!Array.isArray(favourites)) return [];
  return Array.from(
    new Set(
      favourites
        .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 128))
    )
  ).slice(0, 200);
}

const VALID_PROVIDERS = new Set(['firebase_google', 'firebase_phone', 'sms_otp', 'seed']);

function sanitizeLinkedProviders(
  providers: unknown,
  fallback?: UserProfile['authProvider']
): Array<'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed'> {
  const merged = new Set<'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed'>();
  if (Array.isArray(providers)) {
    for (const p of providers) {
      if (typeof p === 'string' && VALID_PROVIDERS.has(p)) {
        merged.add(p as 'firebase_google' | 'firebase_phone' | 'sms_otp' | 'seed');
      }
    }
  }
  if (fallback && VALID_PROVIDERS.has(fallback)) {
    merged.add(fallback);
  }
  return Array.from(merged).slice(0, 10);
}

/**
 * Builds a strict Firestore document conforming to firebase-blueprint.json and firestore.rules
 * (both create rules and non-admin update rules with immutable createdAt/role/loyaltyPoints).
 */
export function buildFirestoreCustomerProfileDoc(params: {
  authUid: string;
  user: UserProfile;
  existingDoc?: Record<string, unknown> | null;
  nowIso?: string;
}): FirestoreCustomerProfileDoc {
  const nowIso = params.nowIso || new Date().toISOString();
  const existing = params.existingDoc || null;
  const user = params.user;

  const existingRole = existing?.role;
  const role: UserRole =
    typeof existingRole === 'string'
      ? (existingRole as UserRole)
      : user.role || 'customer';

  const createdAt =
    typeof existing?.createdAt === 'string' && existing.createdAt
      ? existing.createdAt.slice(0, 64)
      : clampString(user.createdAt, 64) || nowIso;

  const loyaltyPoints =
    typeof existing?.loyaltyPoints === 'number' && Number.isInteger(existing.loyaltyPoints) && existing.loyaltyPoints >= 0
      ? existing.loyaltyPoints
      : Math.max(0, Math.min(50, Math.round(Number(user.loyaltyPoints) || 0)));

  const referralCode =
    typeof existing?.referralCode === 'string' && existing.referralCode
      ? existing.referralCode.slice(0, 24)
      : clampString(user.referralCode, 24) || 'FYR1000';

  const privacyAcceptedAt =
    typeof existing?.privacyAcceptedAt === 'string' && existing.privacyAcceptedAt
      ? existing.privacyAcceptedAt.slice(0, 64)
      : clampString(user.privacyAcceptedAt, 64) || nowIso;

  const fullName =
    clampString(user.fullName, 120) ||
    clampString(existing?.fullName, 120) ||
    'FYOORA Customer';

  const phone = clampString(user.phone, 20);
  const contactPhone = clampString(user.contactPhone, 20);
  const email = clampString(user.email, 160);
  const profileImage = clampString(user.profileImage, 2048);

  const docData: FirestoreCustomerProfileDoc = {
    id: clampString(params.authUid, 128),
    appUserId: clampString(user.id, 128) || clampString(params.authUid, 128),
    phone,
    fullName,
    preferredLanguage: user.preferredLanguage === 'ml' ? 'ml' : 'en',
    role,
    accountStatus: user.accountStatus || 'active',
    addresses: sanitizeAddresses(user.addresses),
    favourites: sanitizeFavourites(user.favourites),
    privacyAcceptedAt,
    profileCompleted: Boolean(user.profileCompleted),
    loyaltyPoints,
    referralCode,
    authProvider: user.authProvider || 'firebase_google',
    linkedProviders: sanitizeLinkedProviders(user.linkedProviders, user.authProvider || 'firebase_google'),
    createdAt,
    updatedAt: nowIso.slice(0, 64),
  };

  if (contactPhone) docData.contactPhone = contactPhone;
  if (typeof user.contactPhoneVerified === 'boolean') docData.contactPhoneVerified = user.contactPhoneVerified;
  if (email) docData.email = email;
  if (typeof user.emailVerified === 'boolean') docData.emailVerified = user.emailVerified;
  if (profileImage) docData.profileImage = profileImage;
  if (typeof user.phoneVerified === 'boolean') docData.phoneVerified = user.phoneVerified;
  if (user.deletionRequestedAt) docData.deletionRequestedAt = clampString(user.deletionRequestedAt, 64);

  return docData;
}

/**
 * Extracts only safe customer profile attributes from Firestore for server-side hydration
 * when the backend store starts fresh. Privileged fields (role, loyaltyPoints, accountStatus)
 * are deliberately excluded.
 */
export function extractFirestoreHydrationProfile(
  existingDoc: Record<string, unknown> | null | undefined
): FirestoreHydrationProfile | null {
  if (!existingDoc || typeof existingDoc !== 'object') return null;

  const fullName = clampString(existingDoc.fullName, 120);
  const contactPhone = clampString(existingDoc.contactPhone, 20);
  const profileImage = clampString(existingDoc.profileImage, 2048);
  const privacyAcceptedAt = clampString(existingDoc.privacyAcceptedAt, 64);
  const referralCode = clampString(existingDoc.referralCode, 24);
  const addresses = sanitizeAddresses(existingDoc.addresses);
  const favourites = sanitizeFavourites(existingDoc.favourites);

  return {
    ...(fullName ? { fullName } : {}),
    ...(contactPhone ? { contactPhone } : {}),
    ...(typeof existingDoc.contactPhoneVerified === 'boolean'
      ? { contactPhoneVerified: existingDoc.contactPhoneVerified }
      : {}),
    ...(existingDoc.preferredLanguage === 'en' || existingDoc.preferredLanguage === 'ml'
      ? { preferredLanguage: existingDoc.preferredLanguage }
      : {}),
    ...(profileImage ? { profileImage } : {}),
    ...(addresses.length > 0 ? { addresses } : {}),
    ...(favourites.length > 0 ? { favourites } : {}),
    ...(privacyAcceptedAt ? { privacyAcceptedAt } : {}),
    ...(typeof existingDoc.profileCompleted === 'boolean'
      ? { profileCompleted: existingDoc.profileCompleted }
      : {}),
    ...(referralCode ? { referralCode } : {}),
  };
}
