import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isEnvFlagTrue,
  isGoogleMapsIntegrationEnabled,
  isValidSixDigitOtp,
  normalizeIndianMobileE164,
  resolvePhoneAuthStatus,
} from './authConfig.ts';

test('resolvePhoneAuthStatus defaults to pending_configuration when unconfigured', () => {
  const status = resolvePhoneAuthStatus({
    firebasePhoneEnabled: false,
    smsGatewayConfigured: false,
  });
  assert.equal(status.configured, false);
  assert.equal(status.provider, 'pending_configuration');
  assert.equal(status.statusLabel, 'PENDING CONFIGURATION');
});

test('resolvePhoneAuthStatus activates firebase_phone when enabled', () => {
  const status = resolvePhoneAuthStatus({
    firebasePhoneEnabled: true,
    smsGatewayConfigured: false,
  });
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'firebase_phone');
  assert.equal(status.statusLabel, 'Firebase Phone Auth Enabled');
  assert.match(status.message, /Firebase Console/);
});

test('resolvePhoneAuthStatus activates sms_gateway when SMS credentials are configured', () => {
  const status = resolvePhoneAuthStatus({
    firebasePhoneEnabled: false,
    smsGatewayConfigured: true,
  });
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'sms_gateway');
});

test('isEnvFlagTrue treats empty or whitespace strings safely as false', () => {
  assert.equal(isEnvFlagTrue(undefined), false);
  assert.equal(isEnvFlagTrue(''), false);
  assert.equal(isEnvFlagTrue('false'), false);
  assert.equal(isEnvFlagTrue('TRUE'), true);
  assert.equal(isEnvFlagTrue(' true '), true);
});

test('isGoogleMapsIntegrationEnabled keeps Google Maps disabled until both API key and enable flag are set', () => {
  assert.equal(isGoogleMapsIntegrationEnabled({ flagEnabled: false, apiKeyPresent: true }), false);
  assert.equal(isGoogleMapsIntegrationEnabled({ flagEnabled: true, apiKeyPresent: false }), false);
  assert.equal(isGoogleMapsIntegrationEnabled({ flagEnabled: true, apiKeyPresent: true }), true);
});

test('normalizeIndianMobileE164 validates +91 10-digit numbers starting with 6-9', () => {
  assert.equal(normalizeIndianMobileE164('9847112233'), '+919847112233');
  assert.equal(normalizeIndianMobileE164('+91 98471 12233'), '+919847112233');
  assert.equal(normalizeIndianMobileE164('1234567890'), null);
  assert.equal(normalizeIndianMobileE164('98471122'), null);
});

test('isValidSixDigitOtp validates strict 6-digit numeric OTP codes', () => {
  assert.equal(isValidSixDigitOtp('482910'), true);
  assert.equal(isValidSixDigitOtp(' 482910 '), true);
  assert.equal(isValidSixDigitOtp('12345'), false);
  assert.equal(isValidSixDigitOtp('12ab56'), false);
});
