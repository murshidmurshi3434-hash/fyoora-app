import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import {
  normalizeIndianMobileE164,
  resolvePhoneAuthStatus,
  type AuthRuntimeStatus,
  type PhoneAuthStatusInfo,
} from '../shared/authConfig.ts';
import type { UserProfile } from '../shared/types.ts';
import { apiRequest } from './api.ts';
import { auth } from './firebase.ts';

declare global {
  interface Window {
    __fyooraRecaptchaVerifier?: RecaptchaVerifier;
    __fyooraPhoneConfirmation?: ConfirmationResult;
  }
}

export class PhoneAuthPendingError extends Error {
  readonly code = 'PHONE_AUTH_PENDING_CONFIGURATION';
  constructor(message = 'Phone OTP authentication is pending configuration.') {
    super(message);
    this.name = 'PhoneAuthPendingError';
  }
}

export function isClientFirebasePhoneAuthFlagEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_FIREBASE_PHONE_AUTH === 'true';
}

export function getEffectivePhoneAuthStatus(serverAuth?: AuthRuntimeStatus): PhoneAuthStatusInfo {
  if (serverAuth) {
    return serverAuth.phoneAuth;
  }

  return resolvePhoneAuthStatus({
    firebasePhoneEnabled: isClientFirebasePhoneAuthFlagEnabled(),
    smsGatewayConfigured: false,
  });
}

function getOrCreateRecaptchaVerifier(containerId: string): RecaptchaVerifier {
  if (typeof window === 'undefined') {
    throw new Error('Firebase Phone Auth requires a browser environment.');
  }
  if (!window.__fyooraRecaptchaVerifier) {
    window.__fyooraRecaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
  }
  return window.__fyooraRecaptchaVerifier;
}

export function resetPreparedPhoneAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.__fyooraRecaptchaVerifier?.clear();
  } catch {
    // ignore widget cleanup error
  }
  window.__fyooraRecaptchaVerifier = undefined;
  window.__fyooraPhoneConfirmation = undefined;
}

export async function sendPreparedPhoneOtp(params: {
  phoneDigits: string;
  recaptchaContainerId: string;
  serverAuth?: AuthRuntimeStatus;
}): Promise<{ provider: 'firebase_phone' | 'sms_gateway'; phoneE164: string }> {
  const status = getEffectivePhoneAuthStatus(params.serverAuth);
  if (!status.configured) {
    throw new PhoneAuthPendingError(status.message);
  }

  const phoneE164 = normalizeIndianMobileE164(params.phoneDigits);
  if (!phoneE164) {
    throw new Error('Enter a valid 10-digit Indian mobile number starting with 6-9.');
  }

  if (status.provider === 'firebase_phone') {
    const verifier = getOrCreateRecaptchaVerifier(params.recaptchaContainerId);
    const confirmation = await signInWithPhoneNumber(auth, phoneE164, verifier);
    window.__fyooraPhoneConfirmation = confirmation;
    return { provider: 'firebase_phone', phoneE164 };
  }

  await apiRequest('/api/auth/otp/send', {
    method: 'POST',
    json: { phone: phoneE164 },
  });
  return { provider: 'sms_gateway', phoneE164 };
}

export async function confirmPreparedPhoneOtp(params: {
  phoneDigits: string;
  otpCode: string;
  privacyAccepted: boolean;
  serverAuth?: AuthRuntimeStatus;
}): Promise<{ user: UserProfile; token: string; isNewUser: boolean }> {
  const status = getEffectivePhoneAuthStatus(params.serverAuth);
  if (!status.configured) {
    throw new PhoneAuthPendingError(status.message);
  }

  if (!params.privacyAccepted) {
    throw new Error('Please accept the FYOORA Privacy Policy & Terms of Service.');
  }

  const phoneE164 = normalizeIndianMobileE164(params.phoneDigits);
  if (!phoneE164) {
    throw new Error('Enter a valid 10-digit Indian mobile number starting with 6-9.');
  }

  const code = params.otpCode.trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('Please enter the 6-digit OTP.');
  }

  if (status.provider === 'firebase_phone') {
    const confirmation = window.__fyooraPhoneConfirmation;
    if (!confirmation) {
      throw new Error('No active OTP challenge. Please request a new OTP.');
    }
    const credential = await confirmation.confirm(code);
    const idToken = await credential.user.getIdToken();
    const session = await apiRequest<{ user: UserProfile; token: string; isNewUser: boolean }>(
      '/api/auth/firebase',
      {
        method: 'POST',
        json: { idToken, privacyAccepted: params.privacyAccepted },
      }
    );
    window.__fyooraPhoneConfirmation = undefined;
    return session;
  }

  return apiRequest<{ user: UserProfile; token: string; isNewUser: boolean }>(
    '/api/auth/otp/verify',
    {
      method: 'POST',
      json: {
        phone: phoneE164,
        otp: code,
        privacyAccepted: params.privacyAccepted,
      },
    }
  );
}
