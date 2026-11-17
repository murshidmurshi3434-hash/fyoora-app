import { lazy, Suspense, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  ChevronDown,
  Compass,
  Home,
  MapPin,
  Package,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useApp, type CustomerTab } from './context/AppContext.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls.tsx';
import { StartupIntroOverlay } from './components/StartupIntroOverlay.tsx';
import { isAutostartEnabled } from './lib/introMedia.ts';
import type { Product, Vendor } from './shared/types.ts';

const IntroAndAuth = lazy(() => import('./components/IntroAndAuth.tsx').then((module) => ({ default: module.IntroAndAuth })));
const CustomerHome = lazy(() => import('./components/CustomerHome.tsx').then((module) => ({ default: module.CustomerHome })));
const LocationSelectorModal = lazy(() => import('./components/CustomerHome.tsx').then((module) => ({ default: module.LocationSelectorModal })));
const NotificationsDrawer = lazy(() => import('./components/CustomerHome.tsx').then((module) => ({ default: module.NotificationsDrawer })));
const MarketplaceCatalog = lazy(() => import('./components/MarketplaceCatalog.tsx').then((module) => ({ default: module.MarketplaceCatalog })));
const ProductConfiguratorModal = lazy(() => import('./components/MarketplaceCatalog.tsx').then((module) => ({ default: module.ProductConfiguratorModal })));
const CartCheckoutModal = lazy(() => import('./components/CartCheckoutModal.tsx').then((module) => ({ default: module.CartCheckoutModal })));
const OrdersAndTracking = lazy(() => import('./components/OrdersAndTracking.tsx').then((module) => ({ default: module.OrdersAndTracking })));
const FyooraAiView = lazy(() => import('./components/FyooraAiView.tsx').then((module) => ({ default: module.FyooraAiView })));
const ProfileAndSupportView = lazy(() => import('./components/ProfileAndSupportView.tsx').then((module) => ({ default: module.ProfileAndSupportView })));
const VendorPortal = lazy(() => import('./components/portals/VendorPortal.tsx').then((module) => ({ default: module.VendorPortal })));
const RiderPortal = lazy(() => import('./components/portals/RiderPortal.tsx').then((module) => ({ default: module.RiderPortal })));
const AdminPortal = lazy(() => import('./components/portals/AdminPortal.tsx').then((module) => ({ default: module.AdminPortal })));
const SupportPortal = lazy(() => import('./components/portals/SupportPortal.tsx').then((module) => ({ default: module.SupportPortal })));

function AppLoadingState() {
  return (
    <div role="status" className="min-h-[35vh] flex items-center justify-center text-sm text-neutral-500">
      Loading FYOORA…
    </div>
  );
}

