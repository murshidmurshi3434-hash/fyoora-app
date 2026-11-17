export type PhoneAuthProviderMode = 'firebase_phone' | 'sms_gateway' | 'pending_configuration';

export interface PhoneAuthStatusInfo {
  configured: boolean;
  provider: PhoneAuthProviderMode;
  statusLabel: string;
  message: string;
}

export interface AuthRuntimeStatus {
  googleAuthConfigured: boolean;
  phoneAuth: PhoneAuthStatusInfo;
  devRoleSwitcherEnabled: boolean;
}

export function normalizeIndianMobileE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) return null;
  return `+91${ten}`;
}

export function isValidSixDigitOtp(raw: string): boolean {
  return /^\d{6}$/.test(raw.trim());
}

export function isEnvFlagTrue(val: string | undefined | null): boolean {
  return typeof val === 'string' && val.trim().toLowerCase() === 'true';
}

export function resolvePhoneAuthStatus(params: {
  firebasePhoneEnabled: boolean;
  smsGatewayConfigured: boolean;
}): PhoneAuthStatusInfo {
  if (params.firebasePhoneEnabled) {
    return {
      configured: true,
      provider: 'firebase_phone',
      statusLabel: 'Firebase Phone Auth Enabled',
      message:
        'Enabled by the server flag. Firebase Phone sign-in, authorized domains, and reCAPTCHA must also be configured in Firebase Console before OTP sign-in will work.',
    };
  }

  if (params.smsGatewayConfigured) {
    return {
      configured: true,
      provider: 'sms_gateway',
      statusLabel: 'SMS OTP Gateway Active',
      message: 'Real +91 SMS OTP verification via configured DLT SMS provider is active.',
    };
  }

  return {
    configured: false,
    provider: 'pending_configuration',
    statusLabel: 'PENDING CONFIGURATION',
    message:
      'Firebase Phone Authentication is prepared in the login flow but currently pending configuration. Enable Phone Sign-In in Firebase Console and set FIREBASE_PHONE_AUTH_ENABLED=true when ready.',
  };
}

export function isGoogleMapsIntegrationEnabled(params: {
  flagEnabled: boolean;
  apiKeyPresent: boolean;
}): boolean {
  return params.flagEnabled && params.apiKeyPresent;
}
