import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Compass,
  Loader2,
  MapPin,
  Play,
  Smartphone,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { StartupIntroOverlay } from './StartupIntroOverlay.tsx';
import { resolvePhoneAuthStatus } from '../shared/authConfig.ts';
import { isValidSixDigitOtp, normalizeIndianMobileE164 } from '../shared/authConfig.ts';
import type { LanguageCode, UserProfile, UserRole } from '../shared/types.ts';

const RECAPTCHA_CONTAINER_ID = 'fyoora-recaptcha-container';

let phoneAuthModulePromise: Promise<typeof import('../lib/phoneAuth.ts')> | undefined;

function loadPhoneAuthModule() {
  phoneAuthModulePromise ??= import('../lib/phoneAuth.ts');
  return phoneAuthModulePromise;
}

const PORTAL_QUICK_ACCOUNTS: { role: UserRole; label: string; sub: string }[] = [
  { role: 'customer', label: 'Customer', sub: 'Fathima Nizar' },
  { role: 'restaurant_owner', label: 'Restaurant', sub: 'Malabar Spice Kitchen' },
  { role: 'bakery_owner', label: 'Bakery', sub: 'Oven & Crumb' },
  { role: 'grocery_owner', label: 'Grocery', sub: 'Vadakara Fresh Mart' },
  { role: 'merchant', label: 'Celebrations & Gifts', sub: 'Party & Florist Hub' },
  { role: 'rider', label: 'Rider App', sub: 'Vishnu Raj' },
  { role: 'super_admin', label: 'Admin', sub: 'Vadakara Ops HQ' },
];

