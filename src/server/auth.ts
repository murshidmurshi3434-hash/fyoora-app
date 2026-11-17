import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth as getFirebaseAdminAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };
import {
  isEnvFlagTrue,
  normalizeIndianMobileE164,
  resolvePhoneAuthStatus,
  type AuthRuntimeStatus,
} from '../shared/authConfig.ts';
import type { UserProfile, UserRole } from '../shared/types.ts';
import { getDb, withTransaction } from './store.ts';

if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const adminAuth = getFirebaseAdminAuth();

const SESSION_SECRET = (() => {
  const configured = process.env.SESSION_SECRET?.trim();
  const isPlaceholder = /^(change[-_ ]?me|your[-_ ]|my[-_ ]|replace[-_ ]?me)/i.test(configured || '');
  if (configured && configured.length >= 32 && !isPlaceholder) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Set SESSION_SECRET to a unique random value of at least 32 characters before production startup.');
  }
  return crypto.randomBytes(32).toString('hex');
})();

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 4;

interface OtpChallenge {
  phone: string;
  otpHash: string;
  expiresAt: number;
  lastSentAt: number;
  attemptsLeft: number;
}

const otpStore = new Map<string, OtpChallenge>();

export function normalizeIndianPhone(raw: string): string | null {
  return normalizeIndianMobileE164(raw);
}

export function isSmsGatewayConfigured(): boolean {
  return Boolean(process.env.SMS_PROVIDER_URL?.trim() && process.env.SMS_API_KEY?.trim());
}

export function isFirebasePhoneAuthEnabled(): boolean {
  return (
    isEnvFlagTrue(process.env.FIREBASE_PHONE_AUTH_ENABLED) ||
    isEnvFlagTrue(process.env.VITE_ENABLE_FIREBASE_PHONE_AUTH)
  );
}

export function isDevRoleSwitchEnabled(): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  return (
    isEnvFlagTrue(process.env.ENABLE_DEV_ROLE_SWITCH) ||
    isEnvFlagTrue(process.env.ENABLE_DEV_ROLE_SWITCHER)
  );
}

export function getAuthConfigurationStatus(): AuthRuntimeStatus {
  return {
    googleAuthConfigured: true,
    phoneAuth: resolvePhoneAuthStatus({
      firebasePhoneEnabled: isFirebasePhoneAuthEnabled(),
      smsGatewayConfigured: isSmsGatewayConfigured(),
    }),
    devRoleSwitcherEnabled: isDevRoleSwitchEnabled(),
  };
}

function hashOtp(phone: string, otp: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(`${phone}:${otp}`).digest('hex');
}

