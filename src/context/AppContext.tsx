import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api.ts';
import type { AuthRuntimeStatus } from '../shared/authConfig.ts';
import type {
  CartItem,
  Coupon,
  LanguageCode,
  NotificationItem,
  Order,
  PreBookingSlot,
  Product,
  PromotionalBanner,
  ReviewRecord,
  SavedAddress,
  ServiceAreaConfig,
  ServiceType,
  UserProfile,
  UserRole,
  Vendor,
} from '../shared/types.ts';

export type CustomerTab = 'home' | 'explore' | 'orders' | 'ai' | 'profile';
export type AppPortal = 'customer' | 'vendor' | 'rider' | 'admin' | 'support';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

export interface BootstrapData {
  serviceArea: ServiceAreaConfig;
  vendors: Vendor[];
  products: Product[];
  preBookingSlots: PreBookingSlot[];
  coupons: Coupon[];
  banners: PromotionalBanner[];
  reviews: ReviewRecord[];
  onlineRidersCount: number;
  notifications: NotificationItem[];
}

export interface HealthStatus {
  status: string;
  region: string;
  razorpay: {
    configured: boolean;
    webhookConfigured: boolean;
    statusLabel: 'Configured' | 'PENDING CONFIGURATION';
    webhookStatusLabel: 'Configured' | 'PENDING CONFIGURATION';
    webhookPath: string;
    keyIdPreview?: string;
    mode: 'live_or_test_keys' | 'sandbox_unconfigured';
  };
  auth?: AuthRuntimeStatus;
  smsGatewayConfigured: boolean;
  geminiConfigured: boolean;
  mapsConfigured: boolean;
  mapsApiKey?: string;
}