function ToastBannerList() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] space-y-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto p-3.5 rounded-2xl shadow-lg border text-xs font-semibold flex items-center justify-between gap-2 ${
            t.type === 'error'
              ? 'bg-red-600 text-white border-red-700'
              : t.type === 'success'
                ? 'bg-[#252525] text-white border-black'
                : 'bg-white text-[#252525] border-neutral-200'
          }`}
        >
          <span>{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification">
            <X className="w-4 h-4 opacity-75" />
          </button>
        </div>
      ))}
    </div>
  );
}

function MapsQuotaBanner() {
  const [quotaExceeded, setQuotaExceeded] = useState(
    Boolean(typeof window !== 'undefined' && window.__fyooraQuotaExceeded)
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  if (!quotaExceeded || dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm sticky top-0 z-50 shadow-sm flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 mx-auto">
        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
        <span>
          Google Maps Platform quota reached. If you are the app owner, visit{' '}
          <a
            href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold text-amber-950 hover:text-amber-800"
          >
            maps developer site
          </a>{' '}
          for instructions to update your account. (Interactive Vadakara coordinate map remains active.)
        </span>
      </div>
      <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss Maps quota notice" className="p-1 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const BOTTOM_TABS: { id: CustomerTab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'orders', label: 'Orders', icon: Package },
  { id: 'ai', label: 'AI Assistant', icon: Sparkles },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function App() {
  const {
    user,
    authLoading,
    guestBrowseMode,
    exitGuestBrowse,
    bootstrap,
    cart,
    checkoutOpen,
    selectedAddress,
    activeTab,
    activePortal,
    setActiveTab,
    setCheckoutOpen,
  } = useApp();

  const [startupIntroActive, setStartupIntroActive] = useState(() =>
    typeof window === 'undefined' ? false : !isAutostartEnabled(window.location.search)
  );
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [configProduct, setConfigProduct] = useState<{ product: Product; vendor: Vendor } | null>(null);
  const [selectedPreBookingSlotId, setSelectedPreBookingSlotId] = useState<string | null>(null);

  if (startupIntroActive) {
    return (
      <StartupIntroOverlay
        holdWhileLoading={authLoading}
        onComplete={() => setStartupIntroActive(false)}
      />
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3">
        <img
          src="/assets/aistudio/fyoora-lockup-red_72717535.png"
          alt="FYOORA"
          className="h-12 object-contain"
        />
        <div className="text-xs font-medium text-neutral-500">Loading Vadakara Super App...</div>
      </div>
    );
  }

  if ((!user && !guestBrowseMode) || (user && !user.profileCompleted)) {
    return (
      <>
        <MapsQuotaBanner />
        <OfflineIndicator />
        <ToastBannerList />
        <Suspense fallback={<AppLoadingState />}>
          <IntroAndAuth />
        </Suspense>
      </>
    );
  }

  if (activePortal === 'vendor') {
    return (
      <>
        <MapsQuotaBanner />
        <OfflineIndicator />
        <ToastBannerList />
        <Suspense fallback={<AppLoadingState />}>
          <VendorPortal />
        </Suspense>
      </>
    );
  }

  if (activePortal === 'rider') {
    return (
      <>
        <MapsQuotaBanner />
        <OfflineIndicator />
        <ToastBannerList />
        <Suspense fallback={<AppLoadingState />}>
          <RiderPortal />
        </Suspense>
      </>
    );
  }

  if (activePortal === 'admin') {
    return (
      <>
        <MapsQuotaBanner />
        <OfflineIndicator />
        <ToastBannerList />
        <Suspense fallback={<AppLoadingState />}>
          <AdminPortal />
        </Suspense>
      </>
    );
  }

  if (activePortal === 'support') {
    return (
      <>
        <MapsQuotaBanner />
        <OfflineIndicator />
        <ToastBannerList />
        <Suspense fallback={<AppLoadingState />}>
          <SupportPortal />
        </Suspense>
      </>
    );
  }

  const unreadCount = (bootstrap?.notifications || []).filter((n) => !n.read).length;
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <div className="min-h-screen bg-white text-[#252525] flex flex-col">
      <MapsQuotaBanner />
      <OfflineIndicator />
      <ToastBannerList />

      {/* Top Sticky App Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-initial">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="shrink-0 focus:outline-none"
            >
              <img
                src="/assets/aistudio/fyoora-lockup-red_72717535.png"
                alt="FYOORA"
                className="h-6 sm:h-8 object-contain"
              />
            </button>

            <button
              type="button"
              onClick={() => setLocationModalOpen(true)}
              className="flex items-center gap-1.5 text-left px-2 sm:px-2.5 py-1.5 rounded-xl hover:bg-[#F5F5F5] min-w-0 flex-1 sm:flex-initial sm:max-w-xs transition-colors"
            >
              <MapPin className="w-4 h-4 text-[#E60023] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[#252525] truncate flex items-center gap-1">
                  <span className="truncate">{selectedAddress.label}</span>
                  <ChevronDown className="w-3 h-3 text-neutral-500 shrink-0" />
                </div>
                <div className="hidden sm:block text-[11px] text-neutral-500 truncate">{selectedAddress.line1}</div>
              </div>
            </button>
          </div>

          {/* Desktop Tab Bar */}
          <nav className="hidden md:flex items-center gap-1">
            {BOTTOM_TABS.map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                    active ? 'bg-[#252525] text-white' : 'text-neutral-600 hover:bg-[#F5F5F5]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {/* Header Utility Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton compact />
            </div>

            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              aria-label="Open notifications"
              className="relative p-1.5 sm:p-2 rounded-xl hover:bg-[#F5F5F5] text-[#252525]"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#E60023] text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>

            {!user && (
              <button
                type="button"
                onClick={exitGuestBrowse}
                className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-neutral-300 hover:bg-[#F5F5F5] text-xs font-bold text-[#252525] transition-colors whitespace-nowrap"
              >
                Sign In
              </button>
            )}

            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              aria-label="Open Cart"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white text-xs font-bold transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4" />
              <span className="tabular-nums">
                {cartCount > 0 ? `${cartCount} · ₹${cartTotal}` : 'Cart'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 pt-5 pb-28 md:pb-10">
        <Suspense fallback={<AppLoadingState />}>
          {activeTab === 'home' && (
            <CustomerHome
              onSelectProductForConfig={(product, vendor) => setConfigProduct({ product, vendor })}
            />
          )}
          {activeTab === 'explore' && (
            <MarketplaceCatalog
              onSelectProductForConfig={(product, vendor) => setConfigProduct({ product, vendor })}
              selectedPreBookingSlotId={selectedPreBookingSlotId}
              onSelectPreBookingSlotId={setSelectedPreBookingSlotId}
            />
          )}
          {activeTab === 'orders' && <OrdersAndTracking />}
          {activeTab === 'ai' && <FyooraAiView />}
          {activeTab === 'profile' && <ProfileAndSupportView />}
        </Suspense>
      </main>

      {/* Compact Mobile Cart Bar (only when items exist, sits neatly above bottom nav) */}
      {cartCount > 0 && (
        <div className="md:hidden fixed bottom-16 left-3 right-3 z-30">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="w-full py-3 px-4 rounded-2xl bg-[#252525] text-white shadow-xl flex items-center justify-between text-xs font-bold"
          >
            <span className="tabular-nums">
              {cartCount} item(s) · {cart[0]?.vendorName}
            </span>
            <span className="text-[#E60023] bg-white px-2.5 py-1 rounded-lg font-mono tabular-nums">
              Checkout ₹{cartTotal}
            </span>
          </button>
        </div>
      )}

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Primary navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-neutral-200 px-2 h-16 grid grid-cols-5 items-center"
      >
        {BOTTOM_TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 text-[11px] font-semibold transition-colors ${
                active ? 'text-[#E60023]' : 'text-neutral-500'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-full">{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modals & Drawers */}
      <Suspense fallback={null}>
        {locationModalOpen && <LocationSelectorModal onClose={() => setLocationModalOpen(false)} />}
        {notificationsOpen && <NotificationsDrawer onClose={() => setNotificationsOpen(false)} />}
        {configProduct && (
          <ProductConfiguratorModal
            product={configProduct.product}
            vendor={configProduct.vendor}
            onClose={() => setConfigProduct(null)}
          />
        )}
        {checkoutOpen && <CartCheckoutModal selectedPreBookingSlotId={selectedPreBookingSlotId} />}
      </Suspense>
    </div>
  );
}