export async function createAndDispatchOtp(phone: string): Promise<{
  sent: boolean;
  pendingConfiguration?: boolean;
  cooldownRemainingSec?: number;
  deliveryMode: 'sms_gateway' | 'pending_configuration';
  expiresInSec: number;
}> {
  if (!isSmsGatewayConfigured()) {
    return {
      sent: false,
      pendingConfiguration: true,
      deliveryMode: 'pending_configuration',
      expiresInSec: 0,
    };
  }

  const now = Date.now();
  const existing = otpStore.get(phone);
  if (existing && now - existing.lastSentAt < OTP_COOLDOWN_MS) {
    const cooldownRemainingSec = Math.ceil((OTP_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
    return {
      sent: false,
      cooldownRemainingSec,
      deliveryMode: 'sms_gateway',
      expiresInSec: Math.max(0, Math.ceil((existing.expiresAt - now) / 1000)),
    };
  }

  const otp = String(crypto.randomInt(100000, 999999));
  otpStore.set(phone, {
    phone,
    otpHash: hashOtp(phone, otp),
    expiresAt: now + OTP_TTL_MS,
    lastSentAt: now,
    attemptsLeft: OTP_MAX_ATTEMPTS,
  });

  try {
    const resp = await fetch(process.env.SMS_PROVIDER_URL!.trim(), {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SMS_API_KEY!.trim()}`,
      },
      body: JSON.stringify({
        to: phone,
        message: `Your FYOORA verification OTP is ${otp}. Valid for 5 minutes.`,
      }),
    });
    if (!resp.ok) {
      throw new Error(`SMS provider returned HTTP ${resp.status}`);
    }
    return {
      sent: true,
      deliveryMode: 'sms_gateway',
      expiresInSec: OTP_TTL_MS / 1000,
    };
  } catch (err) {
    otpStore.delete(phone);
    console.error('External SMS gateway error:', err);
    throw new Error('Failed to dispatch SMS via configured gateway.');
  }
}

export function verifyOtpChallenge(
  phone: string,
  otpInput: string
): { valid: boolean; pendingConfiguration?: boolean; reason?: string } {
  if (!isSmsGatewayConfigured()) {
    return {
      valid: false,
      pendingConfiguration: true,
      reason: 'Phone OTP authentication is pending configuration.',
    };
  }

  const challenge = otpStore.get(phone);
  if (!challenge) {
    return { valid: false, reason: 'No active OTP challenge found. Please request a new OTP.' };
  }
  if (Date.now() > challenge.expiresAt) {
    otpStore.delete(phone);
    return { valid: false, reason: 'OTP has expired. Please request a fresh OTP.' };
  }
  if (challenge.attemptsLeft <= 0) {
    otpStore.delete(phone);
    return { valid: false, reason: 'Maximum verification attempts exceeded. Please request a new OTP.' };
  }

  const candidateHash = hashOtp(phone, otpInput.trim());
  const match = crypto.timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(challenge.otpHash, 'hex')
  );

  if (!match) {
    challenge.attemptsLeft -= 1;
    return {
      valid: false,
      reason:
        challenge.attemptsLeft > 0
          ? `Invalid OTP. ${challenge.attemptsLeft} attempt(s) remaining.`
          : 'Invalid OTP. Maximum attempts reached; request a new OTP.',
    };
  }

  otpStore.delete(phone);
  return { valid: true };
}

export interface SessionPayload {
  userId: string;
  role: UserRole;
  exp: number;
}

export function signSessionToken(user: Pick<UserProfile, 'id' | 'role'>): string {
  const payload: SessionPayload = {
    userId: user.id,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as SessionPayload;
    if (!decoded.userId || Date.now() > decoded.exp) return null;
    return decoded;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: UserProfile;
}

export function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieToken = req.cookies?.fyoora_session as string | undefined;
  return cookieToken || null;
}

export function attachOptionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (token) {
    const payload = verifySessionToken(token);
    if (payload) {
      const user = getDb().users.find((u) => u.id === payload.userId && u.accountStatus !== 'suspended');
      if (user) {
        req.authUser = user;
      }
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
  const user = getDb().users.find((u) => u.id === payload.userId);
  if (!user) {
    return res.status(401).json({ error: 'User account not found.' });
  }
  if (user.accountStatus === 'suspended') {
    return res.status(403).json({ error: 'Account has been suspended by administration.' });
  }
  req.authUser = user;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.authUser.role) && req.authUser.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: insufficient role permissions for this resource.' });
    }
    next();
  };
}

export function getSessionCookieOptions(req?: Request) {
  const forwardedProto = String(req?.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const isHttps = Boolean(
    req?.secure || forwardedProto === 'https' || process.env.NODE_ENV === 'production'
  );
  return {
    httpOnly: true,
    sameSite: (isHttps ? 'none' : 'lax') as 'none' | 'lax',
    secure: isHttps,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string, req?: Request) {
  res.cookie('fyoora_session', token, {
    ...getSessionCookieOptions(req),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(res: Response, req?: Request) {
  res.clearCookie('fyoora_session', getSessionCookieOptions(req));
}

export interface DecodedFirebaseTokenInput {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  phoneNumber?: string;
  signInProvider?: string;
}

export interface ServerFirestoreHydrationInput {
  fullName?: string;
  contactPhone?: string;
  contactPhoneVerified?: boolean;
  preferredLanguage?: 'en' | 'ml';
  profileImage?: string;
  addresses?: UserProfile['addresses'];
  favourites?: string[];
  privacyAcceptedAt?: string;
  profileCompleted?: boolean;
  referralCode?: string;
}

type ProviderTag = NonNullable<UserProfile['authProvider']>;

function mergeLinkedProviders(
  existingProviders: UserProfile['linkedProviders'],
  existingPrimary: UserProfile['authProvider'],
  newProvider: ProviderTag
): ProviderTag[] {
  const set = new Set<ProviderTag>();
  if (Array.isArray(existingProviders)) {
    for (const item of existingProviders) set.add(item);
  }
  if (existingPrimary) set.add(existingPrimary);
  set.add(newProvider);
  return Array.from(set);
}

export function resolveAndLinkFirebaseUser(
  db: ReturnType<typeof getDb>,
  decoded: DecodedFirebaseTokenInput,
  options?: {
    privacyAccepted?: boolean;
    firestoreProfile?: ServerFirestoreHydrationInput | null;
    nowIso?: string;
  }
): { user: UserProfile; isNewUser: boolean; linkedExistingAccount: boolean } {
  const email = (decoded.email || '').trim();
  const name = (decoded.name || '').trim();
  const verifiedPhone = (decoded.phoneNumber || '').trim();
  const signInProvider = decoded.signInProvider || 'google.com';
  const isPhoneAuth = signInProvider === 'phone' || Boolean(verifiedPhone && !email);
  const providerTag: ProviderTag = isPhoneAuth ? 'firebase_phone' : 'firebase_google';
  const emailVerified = Boolean(decoded.emailVerified);
  const now = options?.nowIso || new Date().toISOString();
  const fsProfile = options?.firestoreProfile || null;

  if (isPhoneAuth && !verifiedPhone) {
    throw new Error('Firebase Phone Auth token is missing a verified phone_number.');
  }

  const isBootstrapAdmin = email.toLowerCase() === 'mtechmini@gmail.com' && emailVerified;

  const byUid = db.users.find((u) => u.id === decoded.uid || u.firebaseUid === decoded.uid);
  const byPhone = verifiedPhone
    ? db.users.find((u) => u.phone === verifiedPhone || u.contactPhone === verifiedPhone)
    : undefined;
  const byEmail = email
    ? db.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    : undefined;

  if (!byUid && !byPhone && byEmail) {
    if (!emailVerified) {
      throw new Error('ACCOUNT_EMAIL_UNVERIFIED_CONFLICT');
    }
    if (byEmail.firebaseUid && byEmail.firebaseUid !== decoded.uid) {
      throw new Error('ACCOUNT_LINK_CONFLICT');
    }
  }

  let user = byUid || byPhone || (emailVerified ? byEmail : undefined);

  if (user && user.accountStatus === 'suspended') {
    throw new Error('ACCOUNT_SUSPENDED');
  }

  if (!user) {
    if (isPhoneAuth && options?.privacyAccepted === false) {
      throw new Error('PRIVACY_REQUIRED');
    }

    const hydratedPhone = fsProfile?.contactPhone ? normalizeIndianPhone(fsProfile.contactPhone) || undefined : undefined;
    const hydratedName = (fsProfile?.fullName || '').trim() || name || (isBootstrapAdmin ? 'FYOORA Admin' : '');
    const hydratedAddresses =
      Array.isArray(fsProfile?.addresses) && fsProfile.addresses.length > 0
        ? fsProfile.addresses
        : [
            {
              id: `addr-${Date.now()}`,
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
          ];

    const profileCompleted = Boolean(
      fsProfile?.profileCompleted ||
        (isBootstrapAdmin && Boolean(hydratedName)) ||
        (verifiedPhone && Boolean(hydratedName))
    );

    user = {
      id: decoded.uid,
      firebaseUid: decoded.uid,
      phone: verifiedPhone || '',
      contactPhone: verifiedPhone || hydratedPhone,
      contactPhoneVerified: Boolean(verifiedPhone),
      fullName: hydratedName,
      email: email || undefined,
      emailVerified,
      profileImage: decoded.picture || fsProfile?.profileImage,
      preferredLanguage: fsProfile?.preferredLanguage === 'ml' ? 'ml' : 'en',
      role: isBootstrapAdmin ? 'super_admin' : 'customer',
      addresses: hydratedAddresses,
      favourites: Array.isArray(fsProfile?.favourites) ? fsProfile.favourites : [],
      privacyAcceptedAt: fsProfile?.privacyAcceptedAt || now,
      profileCompleted,
      accountStatus: 'active',
      loyaltyPoints: 50,
      referralCode: fsProfile?.referralCode || `FYR${crypto.randomInt(1000, 9999)}`,
      phoneVerified: Boolean(verifiedPhone),
      authProvider: providerTag,
      linkedProviders: [providerTag],
      createdAt: now,
    };
    db.users.push(user);
    db.notifications.push({
      id: `ntf-${Date.now()}`,
      userId: user.id,
      title: 'Welcome to FYOORA Vadakara',
      body: '50 welcome loyalty points credited. Use VADAKARA50 on your first order.',
      category: 'promo',
      read: false,
      createdAt: now,
    });
    return { user, isNewUser: true, linkedExistingAccount: false };
  }

  const linkedExistingAccount = Boolean(!byUid && ((verifiedPhone && byPhone) || (emailVerified && byEmail)));

  if (!user.firebaseUid) {
    user.firebaseUid = decoded.uid;
  }
  if (email) {
    if (!user.email) {
      user.email = email;
    }
    if (emailVerified && user.email.toLowerCase() === email.toLowerCase()) {
      user.emailVerified = true;
    }
  }
  if (!user.profileImage && (decoded.picture || fsProfile?.profileImage)) {
    user.profileImage = decoded.picture || fsProfile?.profileImage;
  }
  if (!user.fullName && ((fsProfile?.fullName || '').trim() || name)) {
    user.fullName = (fsProfile?.fullName || '').trim() || name;
  }

  user.linkedProviders = mergeLinkedProviders(user.linkedProviders, user.authProvider, providerTag);
  if (!user.authProvider) {
    user.authProvider = providerTag;
  }

  if (isPhoneAuth && verifiedPhone && !user.phoneVerified) {
    user.phone = verifiedPhone;
    user.phoneVerified = true;
  }
  if (verifiedPhone && !user.contactPhone) {
    user.contactPhone = verifiedPhone;
    user.contactPhoneVerified = true;
  }
  if (!user.contactPhone && user.phone && user.phone !== '+910000000000') {
    user.contactPhone = user.phone;
    user.contactPhoneVerified = Boolean(user.phoneVerified);
  }
  if (!user.contactPhone && fsProfile?.contactPhone) {
    const hydratedPhone = normalizeIndianPhone(fsProfile.contactPhone);
    if (hydratedPhone) user.contactPhone = hydratedPhone;
  }
  if (user.phone === '+910000000000') {
    user.phone = '';
  }

  if (fsProfile?.addresses?.length && user.addresses.length === 0) {
    user.addresses = fsProfile.addresses;
  }
  if (fsProfile?.favourites?.length && user.favourites.length === 0) {
    user.favourites = fsProfile.favourites;
  }
  if (fsProfile?.profileCompleted && !user.profileCompleted) {
    user.profileCompleted = true;
  }

  if (isBootstrapAdmin) {
    user.role = 'super_admin';
    if (!user.fullName) user.fullName = name || 'FYOORA Admin';
    user.profileCompleted = true;
  }

  return { user, isNewUser: false, linkedExistingAccount };
}

export async function verifyFirebaseIdTokenSignIn(
  idToken: string,
  options?: { privacyAccepted?: boolean; firestoreProfile?: ServerFirestoreHydrationInput | null }
): Promise<{ user: UserProfile; isNewUser: boolean; linkedExistingAccount: boolean }> {
  const decoded = await adminAuth.verifyIdToken(idToken);
  return withTransaction((db) =>
    resolveAndLinkFirebaseUser(
      db,
      {
        uid: decoded.uid,
        email: decoded.email,
        emailVerified: decoded.email_verified,
        name: decoded.name,
        picture: decoded.picture,
        phoneNumber: decoded.phone_number,
        signInProvider: decoded.firebase?.sign_in_provider,
      },
      options
    )
  );
}

export async function verifyFirebaseGoogleSignIn(idToken: string): Promise<UserProfile> {
  const { user } = await verifyFirebaseIdTokenSignIn(idToken);
  return user;
}
