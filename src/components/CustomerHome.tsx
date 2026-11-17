import { useMemo, useState } from 'react';
import {
  Bell,
  Cake,
  ChevronRight,
  Clock,
  Flower2,
  Heart,
  MapPin,
  Package,
  PartyPopper,
  Percent,
  RotateCcw,
  Search,
  ShoppingBag,
  ShoppingBasket,
  Star,
  Utensils,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type { Product, SavedAddress, ServiceType, Vendor } from '../shared/types.ts';
import { VadakaraMap } from './VadakaraMap.tsx';

export const SERVICE_CATEGORIES: {
  id: ServiceType;
  label: string;
  labelMl: string;
  subtitle: string;
  icon: typeof Utensils;
}[] = [
  {
    id: 'food',
    label: 'Food Delivery',
    labelMl: 'ഭക്ഷണം',
    subtitle: 'Restaurants & Biriyani',
    icon: Utensils,
  },
  {
    id: 'food_prebooking',
    label: 'Pre-Book Parcel',
    labelMl: 'പ്രീ-ബുക്കിംഗ്',
    subtitle: 'Skip queue pickup',
    icon: Clock,
  },
  {
    id: 'bakery',
    label: 'Bakery & Cakes',
    labelMl: 'ബേക്കറി',
    subtitle: 'Custom cakes & loaves',
    icon: Cake,
  },
  {
    id: 'grocery',
    label: 'Grocery Mart',
    labelMl: 'പലചരക്ക്',
    subtitle: '10 supermarket aisles',
    icon: ShoppingBasket,
  },
  {
    id: 'celebration',
    label: 'Celebrations',
    labelMl: 'ആഘോഷങ്ങൾ',
    subtitle: 'Birthday kits & decor',
    icon: PartyPopper,
  },
  {
    id: 'flowers_gifts',
    label: 'Flowers & Gifts',
    labelMl: 'പൂക്കളും സമ്മാനങ്ങളും',
    subtitle: 'Bouquets & hampers',
    icon: Flower2,
  },
  {
    id: 'pickup_drop',
    label: 'Pickup & Drop',
    labelMl: 'പിക്കപ്പ് & ഡ്രോപ്പ്',
    subtitle: 'Vadakara parcel courier',
    icon: Package,
  },
];

const VADAKARA_PRESET_SPOTS: Omit<SavedAddress, 'id'>[] = [
  {
    label: 'Link Road / New Bus Stand',
    line1: 'Link Road, Near New Bus Stand, Vadakara',
    landmark: 'Municipal Office',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673101',
    lat: 11.6085,
    lng: 75.5917,
  },
  {
    label: 'Edodi / Railway Station',
    line1: 'Edodi Main Road, Near Railway Station, Vadakara',
    landmark: 'Town Hall Junction',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673101',
    lat: 11.6061,
    lng: 75.5882,
  },
  {
    label: 'Ashokapuram NH-66',
    line1: 'Ashokapuram Junction, NH-66, Vadakara',
    landmark: 'Near Federal Bank',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673104',
    lat: 11.618,
    lng: 75.598,
  },
  {
    label: 'Chorode / Sandbanks',
    line1: 'Sandbanks Beach Road, Chorode, Vadakara',
    landmark: 'Near Coastal Police Station',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673106',
    lat: 11.5945,
    lng: 75.579,
  },
];

export function LocationSelectorModal({ onClose }: { onClose: () => void }) {
  const { user, bootstrap, selectedAddress, setSelectedAddress, setAuthSession, notify } = useApp();
  const [line1, setLine1] = useState(selectedAddress.line1);
  const [label, setLabel] = useState('Home');
  const [coords, setCoords] = useState({ lat: selectedAddress.lat, lng: selectedAddress.lng });
  const [areaStatus, setAreaStatus] = useState<{ inside: boolean; reason?: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const checkPoint = async (lat: number, lng: number) => {
    setCoords({ lat, lng });
    try {
      const res = await apiRequest<{ check: { inside: boolean; reason?: string } }>(
        '/api/service-area/check',
        { method: 'POST', json: { lat, lng } }
      );
      setAreaStatus(res.check);
    } catch {
      // ignore
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line1.trim()) return;
    setSaving(true);
    try {
      const checkRes = await apiRequest<{ check: { inside: boolean; reason?: string } }>(
        '/api/service-area/check',
        { method: 'POST', json: coords }
      );
      if (!checkRes.check.inside) {
        setAreaStatus(checkRes.check);
        setSaving(false);
        return;
      }

      if (user) {
        const res = await apiRequest<{ addresses: SavedAddress[] }>('/api/users/addresses', {
          method: 'POST',
          json: { label, line1: line1.trim(), lat: coords.lat, lng: coords.lng, pincode: '673101' },
        });
        setAuthSession({ ...user, addresses: res.addresses });
        setSelectedAddress(res.addresses[0]);
      } else {
        setSelectedAddress({
          id: `addr-${Date.now()}`,
          label,
          line1: line1.trim(),
          city: 'Vadakara',
          district: 'Kozhikode',
          state: 'Kerala',
          pincode: '673101',
          lat: coords.lat,
          lng: coords.lng,
          isDefault: true,
        });
      }
      notify('Delivery location updated to Vadakara zone', 'success');
      onClose();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save address', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-display font-bold text-lg text-[#252525]">Vadakara Delivery Location</h3>
            <p className="text-xs text-neutral-500">
              Active service area: {bootstrap?.serviceArea.radiusKm || 10} km around Vadakara Town
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-neutral-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <VadakaraMap
          center={bootstrap?.serviceArea.center}
          radiusKm={bootstrap?.serviceArea.radiusKm}
          heightClass="h-48"
          title="Select Vadakara Pin"
          markers={[{ id: 'sel', label: label || 'Selected Pin', position: coords, kind: 'customer' }]}
          onSelectPoint={(pt) => checkPoint(pt.lat, pt.lng)}
        />

        {areaStatus && !areaStatus.inside && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-700">
            {areaStatus.reason || 'Selected point is outside the Vadakara active service radius.'}
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs font-semibold text-neutral-600 mb-2">Quick Vadakara Landmarks</div>
          <div className="grid grid-cols-2 gap-2">
            {VADAKARA_PRESET_SPOTS.map((spot) => (
              <button
                key={spot.label}
                type="button"
                onClick={() => {
                  setLine1(spot.line1);
                  setLabel(spot.label.split(' / ')[0]);
                  void checkPoint(spot.lat, spot.lng);
                }}
                className="text-left p-2.5 rounded-xl border border-neutral-200 hover:border-[#E60023] text-xs transition-colors"
              >
                <div className="font-semibold text-[#252525] truncate">{spot.label}</div>
                <div className="text-[11px] text-neutral-500 truncate">{spot.landmark}</div>
              </button>
            ))}
          </div>
        </div>

        {user?.addresses && user.addresses.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-semibold text-neutral-600 mb-2">Your Saved Addresses</div>
            <div className="space-y-2">
              {user.addresses.map((addr) => (
                <button
                  key={addr.id}
                  type="button"
                  onClick={() => {
                    setSelectedAddress(addr);
                    onClose();
                  }}
                  className={`w-full text-left p-3 rounded-xl border text-xs flex items-center justify-between ${
                    selectedAddress.id === addr.id
                      ? 'border-[#E60023] bg-[#E60023]/5'
                      : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <div>
                    <div className="font-bold text-[#252525]">{addr.label}</div>
                    <div className="text-neutral-600 mt-0.5">{addr.line1}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-neutral-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 pt-4 border-t border-neutral-200 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {['Home', 'Work', 'Other'].map((lbl) => (
              <button
                key={lbl}
                type="button"
                onClick={() => setLabel(lbl)}
                className={`py-2 rounded-xl text-xs font-semibold border ${
                  label === lbl
                    ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                    : 'border-neutral-200 text-neutral-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={line1}
            onChange={(e) => setLine1(e.target.value)}
            placeholder="Street / Building / House Name in Vadakara"
            className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:border-[#E60023]"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {saving ? 'Checking Zone...' : 'Confirm Vadakara Address'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const { bootstrap, refreshBootstrap, setActiveTab } = useApp();
  const notifications = bootstrap?.notifications || [];

  const markAllRead = async () => {
    await apiRequest('/api/notifications/read-all', { method: 'POST' });
    await refreshBootstrap();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex justify-end">
      <div className="bg-white w-full max-w-sm h-full p-5 overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#E60023]" />
            <h3 className="font-display font-bold text-base">Notifications</h3>
          </div>
          <div className="flex items-center gap-2">
            {notifications.some((n) => !n.read) && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-[#E60023] hover:underline"
              >
                Mark all read
              </button>
            )}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 py-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center py-12 text-sm text-neutral-500">
              No notifications yet. Order updates and Vadakara offers appear here.
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  if (n.orderId) setActiveTab('orders');
                  onClose();
                }}
                className={`w-full text-left p-3.5 rounded-2xl border transition-colors ${
                  n.read ? 'border-neutral-200 bg-white' : 'border-[#E60023]/30 bg-[#E60023]/5'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#252525]">{n.title}</span>
                  <span className="text-[10px] text-neutral-400">
                    {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-neutral-600 mt-1 leading-relaxed">{n.body}</p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function CustomerHome({
  onSelectProductForConfig,
}: {
  onSelectProductForConfig: (product: Product, vendor: Vendor) => void;
}) {
  const {
    user,
    bootstrap,
    orders,
    language,
    setActiveTab,
    setActiveCategory,
    setActiveVendorId,
    toggleFavourite,
    addToCart,
    notify,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');

  const vendors = bootstrap?.vendors || [];
  const products = bootstrap?.products || [];
  const coupons = bootstrap?.coupons || [];
  const banners = bootstrap?.banners || [];

  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matchedVendors = vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.cuisinesOrTags.some((t) => t.toLowerCase().includes(q)) ||
        v.areaName.toLowerCase().includes(q)
    );
    const matchedProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
    return { matchedVendors, matchedProducts };
  }, [products, searchQuery, vendors]);

  const restaurants = useMemo(
    () => vendors.filter((v) => v.serviceCategory === 'food'),
    [vendors]
  );

  const popularStores = useMemo(
    () => [...vendors].sort((a, b) => b.rating - a.rating).slice(0, 4),
    [vendors]
  );

  const trendingProducts = useMemo(
    () => products.filter((p) => p.trending && p.inStock).slice(0, 6),
    [products]
  );

  const openCategory = (cat: ServiceType, vendorId: string | null = null) => {
    setActiveCategory(cat);
    setActiveVendorId(vendorId);
    setActiveTab('explore');
  };

  const handleReorder = (orderIdx: number) => {
    const ord = orders[orderIdx];
    if (!ord || !ord.items.length) return;
    ord.items.forEach((it) => {
      addToCart({
        ...it,
        cartItemId: `${it.productId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      });
    });
    notify(`Loaded ${ord.items.length} item(s) from ${ord.orderNumber} into cart`, 'success');
  };

  return (
    <div className="space-y-8 pb-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-neutral-400 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search Biriyani, Vadakara Fresh Mart, custom cakes, birthday kits, roses..."
          className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-[#F5F5F5] border border-neutral-200 text-sm text-[#252525] placeholder:text-neutral-500 focus:outline-none focus:bg-white focus:border-[#E60023] transition-colors"
        />
      </div>

      {/* Live Search Results */}
      {searchMatches && (
        <section className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-base text-[#252525]">
              Results for &ldquo;{searchQuery}&rdquo;
            </h2>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs font-semibold text-[#E60023]"
            >
              Clear
            </button>
          </div>
          {searchMatches.matchedVendors.length === 0 && searchMatches.matchedProducts.length === 0 ? (
            <p className="text-sm text-neutral-500">No stores or products matched your search in Vadakara.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {searchMatches.matchedVendors.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => openCategory(v.serviceCategory, v.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-neutral-200 hover:border-[#E60023] text-left transition-colors"
                >
                  <img src={v.logoUrl} alt={v.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#252525] truncate">{v.name}</div>
                    <div className="text-xs text-neutral-500 truncate">
                      {v.areaName} · ★ {v.rating}
                    </div>
                  </div>
                </button>
              ))}
              {searchMatches.matchedProducts.slice(0, 6).map((p) => {
                const vendor = vendors.find((v) => v.id === p.vendorId);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-neutral-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={p.imageUrl} alt={p.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-[#252525] truncate">{p.name}</div>
                        <div className="text-xs text-neutral-500 truncate">
                          {vendor?.name} · <span className="font-mono font-semibold text-[#252525]">₹{p.price}</span>
                        </div>
                      </div>
                    </div>
                    {vendor && (
                      <button
                        type="button"
                        disabled={!p.inStock}
                        onClick={() => onSelectProductForConfig(p, vendor)}
                        className="px-3 py-1.5 rounded-xl bg-[#E60023] text-white text-xs font-semibold shrink-0 disabled:bg-neutral-300"
                      >
                        {p.inStock ? 'Add' : 'Out'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Promotional Hero Banners */}
      {banners.length > 0 && (
        <section className="grid md:grid-cols-2 gap-4">
          {banners.slice(0, 2).map((b, idx) => (
            <div
              key={b.id}
              className={`relative rounded-3xl overflow-hidden border border-neutral-200 p-6 flex flex-col justify-between min-h-[180px] ${
                idx === 0 ? 'bg-[#252525] text-white' : 'bg-[#F5F5F5] text-[#252525]'
              }`}
            >
              <div className="relative z-10 w-[64%] sm:w-[60%] pr-2">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    idx === 0 ? 'text-[#E60023]' : 'text-[#E60023]'
                  }`}
                >
                  Vadakara Spotlight
                </span>
                <h2 className="font-display text-lg sm:text-2xl font-extrabold mt-1 leading-snug">
                  {b.title}
                </h2>
                <p className={`text-xs sm:text-sm mt-1.5 ${idx === 0 ? 'text-neutral-300' : 'text-neutral-600'}`}>
                  {b.subtitle}
                </p>
              </div>
              <div className="relative z-10 mt-5">
                <button
                  type="button"
                  onClick={() => openCategory(b.targetService)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white text-xs font-bold transition-colors"
                >
                  <span>{b.ctaLabel}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <img
                src={b.imageUrl}
                alt={b.title}
                className="absolute right-0 top-0 h-full w-36 sm:w-48 object-cover opacity-85"
              />
              <div
                className={`absolute inset-0 pointer-events-none ${
                  idx === 0
                    ? 'bg-gradient-to-r from-[#252525] via-[#252525]/95 via-55% to-transparent'
                    : 'bg-gradient-to-r from-[#F5F5F5] via-[#F5F5F5]/95 via-55% to-transparent'
                }`}
              />
            </div>
          ))}
        </section>
      )}

      {/* 8 Dedicated Service Categories */}
      <section>
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#252525]">
              All FYOORA Services in Vadakara
            </h2>
            <p className="text-xs text-neutral-500">
              Dedicated marketplaces for Food, Supermarket Grocery, Celebrations, Gifts &amp; Parcels
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SERVICE_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => openCategory(cat.id)}
                className="group text-left p-4 rounded-2xl bg-white border border-neutral-200 hover:border-[#E60023] hover:shadow-sm transition-all flex flex-col justify-between min-h-[112px]"
              >
                <div className="w-10 h-10 rounded-xl bg-[#F5F5F5] group-hover:bg-[#E60023] text-[#252525] group-hover:text-white flex items-center justify-center transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="mt-3">
                  <div className="font-display font-bold text-sm text-[#252525]">
                    {language === 'ml' ? cat.labelMl : cat.label}
                  </div>
                  <div className="text-[11px] text-neutral-500 mt-0.5">{cat.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recommended Restaurants */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#252525]">
              Recommended Restaurants
            </h2>
            <p className="text-xs text-neutral-500">Live kitchen status, ratings &amp; Vadakara prep times</p>
          </div>
          <button
            type="button"
            onClick={() => openCategory('food')}
            className="text-xs font-bold text-[#E60023] hover:underline flex items-center gap-1"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {restaurants.map((v) => {
            const isFav = user?.favourites.includes(v.id);
            return (
              <div
                key={v.id}
                className="rounded-3xl border border-neutral-200 bg-white overflow-hidden hover:border-neutral-300 transition-all flex flex-col"
              >
                <div className="relative aspect-[4/3] bg-[#F5F5F5] overflow-hidden">
                  <img src={v.coverUrl} alt={v.name} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    aria-label="Toggle favourite"
                    onClick={() => toggleFavourite(v.id)}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 flex items-center justify-center shadow-sm"
                  >
                    <Heart
                      className={`w-4 h-4 ${isFav ? 'fill-[#E60023] text-[#E60023]' : 'text-neutral-600'}`}
                    />
                  </button>
                  <div className="absolute bottom-3 left-3 bg-[#252525]/90 text-white px-2.5 py-1 rounded-lg text-[11px] font-semibold tabular-nums">
                    {v.avgPrepTimeMins + 10}–{v.avgPrepTimeMins + 18} mins · {v.isOpen ? 'Open' : 'Closed'}
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display font-bold text-base text-[#252525]">{v.name}</h3>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#252525] tabular-nums shrink-0">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {v.rating} ({v.reviewCount})
                      </span>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      {v.cuisinesOrTags.slice(0, 3).join(' · ')}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {v.areaName}
                    </p>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openCategory('food', v.id)}
                      className="flex-1 py-2 rounded-xl bg-[#252525] hover:bg-black text-white text-xs font-semibold transition-colors"
                    >
                      Order Delivery
                    </button>
                    {v.supportsPreBooking && (
                      <button
                        type="button"
                        onClick={() => openCategory('food_prebooking', v.id)}
                        className="px-3 py-2 rounded-xl border border-neutral-300 hover:border-[#E60023] text-xs font-semibold text-[#252525] transition-colors"
                      >
                        Pre-Book
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trending Products Across Vadakara */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#252525]">
              Trending Across Vadakara
            </h2>
            <p className="text-xs text-neutral-500">Top-ordered items across Food, Bakery, Grocery &amp; Gifts</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trendingProducts.map((p) => {
            const vendor = vendors.find((v) => v.id === p.vendorId);
            if (!vendor) return null;
            return (
              <div
                key={p.id}
                className="flex gap-3.5 p-3.5 rounded-2xl border border-neutral-200 bg-white hover:border-neutral-300 transition-colors"
              >
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="w-20 h-20 rounded-xl object-cover shrink-0 bg-[#F5F5F5]"
                />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="text-[11px] font-medium text-neutral-500 truncate">
                      {vendor.name} · {p.category}
                    </div>
                    <h3 className="font-display font-bold text-sm text-[#252525] line-clamp-2 mt-0.5">
                      {p.name}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="font-mono font-bold text-sm text-[#252525] tabular-nums">
                      ₹{p.price}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectProductForConfig(p, vendor)}
                      className="px-3 py-1.5 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white text-xs font-semibold transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Popular Local Stores & Local Offers */}
      <div className="grid lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-[#F5F5F5] rounded-3xl p-5">
          <h2 className="font-display font-bold text-base text-[#252525] mb-3">
            Popular Vadakara Stores
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {popularStores.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => openCategory(v.serviceCategory, v.id)}
                className="bg-white p-3.5 rounded-2xl border border-neutral-200 hover:border-[#E60023] flex items-center gap-3 text-left transition-colors"
              >
                <img src={v.logoUrl} alt={v.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[#252525] truncate">{v.name}</div>
                  <div className="text-xs text-neutral-500 truncate">{v.areaName}</div>
                  <div className="text-[11px] font-semibold text-[#252525] mt-0.5 tabular-nums">
                    ★ {v.rating} · {v.openingHours}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 bg-[#252525] text-white rounded-3xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Percent className="w-4 h-4 text-[#E60023]" />
            <h2 className="font-display font-bold text-base">Local Vadakara Offers</h2>
          </div>
          <div className="space-y-2.5">
            {coupons.map((c) => (
              <div key={c.id} className="p-3 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-bold text-xs text-[#E60023] bg-white inline-block px-2 py-0.5 rounded">
                    {c.code}
                  </div>
                  <div className="text-xs font-semibold mt-1">{c.title}</div>
                  <div className="text-[11px] text-neutral-300">{c.description}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent Orders with Quick Reorder */}
      {orders.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-[#252525] mb-3">
            Recent Orders &amp; Quick Reorder
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {orders.slice(0, 2).map((ord, idx) => (
              <div
                key={ord.id}
                className="p-4 rounded-2xl border border-neutral-200 bg-white flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono font-bold text-neutral-500">{ord.orderNumber}</div>
                  <div className="font-display font-bold text-sm text-[#252525] truncate mt-0.5">
                    {ord.vendorName || 'Pickup & Drop Parcel'}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                    {ord.status.replace(/_/g, ' ')} · ₹{ord.pricing.grandTotal}
                  </div>
                </div>
                {ord.items.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => handleReorder(idx)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#F5F5F5] hover:bg-[#E60023] hover:text-white text-xs font-bold text-[#252525] transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reorder
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="px-3 py-2 rounded-xl bg-[#F5F5F5] text-xs font-bold text-[#252525] shrink-0"
                  >
                    Track
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
