import { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  Clock,
  Heart,
  ImagePlus,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import type {
  CartItem,
  CustomCakeSpec,
  GiftCustomisationSpec,
  Product,
  ProductAddon,
  ProductVariation,
  ServiceType,
  Vendor,
} from '../shared/types.ts';
import { SERVICE_CATEGORIES } from './CustomerHome.tsx';
import { PickupDropView } from './PickupDropView.tsx';

const GROCERY_AISLES = [
  'All',
  'Vegetables',
  'Fruits',
  'Rice and grains',
  'Dairy',
  'Snacks',
  'Beverages',
  'Household products',
  'Personal care',
  'Frozen products',
  'Daily essentials',
];

const KITCHEN_INSTRUCTION_CHIPS = [
  'Less spicy',
  'Extra spicy',
  'No onion',
  'No garlic',
  'Pack gravy separately',
  'Include cutlery & tissues',
];

const SHOPPING_LIST_KEY = 'fyoora_grocery_shopping_list_v1';

export function ProductConfiguratorModal({
  product,
  vendor,
  onClose,
  onAddPreBookSlot,
}: {
  product: Product;
  vendor: Vendor;
  onClose: () => void;
  onAddPreBookSlot?: () => void;
}) {
  const { addToCart } = useApp();
  const [selectedVar, setSelectedVar] = useState<ProductVariation | undefined>(
    product.variations?.[0]
  );
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);
  const [qty, setQty] = useState(1);

  // Food Kitchen instructions
  const [kitchenChips, setKitchenChips] = useState<string[]>([]);
  const [kitchenCustomNote, setKitchenCustomNote] = useState('');

  // Custom Cake builder
  const [cakeSize, setCakeSize] = useState<CustomCakeSpec['size']>('1 kg');
  const [cakeFlavour, setCakeFlavour] = useState('Belgian Dark Chocolate Truffle');
  const [cakeEgg, setCakeEgg] = useState<CustomCakeSpec['eggOption']>('Eggless');
  const [cakeMessage, setCakeMessage] = useState('');
  const [cakeRefPhoto, setCakeRefPhoto] = useState<string | undefined>();

  // Flowers & Gifts customisation
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [giftMessage, setGiftMessage] = useState('');
  const [packagingTier, setPackagingTier] = useState<GiftCustomisationSpec['packagingTier']>('Standard Ribbon');
  const [giftRefPhoto, setGiftRefPhoto] = useState<string | undefined>();

  const handleImageUpload = (file: File | undefined, setter: (url: string) => void) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const customCakeExtra = product.allowCustomCake
    ? cakeSize === '1 kg'
      ? 450
      : cakeSize === '1.5 kg'
        ? 850
        : cakeSize === '2 kg'
          ? 1250
          : 0
    : 0;
  const giftExtra =
    product.allowGiftCustomisation && packagingTier === 'Premium Keepsake Box (+₹60)' ? 60 : 0;

  const unitPrice = Math.max(
    1,
    product.price +
      (selectedVar?.priceDelta || 0) +
      selectedAddons.reduce((s, a) => s + a.price, 0) +
      customCakeExtra +
      giftExtra
  );

  const toggleAddon = (a: ProductAddon) => {
    setSelectedAddons((prev) =>
      prev.some((x) => x.id === a.id) ? prev.filter((x) => x.id !== a.id) : [...prev, a]
    );
  };

  const toggleChip = (chip: string) => {
    setKitchenChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  const handleConfirm = () => {
    const item: CartItem = {
      cartItemId: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productId: product.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      serviceCategory: vendor.serviceCategory,
      name: product.name,
      imageUrl: product.imageUrl,
      unitPrice,
      quantity: qty,
      selectedVariation: selectedVar,
      selectedAddons: selectedAddons.length ? selectedAddons : undefined,
      kitchenInstructions: kitchenChips.length ? kitchenChips : undefined,
      kitchenCustomNote: kitchenCustomNote.trim() || undefined,
      customCake: product.allowCustomCake
        ? {
            size: cakeSize,
            flavour: cakeFlavour,
            eggOption: cakeEgg,
            messageOnCake: cakeMessage.trim(),
            referenceImageDataUrl: cakeRefPhoto,
          }
        : undefined,
      giftCustomisation: product.allowGiftCustomisation
        ? {
            recipientName: recipientName.trim() || 'Recipient',
            recipientPhone: recipientPhone.trim(),
            giftMessage: giftMessage.trim(),
            packagingTier,
            referenceImageDataUrl: giftRefPhoto,
          }
        : undefined,
    };
    addToCart(item);
    onAddPreBookSlot?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl">
        <div className="flex gap-3.5 items-start pb-4 border-b border-neutral-200">
          <img src={product.imageUrl} alt={product.name} className="w-20 h-20 rounded-2xl object-cover shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#E60023]">{vendor.name}</div>
            <h3 className="font-display font-bold text-lg text-[#252525] leading-snug">{product.name}</h3>
            <p className="text-xs text-neutral-500 mt-1">{product.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-neutral-500 hover:text-[#252525] px-2 py-1"
          >
            Close
          </button>
        </div>

        <div className="py-4 space-y-5">
          {product.variations && product.variations.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                Select Portion / Size
              </div>
              <div className="space-y-2">
                {product.variations.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVar(v)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-colors ${
                      selectedVar?.id === v.id
                        ? 'border-[#E60023] bg-[#E60023]/5 text-[#252525]'
                        : 'border-neutral-200 text-neutral-700'
                    }`}
                  >
                    <span>{v.name}</span>
                    <span className="font-mono tabular-nums">
                      {v.priceDelta === 0 ? 'Standard' : v.priceDelta > 0 ? `+₹${v.priceDelta}` : `-₹${Math.abs(v.priceDelta)}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {product.addons && product.addons.length > 0 && (
            <div>
              <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                Optional Add-ons
              </div>
              <div className="space-y-2">
                {product.addons.map((a) => {
                  const active = selectedAddons.some((x) => x.id === a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAddon(a)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-semibold transition-colors ${
                        active ? 'border-[#E60023] bg-[#E60023]/5' : 'border-neutral-200'
                      }`}
                    >
                      <span>{a.name}</span>
                      <span className="font-mono tabular-nums">+₹{a.price}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Food Kitchen Instructions (Strictly separate from Rider delivery note) */}
          {vendor.serviceCategory === 'food' && (
            <div>
              <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                Restaurant Kitchen Instructions
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {KITCHEN_INSTRUCTION_CHIPS.map((chip) => {
                  const active = kitchenChips.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => toggleChip(chip)}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#252525] text-white border-[#252525]'
                          : 'bg-[#F5F5F5] text-neutral-700 border-neutral-200'
                      }`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={kitchenCustomNote}
                onChange={(e) => setKitchenCustomNote(e.target.value)}
                placeholder="Any allergy or cooking note for the chef..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs focus:outline-none focus:border-[#E60023]"
              />
            </div>
          )}

          {/* Bakery Custom Cake Designer */}
          {product.allowCustomCake && (
            <div className="p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200 space-y-3">
              <div className="text-xs font-bold text-[#E60023] uppercase tracking-wide">
                Custom Cake Specifications
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['0.5 kg', '1 kg', '1.5 kg', '2 kg'] as CustomCakeSpec['size'][]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setCakeSize(sz)}
                    className={`py-2 rounded-xl border text-xs font-bold ${
                      cakeSize === sz
                        ? 'bg-[#E60023] text-white border-[#E60023]'
                        : 'bg-white text-[#252525] border-neutral-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={cakeFlavour}
                  onChange={(e) => setCakeFlavour(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-neutral-300 bg-white text-xs font-medium"
                >
                  <option>Belgian Dark Chocolate Truffle</option>
                  <option>Red Velvet Cream Cheese</option>
                  <option>Butterscotch Praline</option>
                  <option>Spanish Delight</option>
                  <option>Fresh Pineapple Vanilla</option>
                </select>
                <div className="grid grid-cols-2 gap-1">
                  {(['Eggless', 'With Egg'] as CustomCakeSpec['eggOption'][]).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCakeEgg(opt)}
                      className={`py-2 rounded-xl border text-xs font-semibold ${
                        cakeEgg === opt
                          ? 'border-[#252525] bg-[#252525] text-white'
                          : 'border-neutral-200 bg-white text-neutral-700'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                value={cakeMessage}
                onChange={(e) => setCakeMessage(e.target.value)}
                placeholder="Message on cake (e.g., Happy Birthday Amina!)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 bg-white text-xs"
              />
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white px-3 py-2 rounded-xl border border-dashed border-neutral-300">
                <ImagePlus className="w-4 h-4 text-[#E60023]" />
                <span>{cakeRefPhoto ? 'Reference design uploaded (tap to replace)' : 'Upload reference cake design photo (optional)'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e.target.files?.[0], setCakeRefPhoto)}
                />
              </label>
            </div>
          )}

          {/* Flowers & Gifts Customisation */}
          {product.allowGiftCustomisation && (
            <div className="p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200 space-y-3">
              <div className="text-xs font-bold text-[#E60023] uppercase tracking-wide">
                Recipient &amp; Gift Card Details
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Recipient Full Name"
                  className="px-3 py-2 rounded-xl border border-neutral-300 bg-white text-xs"
                />
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="Recipient +91 Phone"
                  className="px-3 py-2 rounded-xl border border-neutral-300 bg-white text-xs font-mono"
                />
              </div>
              <textarea
                rows={2}
                value={giftMessage}
                onChange={(e) => setGiftMessage(e.target.value)}
                placeholder="Personalised message card text..."
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 bg-white text-xs"
              />
              <div className="grid grid-cols-2 gap-2">
                {(
                  ['Standard Ribbon', 'Premium Keepsake Box (+₹60)'] as GiftCustomisationSpec['packagingTier'][]
                ).map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setPackagingTier(tier)}
                    className={`p-2 rounded-xl border text-xs font-semibold ${
                      packagingTier === tier
                        ? 'border-[#E60023] bg-white text-[#E60023]'
                        : 'border-neutral-200 bg-white text-neutral-700'
                    }`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-neutral-700 cursor-pointer bg-white px-3 py-2 rounded-xl border border-dashed border-neutral-300">
                <ImagePlus className="w-4 h-4 text-[#E60023]" />
                <span>{giftRefPhoto ? 'Gift reference photo attached' : 'Upload custom bouquet/hamper reference photo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e.target.files?.[0], setGiftRefPhoto)}
                />
              </label>
            </div>
          )}
        </div>

        {/* Bottom Quantity + Add Bar */}
        <div className="pt-4 border-t border-neutral-200 flex items-center gap-3">
          <div className="flex items-center border border-neutral-300 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="px-3 py-2.5 text-sm font-bold hover:bg-neutral-100"
            >
              −
            </button>
            <span className="px-3 text-sm font-mono font-bold tabular-nums">{qty}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(product.stockQty || 20, q + 1))}
              className="px-3 py-2.5 text-sm font-bold hover:bg-neutral-100"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white font-bold text-sm tabular-nums transition-colors"
          >
            Add to Cart · ₹{unitPrice * qty}
          </button>
        </div>
      </div>
    </div>
  );
}

export function MarketplaceCatalog({
  onSelectProductForConfig,
  selectedPreBookingSlotId,
  onSelectPreBookingSlotId,
}: {
  onSelectProductForConfig: (product: Product, vendor: Vendor) => void;
  selectedPreBookingSlotId: string | null;
  onSelectPreBookingSlotId: (slotId: string | null) => void;
}) {
  const {
    user,
    bootstrap,
    orders,
    activeCategory,
    setActiveCategory,
    activeVendorId,
    setActiveVendorId,
    toggleFavourite,
    addToCart,
    setCheckoutOpen,
    notify,
  } = useApp();

  const [cuisineFilter, setCuisineFilter] = useState('All');
  const [vegOnly, setVegOnly] = useState(false);
  const [priceFilter, setPriceFilter] = useState<'all' | 'budget' | 'premium'>('all');
  const [groceryAisle, setGroceryAisle] = useState('All');
  const [storeSearch, setStoreSearch] = useState('');
  const [shoppingList, setShoppingList] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(SHOPPING_LIST_KEY);
      return raw ? (JSON.parse(raw) as string[]) : ['Matta Rice 5kg', 'Milma Milk 500ml', 'Red Tomatoes'];
    } catch {
      return [];
    }
  });
  const [newListItem, setNewListItem] = useState('');

  const effectiveCat: ServiceType = activeCategory === 'all' ? 'food' : activeCategory;
  const vendors = bootstrap?.vendors || [];
  const products = bootstrap?.products || [];
  const preBookingSlots = bootstrap?.preBookingSlots || [];

  const saveList = (next: string[]) => {
    setShoppingList(next);
    try {
      localStorage.setItem(SHOPPING_LIST_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const categoryVendors = useMemo(() => {
    return vendors.filter((v) => {
      if (effectiveCat === 'food_prebooking') return v.serviceCategory === 'food' && v.supportsPreBooking;
      return v.serviceCategory === effectiveCat;
    });
  }, [effectiveCat, vendors]);

  const filteredVendors = useMemo(() => {
    return categoryVendors.filter((v) => {
      if (cuisineFilter !== 'All' && !v.cuisinesOrTags.includes(cuisineFilter)) return false;
      if (priceFilter === 'budget' && v.priceLevel > 1) return false;
      if (priceFilter === 'premium' && v.priceLevel < 2) return false;
      return true;
    });
  }, [categoryVendors, cuisineFilter, priceFilter]);

  const activeVendor = useMemo(() => {
    if (activeVendorId) {
      const found = categoryVendors.find((v) => v.id === activeVendorId);
      if (found) return found;
    }
    if (effectiveCat === 'grocery' || effectiveCat === 'bakery' || effectiveCat === 'celebration' || effectiveCat === 'flowers_gifts') {
      return categoryVendors[0] || null;
    }
    return null;
  }, [activeVendorId, categoryVendors, effectiveCat]);

  const vendorProducts = useMemo(() => {
    if (!activeVendor) return [];
    const q = storeSearch.trim().toLowerCase();
    return products.filter((p) => {
      if (p.vendorId !== activeVendor.id) return false;
      if (vegOnly && p.isVeg === false) return false;
      if (effectiveCat === 'grocery' && groceryAisle !== 'All' && p.category !== groceryAisle) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.nameMl && p.nameMl.toLowerCase().includes(q)) &&
        !p.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [activeVendor, effectiveCat, groceryAisle, products, storeSearch, vegOnly]);

  const vendorReviews = useMemo(() => {
    if (!activeVendor) return [];
    return (bootstrap?.reviews || []).filter(
      (r) => r.vendorId === activeVendor.id && r.status === 'published'
    );
  }, [activeVendor, bootstrap?.reviews]);

  const vendorSlots = useMemo(() => {
    if (!activeVendor) return [];
    return preBookingSlots.filter((s) => s.vendorId === activeVendor.id);
  }, [activeVendor, preBookingSlots]);

  const frequentGroceryItems = useMemo(() => {
    const pastIds = new Set(
      orders
        .filter((o) => o.serviceType === 'grocery')
        .flatMap((o) => o.items.map((i) => i.productId))
    );
    return products.filter((p) => p.serviceCategory === 'grocery' && (pastIds.has(p.id) || p.trending));
  }, [orders, products]);

  return (
    <div className="space-y-6 pb-8">
      {/* Dedicated Service Switcher Strip */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {SERVICE_CATEGORIES.map((cat) => {
          const active = effectiveCat === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setActiveCategory(cat.id);
                setActiveVendorId(null);
                setCuisineFilter('All');
                setGroceryAisle('All');
                setStoreSearch('');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors ${
                active
                  ? 'bg-[#252525] text-white border-[#252525]'
                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-[#E60023]'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Pickup & Drop Dedicated Courier Screen */}
      {effectiveCat === 'pickup_drop' ? (
        <PickupDropView />
      ) : (
        <>
          {/* Category Context Header */}
          {effectiveCat === 'celebration' && (
            <div className="p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-[#E60023] shrink-0" />
              <div className="text-xs text-neutral-700">
                <strong className="text-[#252525]">FYOORA Safety-Verified Celebration Store:</strong> Certified safe party decor, biodegradable balloon kits, spring-loaded poppers, and zero restricted hazardous items.
              </div>
            </div>
          )}

          {effectiveCat === 'food_prebooking' && (
            <div className="p-4 rounded-2xl bg-[#252525] text-white flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-[#E60023] uppercase tracking-wide">
                  Food Pre-Booking · Skip the Queue
                </div>
                <p className="text-xs text-neutral-300 mt-1">
                  Pay in advance, reserve a live kitchen pickup window, and collect freshly packed parcels on arrival.
                </p>
              </div>
              <CalendarClock className="w-7 h-7 text-[#E60023] shrink-0" />
            </div>
          )}

          {/* Vendor Listing when multiple stores exist & none selected */}
          {!activeVendor && (
            <div className="space-y-4">
              {effectiveCat === 'food' && (
                <div className="flex flex-wrap items-center gap-2">
                  {['All', 'Malabar', 'Biriyani', 'Arabian', 'Pure Veg'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setCuisineFilter(tag)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                        cuisineFilter === tag
                          ? 'bg-[#E60023] text-white border-[#E60023]'
                          : 'bg-white border-neutral-200 text-neutral-700'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setVegOnly((v) => !v)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                      vegOnly ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-white border-neutral-200'
                    }`}
                  >
                    Pure Veg Filter
                  </button>
                  <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value as 'all' | 'budget' | 'premium')}
                    className="px-3 py-1.5 rounded-xl border border-neutral-200 bg-white text-xs font-semibold"
                  >
                    <option value="all">All Budgets</option>
                    <option value="budget">Budget Friendly (₹)</option>
                    <option value="premium">Mid &amp; Special (₹₹)</option>
                  </select>
                </div>
              )}

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVendors.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setActiveVendorId(v.id)}
                    className="text-left rounded-3xl border border-neutral-200 bg-white overflow-hidden hover:border-[#E60023] transition-colors flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-[#F5F5F5] relative">
                      <img src={v.coverUrl} alt={v.name} className="w-full h-full object-cover" />
                      <div className="absolute bottom-3 left-3 bg-[#252525]/90 text-white px-2.5 py-1 rounded-lg text-[11px] font-semibold">
                        {v.isOpen ? `Prep ${v.avgPrepTimeMins}m` : 'Closed'}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display font-bold text-base text-[#252525]">{v.name}</h3>
                        <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          {v.rating}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500 mt-1">{v.cuisinesOrTags.join(' · ')}</p>
                      <p className="text-[11px] text-neutral-400 mt-1">{v.address}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Store Detail + Catalog */}
          {activeVendor && (
            <div className="space-y-6">
              {categoryVendors.length > 1 && (
                <button
                  type="button"
                  onClick={() => setActiveVendorId(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#252525] hover:text-[#E60023]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>All {SERVICE_CATEGORIES.find((c) => c.id === effectiveCat)?.label} Stores</span>
                </button>
              )}

              {/* Store Hero Card */}
              <div className="rounded-3xl border border-neutral-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <img
                    src={activeVendor.logoUrl}
                    alt={activeVendor.name}
                    className="w-16 h-16 rounded-2xl object-cover shrink-0 border border-neutral-200"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-extrabold text-[#252525]">
                        {activeVendor.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => toggleFavourite(activeVendor.id)}
                        aria-label="Favourite store"
                      >
                        <Heart
                          className={`w-4 h-4 ${
                            user?.favourites.includes(activeVendor.id)
                              ? 'fill-[#E60023] text-[#E60023]'
                              : 'text-neutral-400'
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-neutral-500 mt-0.5">{activeVendor.address}</p>
                    <div className="text-xs font-semibold text-[#252525] mt-1.5 tabular-nums flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {activeVendor.rating} ({activeVendor.reviewCount} reviews)
                      </span>
                      <span>· {activeVendor.openingHours}</span>
                      <span>· Prep ~{activeVendor.avgPrepTimeMins} mins</span>
                      <span className={activeVendor.isOpen ? 'text-emerald-700' : 'text-red-600'}>
                        · {activeVendor.isOpen ? 'Open Now' : 'Currently Closed'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pre-Booking Slot Picker */}
              {effectiveCat === 'food_prebooking' && (
                <div className="rounded-3xl border border-neutral-200 bg-[#F5F5F5] p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-display font-bold text-sm text-[#252525]">
                        1. Choose Your Parcel Pickup Slot
                      </h3>
                      <p className="text-xs text-neutral-500">
                        Capacity-validated windows prevent overbooking at the restaurant counter.
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {vendorSlots.map((slot) => {
                      const remaining = Math.max(0, slot.maxCapacity - slot.bookedCount);
                      const full = remaining === 0;
                      const selected = selectedPreBookingSlotId === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={full}
                          onClick={() => onSelectPreBookingSlotId(slot.id)}
                          className={`p-3 rounded-2xl border text-left transition-colors ${
                            selected
                              ? 'border-[#E60023] bg-white ring-2 ring-[#E60023]/20'
                              : full
                                ? 'border-neutral-200 bg-neutral-100 opacity-60 cursor-not-allowed'
                                : 'border-neutral-200 bg-white hover:border-[#E60023]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-mono font-semibold text-neutral-500">{slot.date}</span>
                            {selected && <Check className="w-4 h-4 text-[#E60023]" />}
                          </div>
                          <div className="font-bold text-xs text-[#252525] mt-1">{slot.timeLabel}</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                            {full ? 'Slot Full' : `${remaining} of ${slot.maxCapacity} slots left`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Separate Grocery Supermarket Features: 10 Aisles + Shopping List + Frequent Buys */}
              {effectiveCat === 'grocery' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    {GROCERY_AISLES.map((aisle) => (
                      <button
                        key={aisle}
                        type="button"
                        onClick={() => setGroceryAisle(aisle)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold whitespace-nowrap ${
                          groceryAisle === aisle
                            ? 'bg-[#E60023] text-white border-[#E60023]'
                            : 'bg-white text-neutral-700 border-neutral-200'
                        }`}
                      >
                        {aisle}
                      </button>
                    ))}
                  </div>

                  <div className="grid lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-6 p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#252525] mb-2">
                        <ListChecks className="w-4 h-4 text-[#E60023]" />
                        <span>My Vadakara Grocery Shopping List</span>
                      </div>
                      <div className="flex gap-2 mb-2.5">
                        <input
                          type="text"
                          value={newListItem}
                          onChange={(e) => setNewListItem(e.target.value)}
                          placeholder="Add item to checklist..."
                          className="flex-1 px-3 py-1.5 rounded-xl border border-neutral-300 bg-white text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!newListItem.trim()) return;
                            saveList([newListItem.trim(), ...shoppingList]);
                            setNewListItem('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#252525] text-white text-xs font-semibold"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {shoppingList.map((item, idx) => (
                          <span
                            key={`${item}-${idx}`}
                            className="inline-flex items-center gap-1.5 bg-white border border-neutral-200 px-2.5 py-1 rounded-lg text-xs"
                          >
                            {item}
                            <button
                              type="button"
                              onClick={() => saveList(shoppingList.filter((_, i) => i !== idx))}
                              className="text-neutral-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="lg:col-span-6 p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#252525] mb-2">
                        <Sparkles className="w-4 h-4 text-[#E60023]" />
                        <span>Repeat Daily Essentials</span>
                      </div>
                      <div className="flex gap-2 overflow-x-auto no-scrollbar">
                        {frequentGroceryItems.slice(0, 4).map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            disabled={!p.inStock}
                            onClick={() =>
                              addToCart({
                                cartItemId: `${p.id}-${Date.now()}`,
                                productId: p.id,
                                vendorId: activeVendor.id,
                                vendorName: activeVendor.name,
                                serviceCategory: 'grocery',
                                name: p.name,
                                imageUrl: p.imageUrl,
                                unitPrice: p.price,
                                quantity: 1,
                              })
                            }
                            className="min-w-[140px] bg-white p-2.5 rounded-xl border border-neutral-200 text-left hover:border-[#E60023] disabled:opacity-50"
                          >
                            <div className="text-xs font-bold text-[#252525] truncate">{p.name}</div>
                            <div className="text-[11px] font-mono font-semibold text-[#E60023] mt-1">
                              + Quick Add ₹{p.price}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* In-Store Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={storeSearch}
                  onChange={(e) => setStoreSearch(e.target.value)}
                  placeholder={`Search items inside ${activeVendor.name}...`}
                  aria-label={`Search items inside ${activeVendor.name}`}
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-neutral-200 bg-white text-xs focus:outline-none focus:border-[#E60023]"
                />
              </div>

              {/* Products Grid */}
              <div className="grid sm:grid-cols-2 gap-4">
                {vendorProducts.length === 0 && (
                  <div className="sm:col-span-2 p-8 rounded-3xl border border-neutral-200 bg-white text-center text-xs text-neutral-500">
                    No matching products found in {activeVendor.name}.
                  </div>
                )}
                {vendorProducts.map((p) => {
                  const out = p.soldOutManual || !p.inStock || p.stockQty <= 0;
                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-3xl border bg-white flex gap-4 justify-between transition-all ${
                        out ? 'border-neutral-200 opacity-75' : 'border-neutral-200 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex-1 min-w-0 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 text-[11px] font-semibold text-neutral-500">
                            {p.isVeg !== undefined && (
                              <span
                                className={`w-2.5 h-2.5 rounded-xs border flex items-center justify-center ${
                                  p.isVeg ? 'border-emerald-700' : 'border-red-700'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    p.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                                  }`}
                                />
                              </span>
                            )}
                            <span>{p.category}</span>
                            {p.unit && <span>· {p.unit}</span>}
                          </div>
                          <h3 className="font-display font-bold text-base text-[#252525] mt-1">{p.name}</h3>
                          {p.nameMl && (
                            <div className="text-xs text-neutral-500 mt-0.5">{p.nameMl}</div>
                          )}
                          <p className="text-xs text-neutral-500 mt-1.5 line-clamp-2">{p.description}</p>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono font-bold text-base text-[#252525] tabular-nums">
                              ₹{p.price}
                            </span>
                            {p.mrp && p.mrp > p.price && (
                              <span className="font-mono text-xs text-neutral-400 line-through tabular-nums">
                                ₹{p.mrp}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium tabular-nums">
                            {out ? (
                              <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                                <AlertCircle className="w-3.5 h-3.5" /> Out of Stock
                              </span>
                            ) : (
                              <span className="text-neutral-500">{p.stockQty} in stock</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-center justify-between shrink-0 w-28">
                        <img
                          src={p.imageUrl}
                          alt={p.name}
                          className="w-28 h-24 rounded-2xl object-cover bg-[#F5F5F5]"
                        />
                        <button
                          type="button"
                          disabled={out}
                          onClick={() => {
                            if (effectiveCat === 'food_prebooking' && !selectedPreBookingSlotId) {
                              notify('Select a pickup time slot above first', 'info');
                            }
                            onSelectProductForConfig(p, activeVendor);
                          }}
                          className="w-full -mt-3 relative z-10 py-2 rounded-xl bg-white border border-[#E60023] text-[#E60023] hover:bg-[#E60023] hover:text-white font-bold text-xs shadow-sm transition-colors disabled:border-neutral-300 disabled:text-neutral-400 disabled:bg-neutral-100"
                        >
                          {out
                            ? 'Unavailable'
                            : p.allowCustomCake
                              ? 'Customise Cake'
                              : p.allowGiftCustomisation
                                ? 'Customise Gift'
                                : 'Add +'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {effectiveCat === 'food_prebooking' && selectedPreBookingSlotId && (
                <div className="p-4 rounded-2xl bg-[#252525] text-white flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className="w-4 h-4 text-[#E60023]" />
                    <span>Pre-booking slot selected. Ready to pay &amp; lock your kitchen queue pass?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(true)}
                    className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-bold"
                  >
                    Review Pre-Book Cart
                  </button>
                </div>
              )}

              {/* Verified Customer Reviews */}
              {vendorReviews.length > 0 && (
                <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-3">
                  <h3 className="font-display font-bold text-sm text-[#252525]">
                    Verified Vadakara Customer Reviews ({vendorReviews.length})
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {vendorReviews.slice(0, 4).map((rev) => (
                      <div key={rev.id} className="p-3.5 rounded-2xl bg-[#F5F5F5] text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#252525]">{rev.customerName}</span>
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-[#252525]">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {rev.rating}/5
                          </span>
                        </div>
                        <p className="text-neutral-600 leading-relaxed">{rev.comment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