interface AppContextValue {
  user: UserProfile | null;
  authLoading: boolean;
  guestBrowseMode: boolean;
  bootstrap: BootstrapData | null;
  health: HealthStatus | null;
  orders: Order[];
  cart: CartItem[];
  selectedAddress: SavedAddress;
  language: LanguageCode;
  activeTab: CustomerTab;
  activeCategory: ServiceType | 'all';
  activeVendorId: string | null;
  activePortal: AppPortal;
  checkoutOpen: boolean;
  toasts: ToastMessage[];
  setActiveTab: (tab: CustomerTab) => void;
  setActiveCategory: (cat: ServiceType | 'all') => void;
  setActiveVendorId: (id: string | null) => void;
  setActivePortal: (portal: AppPortal) => void;
  setCheckoutOpen: (open: boolean) => void;
  setSelectedAddress: (addr: SavedAddress) => void;
  setLanguage: (lang: LanguageCode) => void;
  notify: (text: string, type?: ToastMessage['type']) => void;
  dismissToast: (id: string) => void;
  setAuthSession: (user: UserProfile | null, token?: string | null) => void;
  enterGuestBrowse: () => void;
  exitGuestBrowse: () => void;
  switchDevRole: (role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  toggleFavourite: (targetId: string) => Promise<void>;
  addToCart: (item: CartItem) => void;
  updateCartQty: (cartItemId: string, delta: number) => void;
  clearCart: () => void;
  redirectAuthError: string | null;
  clearRedirectAuthError: () => void;
}

const DEFAULT_VADAKARA_ADDRESS: SavedAddress = {
  id: 'addr-vadakara-default',
  label: 'Vadakara Center',
  line1: 'Link Road, Near New Bus Stand, Vadakara',
  landmark: 'Municipal Bus Stand',
  city: 'Vadakara',
  district: 'Kozhikode',
  state: 'Kerala',
  pincode: '673101',
  lat: 11.6085,
  lng: 75.5917,
  isDefault: true,
};

const CART_STORAGE_KEY = 'fyoora_cart_v1';

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [guestBrowseMode, setGuestBrowseMode] = useState(false);
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedAddress, setSelectedAddress] = useState<SavedAddress>(DEFAULT_VADAKARA_ADDRESS);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [activeTab, setActiveTab] = useState<CustomerTab>('home');
  const [activeCategory, setActiveCategory] = useState<ServiceType | 'all'>('all');
  const [activeVendorId, setActiveVendorId] = useState<string | null>(null);
  const [activePortal, setActivePortal] = useState<AppPortal>('customer');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [redirectAuthError, setRedirectAuthError] = useState<string | null>(null);
  const manualLogoutRef = useRef(false);

  const clearRedirectAuthError = useCallback(() => {
    setRedirectAuthError(null);
  }, []);

  const notify = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = `tst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Ignore quota issues
    }
  }, [cart]);

  const refreshBootstrap = useCallback(async () => {
    try {
      const data = await apiRequest<BootstrapData>('/api/marketplace/bootstrap');
      setBootstrap(data);
    } catch (err) {
      console.error('Bootstrap error:', err);
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await apiRequest<{ orders: Order[] }>('/api/orders/mine');
      setOrders(data.orders);
    } catch {
      setOrders([]);
    }
  }, []);

  const applyPortalForUser = useCallback((u: UserProfile | null) => {
    if (!u) {
      setActivePortal('customer');
      return;
    }
    if (u.preferredLanguage === 'en' || u.preferredLanguage === 'ml') {
      setLanguage(u.preferredLanguage);
    }
    if (u.addresses?.length) {
      const def = u.addresses.find((a) => a.isDefault) || u.addresses[0];
      setSelectedAddress(def);
    }
    if (u.role === 'admin' || u.role === 'super_admin') {
      setActivePortal('admin');
    } else if (u.role === 'support_staff') {
      setActivePortal('support');
    } else if (
      u.role === 'restaurant_owner' ||
      u.role === 'bakery_owner' ||
      u.role === 'grocery_owner' ||
      u.role === 'merchant'
    ) {
      setActivePortal('vendor');
    } else if (u.role === 'rider') {
      setActivePortal('rider');
    } else {
      setActivePortal('customer');
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Non-blocking Firestore connection validation on boot
        void import('../lib/firebase.ts').then(({ verifyFirestoreConnection }) => verifyFirestoreConnection());

        const googleAuthModulePromise = import('../lib/googleAuth.ts');

        const redirectPromise = googleAuthModulePromise
          .then(async ({ consumeGoogleRedirectResult, completeFirebaseGoogleLogin }) => {
            const redirectRes = await consumeGoogleRedirectResult();
            if (!redirectRes) return null;
            return completeFirebaseGoogleLogin(redirectRes);
          })
          .catch((err) => {
            if (active && err instanceof Error) {
              setRedirectAuthError(err.message);
            }
            return null;
          });

        const [meRes, bootRes, healthRes, googleRedirectLogin] = await Promise.all([
          apiRequest<{ user: UserProfile | null }>('/api/auth/me'),
          apiRequest<BootstrapData>('/api/marketplace/bootstrap'),
          apiRequest<HealthStatus>('/api/health'),
          redirectPromise,
        ]);
        if (!active) return;
        setBootstrap(bootRes);
        setHealth(healthRes);

        if (googleRedirectLogin?.user) {
          manualLogoutRef.current = false;
          setStoredToken(googleRedirectLogin.token);
          setUser(googleRedirectLogin.user);
          setGuestBrowseMode(false);
          setActiveTab('home');
          applyPortalForUser(googleRedirectLogin.user);
          const ordRes = await apiRequest<{ orders: Order[] }>('/api/orders/mine').catch(() => ({ orders: [] }));
          if (active) setOrders(ordRes.orders);
          notify(
            googleRedirectLogin.linkedExistingAccount
              ? `Account linked & signed in as ${googleRedirectLogin.user.fullName || 'FYOORA user'}`
              : googleRedirectLogin.isNewUser
                ? `Welcome to FYOORA, ${googleRedirectLogin.user.fullName || 'neighbour'}!`
                : `Welcome back, ${googleRedirectLogin.user.fullName || 'FYOORA user'}`,
            'success'
          );
        } else if (meRes.user) {
          manualLogoutRef.current = false;
          setUser(meRes.user);
          applyPortalForUser(meRes.user);
          const ordRes = await apiRequest<{ orders: Order[] }>('/api/orders/mine').catch(() => ({ orders: [] }));
          if (active) setOrders(ordRes.orders);
        } else {
          // Clear any expired/invalid local token before checking Firebase Auth persistence
          if (getStoredToken()) {
            setStoredToken(null);
          }
          if (!manualLogoutRef.current) {
            const recovered = await googleAuthModulePromise
              .then(({ recoverFirebaseSessionIfSignedIn }) => recoverFirebaseSessionIfSignedIn())
              .catch((err) => {
                if (active && err instanceof Error && err.name === 'GoogleAuthHandledError') {
                  setRedirectAuthError(err.message);
                }
                return null;
              });
            if (active && !manualLogoutRef.current && recovered?.user) {
              setStoredToken(recovered.token);
              setUser(recovered.user);
              setGuestBrowseMode(false);
              applyPortalForUser(recovered.user);
              const ordRes = await apiRequest<{ orders: Order[] }>('/api/orders/mine').catch(() => ({ orders: [] }));
              if (active) setOrders(ordRes.orders);
            }
          }
        }
      } catch (err) {
        console.error('Initial load failed:', err);
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyPortalForUser, notify]);

  const setAuthSession = useCallback(
    (nextUser: UserProfile | null, token?: string | null) => {
      if (token !== undefined) {
        setStoredToken(token);
      }
      setUser(nextUser);
      if (nextUser) {
        setGuestBrowseMode(false);
        setActiveTab('home');
      }
      applyPortalForUser(nextUser);
      void refreshBootstrap();
      if (nextUser) {
        void refreshOrders();
      } else {
        setOrders([]);
      }
    },
    [applyPortalForUser, refreshBootstrap, refreshOrders]
  );

  const enterGuestBrowse = useCallback(() => {
    setGuestBrowseMode(true);
  }, []);

  const exitGuestBrowse = useCallback(() => {
    setGuestBrowseMode(false);
  }, []);

  const switchDevRole = useCallback(
    async (role: UserRole) => {
      try {
        const res = await apiRequest<{ user: UserProfile; token: string }>('/api/auth/dev-role-session', {
          method: 'POST',
          json: { role },
        });
        setAuthSession(res.user, res.token);
        notify(`Signed in as ${res.user.fullName || role}`, 'success');
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Unable to switch role', 'error');
      }
    },
    [notify, setAuthSession]
  );

  const logout = useCallback(async () => {
    manualLogoutRef.current = true;
    try {
      await Promise.all([
        apiRequest('/api/auth/logout', { method: 'POST' }),
        import('../lib/googleAuth.ts').then(({ signOutFirebaseSession }) => signOutFirebaseSession()),
      ]);
    } catch {
      // Ignore network errors on logout
    }
    setStoredToken(null);
    setUser(null);
    setOrders([]);
    setActivePortal('customer');
    setActiveTab('home');
    notify('Logged out securely', 'info');
  }, [notify]);

  const toggleFavourite = useCallback(
    async (targetId: string) => {
      if (!user) {
        notify('Please sign in to save favourites', 'info');
        return;
      }
      try {
        const res = await apiRequest<{ favourites: string[] }>('/api/users/favourites/toggle', {
          method: 'POST',
          json: { targetId },
        });
        const nextUser = { ...user, favourites: res.favourites };
        setUser(nextUser);
        void import('../lib/googleAuth.ts').then(({ syncCurrentFirebaseUserProfile }) =>
          syncCurrentFirebaseUserProfile(nextUser)
        );
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to update favourites', 'error');
      }
    },
    [notify, user]
  );

  const addToCart = useCallback(
    (item: CartItem) => {
      setCart((prev) => {
        // Keep Food & Grocery cleanly separated and enforce same-service-category consistency or replace cleanly
        const hasDifferentCategory =
          prev.length > 0 &&
          ((prev[0].serviceCategory === 'grocery' && item.serviceCategory !== 'grocery') ||
            (prev[0].serviceCategory !== 'grocery' && item.serviceCategory === 'grocery') ||
            prev[0].vendorId !== item.vendorId);

        if (hasDifferentCategory) {
          notify(
            `Started a fresh cart for ${item.vendorName} (separate from ${prev[0].vendorName})`,
            'info'
          );
          return [item];
        }

        const existingIndex = prev.findIndex((c) => c.cartItemId === item.cartItemId);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            quantity: next[existingIndex].quantity + item.quantity,
          };
          return next;
        }
        return [...prev, item];
      });
      notify(`Added ${item.name} to cart`, 'success');
    },
    [notify]
  );

  const updateCartQty = useCallback((cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartItemId === cartItemId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        guestBrowseMode,
        bootstrap,
        health,
        orders,
        cart,
        selectedAddress,
        language,
        activeTab,
        activeCategory,
        activeVendorId,
        activePortal,
        checkoutOpen,
        toasts,
        setActiveTab,
        setActiveCategory,
        setActiveVendorId,
        setActivePortal,
        setCheckoutOpen,
        setSelectedAddress,
        setLanguage,
        notify,
        dismissToast,
        setAuthSession,
        enterGuestBrowse,
        exitGuestBrowse,
        switchDevRole,
        logout,
        refreshBootstrap,
        refreshOrders,
        toggleFavourite,
        addToCart,
        updateCartQty,
        clearCart,
        redirectAuthError,
        clearRedirectAuthError,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