export function IntroAndAuth() {
  const {
    user,
    health,
    setAuthSession,
    enterGuestBrowse,
    switchDevRole,
    logout,
    notify,
    redirectAuthError,
    clearRedirectAuthError,
  } = useApp();

  const [stage, setStage] = useState<'auth' | 'profile'>(() => {
    if (user && !user.profileCompleted) return 'profile';
    return 'auth';
  });
  const [replayingIntro, setReplayingIntro] = useState(false);

  const [phoneDigits, setPhoneDigits] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [privacyAccepted, setPrivacyAccepted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [googleBusyLabel, setGoogleBusyLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [noticeType, setNoticeType] = useState<'error' | 'info'>('error');

  // New user profile onboarding fields
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [email, setEmail] = useState(user?.email || '');
  const [contactPhone, setContactPhone] = useState(user?.contactPhone || (user?.phoneVerified ? user.phone : ''));
  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(user?.preferredLanguage || 'en');
  const [addressLine, setAddressLine] = useState('Edodi Road, Near Municipal Park, Vadakara');
  const [landmark, setLandmark] = useState('Near New Bus Stand');
  const [pincode, setPincode] = useState('673101');

  const phoneAuthStatus = health?.auth?.phoneAuth ?? resolvePhoneAuthStatus({
    firebasePhoneEnabled: false,
    smsGatewayConfigured: false,
  });
  const phoneAuthReady = phoneAuthStatus.configured;
  const devRoleSwitcherEnabled = Boolean(health?.auth?.devRoleSwitcherEnabled);

  useEffect(() => {
    if (user && !user.profileCompleted) {
      setStage('profile');
      setFullName(user.fullName || '');
      setEmail(user.email || '');
      setContactPhone(user.contactPhone || (user.phoneVerified ? user.phone : ''));
    }
  }, [user]);

  useEffect(() => {
    if (redirectAuthError) {
      setNoticeType(/cancelled/i.test(redirectAuthError) ? 'info' : 'error');
      setErrorMsg(redirectAuthError);
      clearRedirectAuthError();
    }
  }, [clearRedirectAuthError, redirectAuthError]);

  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => {
      setResendTimer((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  useEffect(() => {
    return () => {
      if (phoneAuthModulePromise) {
        void phoneAuthModulePromise.then(({ resetPreparedPhoneAuthSession }) => resetPreparedPhoneAuthSession());
      }
    };
  }, []);

  const replayIntro = useCallback(() => {
    setErrorMsg(null);
    setReplayingIntro(true);
  }, []);

  const handleSendOtp = async () => {
    setErrorMsg(null);
    if (!phoneAuthReady) {
      setErrorMsg(phoneAuthStatus.message);
      return;
    }
    if (!normalizeIndianMobileE164(phoneDigits)) {
      setErrorMsg('Enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }
    setBusy(true);
    try {
      const { sendPreparedPhoneOtp } = await loadPhoneAuthModule();
      const res = await sendPreparedPhoneOtp({
        phoneDigits,
        recaptchaContainerId: RECAPTCHA_CONTAINER_ID,
        serverAuth: health?.auth,
      });
      setOtpSent(true);
      setResendTimer(30);
      notify(`OTP sent to ${res.phoneE164}`, 'success');
    } catch (err) {
      if (err instanceof Error && err.name === 'PhoneAuthPendingError') {
        setErrorMsg(err.message);
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to send OTP.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!phoneAuthReady) {
      setErrorMsg(phoneAuthStatus.message);
      return;
    }
    if (!isValidSixDigitOtp(otpCode)) {
      setErrorMsg('Please enter the 6-digit OTP.');
      return;
    }
    if (!privacyAccepted) {
      setErrorMsg('Please accept the FYOORA Privacy Policy & Terms of Service.');
      return;
    }

    setBusy(true);
    try {
      const { confirmPreparedPhoneOtp } = await loadPhoneAuthModule();
      const res = await confirmPreparedPhoneOtp({
        phoneDigits,
        otpCode,
        privacyAccepted,
        serverAuth: health?.auth,
      });
      setAuthSession(res.user, res.token);
      if (!res.user.profileCompleted) {
        setStage('profile');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid or expired OTP.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setNoticeType('error');
    if (!privacyAccepted) {
      setErrorMsg('Please accept the FYOORA Privacy Policy & Terms of Service to continue.');
      return;
    }
    let redirecting = false;
    setBusy(true);
    setGoogleBusyLabel('Connecting to Google...');
    try {
      const {
        signInWithGooglePopupOrRedirect,
        completeFirebaseGoogleLogin,
      } = await import('../lib/googleAuth.ts');

      const initiation = await signInWithGooglePopupOrRedirect(privacyAccepted);
      if (initiation.status === 'redirecting') {
        redirecting = true;
        setGoogleBusyLabel('Redirecting to Google...');
        return;
      }

      setGoogleBusyLabel('Setting up your FYOORA account...');
      const res = await completeFirebaseGoogleLogin({
        firebaseUser: initiation.firebaseUser,
        idToken: initiation.idToken,
        privacyAccepted,
      });

      setAuthSession(res.user, res.token);
      if (!res.user.profileCompleted) {
        setStage('profile');
        notify('Google account verified. Complete your Vadakara delivery details to continue.', 'info');
      } else {
        notify(
          res.linkedExistingAccount
            ? `Account linked & signed in as ${res.user.fullName || 'FYOORA user'}`
            : res.isNewUser
              ? `Welcome to FYOORA, ${res.user.fullName || 'neighbour'}!`
              : `Welcome back, ${res.user.fullName || 'FYOORA user'}`,
          'success'
        );
      }
    } catch (err) {
      const { classifyGoogleAuthError } = await import('../lib/googleAuthCore.ts');
      const classified = classifyGoogleAuthError(err);
      setNoticeType(classified.kind === 'cancelled' ? 'info' : 'error');
      setErrorMsg(classified.userMessage);
    } finally {
      if (!redirecting) {
        setBusy(false);
        setGoogleBusyLabel(null);
      }
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setNoticeType('error');
    if (fullName.trim().length < 2) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    const normalizedContactPhone = normalizeIndianMobileE164(contactPhone);
    if (!normalizedContactPhone) {
      setErrorMsg('Enter a valid 10-digit Indian mobile number starting with 6-9.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/users/profile', {
        method: 'PUT',
        json: {
          fullName: fullName.trim(),
          contactPhone: normalizedContactPhone,
          email: email.trim() || undefined,
          preferredLanguage,
          address: {
            label: 'Home',
            line1: addressLine.trim(),
            landmark: landmark.trim(),
            pincode: pincode.trim() || '673101',
            lat: 11.6085,
            lng: 75.5917,
          },
        },
      });
      void import('../lib/googleAuth.ts').then(({ syncCurrentFirebaseUserProfile }) =>
        syncCurrentFirebaseUserProfile(res.user)
      );
      setAuthSession(res.user);
      notify('Profile completed! Welcome to FYOORA Vadakara.', 'success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setBusy(false);
    }
  };

  if (replayingIntro) {
    return (
      <StartupIntroOverlay
        forceVideo
        onComplete={() => setReplayingIntro(false)}
      />
    );
  }

  if (stage === 'profile' && user) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-md bg-white rounded-3xl border border-neutral-200 p-5 sm:p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <img
              src="/assets/aistudio/fyoora-lockup-red_72717535.png"
              alt="FYOORA"
              className="h-9 object-contain"
            />
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[#E60023]">Step 2 of 2</span>
              <button
                type="button"
                onClick={() => {
                  void logout().then(() => setStage('auth'));
                }}
                className="text-xs font-semibold text-neutral-500 hover:text-[#252525] underline"
              >
                Switch account
              </button>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-[#252525] mb-1">
            Complete your Vadakara profile
          </h1>
          <p className="text-sm text-neutral-500 mb-6">
            Add the details we need to prepare deliveries and contact you about your orders.
          </p>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleCompleteProfile} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Fathima Nizar"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E60023]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Email (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E60023]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Mobile number *</label>
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98765 43210"
                maxLength={16}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E60023]"
              />
              <p className="mt-1.5 text-xs text-neutral-500">
                {user.phoneVerified && normalizeIndianMobileE164(contactPhone) === user.phone
                  ? 'Verified by Firebase.'
                  : 'We’ll use this for order contact. It is not verified by SMS.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Preferred Language</label>
              <div className="grid grid-cols-2 gap-2">
                {(['en', 'ml'] as LanguageCode[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setPreferredLanguage(lang)}
                    className={`py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                      preferredLanguage === lang
                        ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {lang === 'en' ? 'English' : 'മലയാളം (Malayalam)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Primary Delivery Address in Vadakara</label>
              <input
                type="text"
                required
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="House/Flat, Road, Area"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm mb-2 focus:outline-none focus:border-[#E60023]"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Landmark"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E60023]"
                />
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="673101"
                  maxLength={6}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm font-mono focus:outline-none focus:border-[#E60023]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            >
              <span>{busy ? 'Saving Profile...' : 'Continue to FYOORA Vadakara'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white xl:grid xl:grid-cols-12">
      {/* Left Brand Showcase */}
      <div className="hidden xl:flex xl:col-span-6 bg-[#252525] text-white p-8 2xl:p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl mb-10">
            <img
              src="/assets/aistudio/fyoora-lockup-red_72717535.png"
              alt="FYOORA"
              className="h-8 object-contain"
            />
          </div>
          <h1 className="font-display text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight mb-5">
            Everything.
            <br />
            <span className="text-[#E60023]">One place.</span>
          </h1>
          <p className="text-neutral-300 text-base max-w-md leading-relaxed">
            Vadakara&apos;s local super-app connecting Malabar restaurants, fresh groceries, custom bakeries, celebration kits, florists, and instant Pickup &amp; Drop couriers.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-2 gap-4 max-w-lg">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <MapPin className="w-5 h-5 text-[#E60023] mb-2" />
            <div className="font-display font-bold text-sm">Vadakara Launch Zone</div>
            <div className="text-xs text-neutral-400 mt-1">10 km radius · Edodi, Link Road, Nut Street &amp; Ashokapuram</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <Sparkles className="w-5 h-5 text-[#E60023] mb-2" />
            <div className="font-display font-bold text-sm">English &amp; മലയാളം AI</div>
            <div className="text-xs text-neutral-400 mt-1">Live inventory &amp; store-grounded shopping concierge</div>
          </div>
        </div>
      </div>

      {/* Right Auth Panel */}
      <div className="xl:col-span-6 flex flex-col justify-center px-4 py-6 sm:px-8 sm:py-10 max-w-lg mx-auto w-full">
        <div className="flex items-center justify-between gap-3 mb-6">
          <img
            src="/assets/aistudio/fyoora-lockup-red_72717535.png"
            alt="FYOORA"
            className="h-9 object-contain xl:hidden"
          />
          <button
            type="button"
            onClick={replayIntro}
            disabled={busy}
            aria-label="Replay FYOORA intro video"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 hover:border-neutral-300 text-xs font-semibold text-neutral-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] focus-visible:ring-offset-2 disabled:opacity-50"
          >
            <Play className="w-3 h-3 text-[#E60023] fill-[#E60023]" />
            <span>Replay Intro</span>
          </button>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#E60023] mb-1">
            Vadakara · Kozhikode
          </p>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#252525]">
            Welcome to FYOORA
          </h2>
          <p className="text-sm text-neutral-500 mt-1.5">
            Sign in to place orders, or browse the marketplace as a guest.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className={`mb-4 p-3.5 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
              noticeType === 'info'
                ? 'bg-neutral-50 border-neutral-200 text-neutral-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Active Verified Sign-In: Google (Firebase Auth) */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy}
          className="group w-full min-h-12 px-4 py-3.5 rounded-2xl border border-neutral-300 bg-white text-[#1F1F1F] shadow-sm hover:bg-[#FAFAFA] hover:border-neutral-400 hover:shadow font-semibold text-sm flex items-center justify-center gap-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {googleBusyLabel ? (
            <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-[#E60023]" />
          ) : (
            <img
              src="/assets/google-g-logo.png"
              alt=""
              aria-hidden="true"
              className="h-[18px] w-[18px] shrink-0 object-contain transition-transform group-hover:scale-105"
            />
          )}
          <span>{googleBusyLabel || 'Continue with Google'}</span>
        </button>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-neutral-200" />
          <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">Or</span>
          <div className="h-px flex-1 bg-neutral-200" />
        </div>

        {/* Guest Marketplace Browsing (strictly unauthenticated; user remains null) */}
        <button
          type="button"
          onClick={enterGuestBrowse}
          disabled={busy}
          className="group w-full px-4 py-3.5 rounded-2xl border border-neutral-200 bg-[#F8F8FA] hover:bg-[#252525] hover:border-[#252525] text-left flex items-center justify-between gap-3 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E60023] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-white border border-neutral-200 group-hover:bg-white/10 group-hover:border-white/15 flex items-center justify-center shrink-0 transition-colors">
              <Compass className="w-4 h-4 text-[#E60023] group-hover:text-white transition-colors" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[#252525] group-hover:text-white transition-colors">
                Browse as guest
              </span>
              <span className="block text-xs text-neutral-500 group-hover:text-neutral-300 transition-colors">
                Explore Vadakara stores &amp; menus
              </span>
            </span>
          </span>
          <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:text-white group-hover:translate-x-0.5 shrink-0 transition-all" />
        </button>

        <label className="mt-5 flex items-start gap-2.5 text-xs text-neutral-600 cursor-pointer">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => setPrivacyAccepted(e.target.checked)}
            className="mt-0.5 accent-[#E60023] rounded"
          />
          <span>
            I accept FYOORA&apos;s Privacy Policy &amp; Terms of Service, including authentication verification and delivery location services.
          </span>
        </label>

        {phoneAuthReady ? (
          <form
            onSubmit={handleVerifyOtp}
            className="mt-6 space-y-3.5 rounded-2xl border border-neutral-200 bg-white p-4"
          >
            {/* Invisible reCAPTCHA mount container prepared for Firebase Phone Auth */}
            <div id={RECAPTCHA_CONTAINER_ID} />

            <label
              htmlFor="fyoora-phone-input"
              className="block text-xs font-semibold text-neutral-700"
            >
              Or sign in with Indian Mobile Number (OTP)
            </label>

            <div className="flex items-center rounded-xl border border-neutral-300 overflow-hidden focus-within:border-[#E60023] bg-white">
              <span className="px-3.5 py-2.5 bg-[#F5F5F5] text-sm font-mono font-semibold text-[#252525] border-r border-neutral-200">
                +91
              </span>
              <input
                id="fyoora-phone-input"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phoneDigits}
                onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, ''))}
                placeholder="9847112233"
                className="flex-1 min-w-0 px-3 py-2.5 text-sm font-mono focus:outline-none"
              />
              <button
                type="button"
                disabled={busy || resendTimer > 0}
                onClick={handleSendOtp}
                className="px-4 py-2.5 text-xs font-bold text-[#E60023] hover:bg-red-50 disabled:text-neutral-400 disabled:hover:bg-transparent transition-colors"
              >
                {resendTimer > 0 ? `Resend ${resendTimer}s` : otpSent ? 'Resend' : 'Send OTP'}
              </button>
            </div>

            {otpSent && (
              <div>
                <label
                  htmlFor="fyoora-otp-input"
                  className="block text-xs font-semibold text-neutral-700 mb-1.5"
                >
                  6-Digit OTP
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="fyoora-otp-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-300 font-mono text-sm tracking-widest focus:outline-none focus:border-[#E60023]"
                  />
                </div>
              </div>
            )}

            {otpSent ? (
              <button
                type="submit"
                disabled={busy}
                className="w-full py-3 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busy ? 'Verifying...' : 'Verify OTP & Enter FYOORA'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleSendOtp}
                className="w-full py-3 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                <span>{busy ? 'Sending...' : 'Request +91 OTP'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </form>
        ) : (
          <div className="mt-6 pt-5 border-t border-neutral-200/80 flex items-center justify-center gap-2 text-xs text-neutral-500">
            <Smartphone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>Mobile number login · Coming soon</span>
          </div>
        )}

        {/* Optional Dev-Only Portal Switcher (only shown if server explicitly enables ENABLE_DEV_ROLE_SWITCHER=true) */}
        {devRoleSwitcherEnabled && (
          <div className="mt-7 pt-6 border-t border-neutral-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#252525]">
                <UserCheck className="w-4 h-4 text-[#E60023]" />
                <span>Developer Sandbox Portals (Explicit Opt-In)</span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PORTAL_QUICK_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => switchDevRole(acc.role)}
                  className="text-left p-2.5 rounded-xl border border-neutral-200 hover:border-[#E60023] hover:bg-[#E60023]/5 transition-colors"
                >
                  <div className="text-xs font-bold text-[#252525]">{acc.label}</div>
                  <div className="text-[11px] text-neutral-500 truncate">{acc.sub}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
