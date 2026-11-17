import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Tag,
  X,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { openRazorpayCheckout } from '../lib/razorpayCheckout.ts';
import type { DeliveryTier, Order, PaymentMethod, ServiceType } from '../shared/types.ts';

interface DeliveryQuoteItem {
  feasible: boolean;
  reason?: string;
  tier: DeliveryTier;
  deliveryFee: number;
  platformFee: number;
  etaMinMins: number;
  etaMaxMins: number;
}

const RIDER_CHIPS = [
  'Call on arrival',
  'Leave at main gate',
  'Do not ring doorbell',
  'Hand over to security',
];

export function CartCheckoutModal({
  selectedPreBookingSlotId,
}: {
  selectedPreBookingSlotId: string | null;
}) {
  const {
    user,
    cart,
    health,
    bootstrap,
    selectedAddress,
    checkoutOpen,
    setCheckoutOpen,
    updateCartQty,
    clearCart,
    refreshOrders,
    setActiveTab,
    exitGuestBrowse,
    notify,
  } = useApp();

  const [deliveryMode, setDeliveryMode] = useState<'instant' | 'scheduled' | 'prebooking_pickup'>(
    selectedPreBookingSlotId ? 'prebooking_pickup' : 'instant'
  );
  const [scheduledDate, setScheduledDate] = useState(
    new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  );
  const [scheduledSlot, setScheduledSlot] = useState('10:00 AM - 11:00 AM');
  const [deliveryTier, setDeliveryTier] = useState<DeliveryTier>('NORMAL');
  const [quotes, setQuotes] = useState<DeliveryQuoteItem[]>([]);
  const [insideArea, setInsideArea] = useState(true);
  const [areaReason, setAreaReason] = useState<string | undefined>();

  const [riderInstructions, setRiderInstructions] = useState<string[]>(['Call on arrival']);
  const [riderCustomNote, setRiderCustomNote] = useState('');
  const [replacementPolicy, setReplacementPolicy] = useState<'call_me' | 'best_replacement' | 'refund_item'>('call_me');

  const [riderTip, setRiderTip] = useState(0);
  const [customTip, setCustomTip] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (selectedPreBookingSlotId) {
      setDeliveryMode('prebooking_pickup');
    }
  }, [selectedPreBookingSlotId]);

  const itemsSubtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const primaryVendorId = cart[0]?.vendorId;
  const isGroceryCart = cart[0]?.serviceCategory === 'grocery';
  const orderServiceType: ServiceType =
    deliveryMode === 'prebooking_pickup'
      ? 'food_prebooking'
      : (cart[0]?.serviceCategory || 'food');

  useEffect(() => {
    if (!checkoutOpen || cart.length === 0 || !primaryVendorId) return;
    let active = true;
    (async () => {
      try {
        const res = await apiRequest<{
          insideServiceArea: boolean;
          areaReason?: string;
          quotes: DeliveryQuoteItem[];
        }>('/api/delivery/quote', {
          method: 'POST',
          json: {
            vendorId: primaryVendorId,
            lat: selectedAddress.lat,
            lng: selectedAddress.lng,
            itemsSubtotal,
          },
        });
        if (!active) return;
        setInsideArea(res.insideServiceArea);
        setAreaReason(res.areaReason);
        setQuotes(res.quotes);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [cart.length, checkoutOpen, itemsSubtotal, primaryVendorId, selectedAddress.lat, selectedAddress.lng]);

  if (!checkoutOpen) return null;

  const activeQuote = quotes.find((q) => q.tier === deliveryTier);
  const deliveryFee =
    deliveryMode === 'prebooking_pickup' ? 0 : activeQuote?.deliveryFee ?? 25;
  const platformFee = activeQuote?.platformFee ?? 5;
  const effectiveTip = customTip ? Math.max(0, Number(customTip) || 0) : riderTip;
  const discount = appliedCoupon?.discount || 0;
  const grandTotal = Math.max(1, itemsSubtotal - discount + deliveryFee + platformFee + effectiveTip);

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    try {
      const res = await apiRequest<{ valid: boolean; discountAmount: number; coupon: { code: string } }>(
        '/api/coupons/validate',
        {
          method: 'POST',
          json: {
            code: couponInput.trim(),
            subtotal: itemsSubtotal,
            serviceType: orderServiceType,
          },
        }
      );
      setAppliedCoupon({ code: res.coupon.code, discount: res.discountAmount });
      notify(`Coupon ${res.coupon.code} applied (-₹${res.discountAmount})`, 'success');
    } catch (err) {
      setAppliedCoupon(null);
      notify(err instanceof Error ? err.message : 'Coupon invalid', 'error');
    }
  };

  const handlePlaceOrder = async () => {
    if (!user) {
      setCheckoutOpen(false);
      exitGuestBrowse();
      notify('Please sign in with verified authentication to place your order.', 'info');
      return;
    }
    if (cart.length === 0) return;
    if (deliveryMode !== 'prebooking_pickup' && !insideArea) {
      notify(areaReason || 'Selected address is outside Vadakara service zone.', 'error');
      return;
    }
    if (deliveryMode === 'prebooking_pickup' && !selectedPreBookingSlotId) {
      notify('Please select a pickup slot in Food Pre-Booking first.', 'error');
      return;
    }

    setPlacing(true);
    try {
      const res = await apiRequest<{
        order: Order;
        razorpayConfigured?: boolean;
        razorpayKeyId?: string;
      }>('/api/orders', {
        method: 'POST',
        headers: {
          'Idempotency-Key': `ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        },
        json: {
          serviceType: orderServiceType,
          items: cart,
          deliveryAddress: selectedAddress,
          deliveryTier,
          deliveryMode,
          scheduledDate: deliveryMode === 'scheduled' ? scheduledDate : undefined,
          scheduledSlot: deliveryMode === 'scheduled' ? scheduledSlot : undefined,
          preBookingSlotId: deliveryMode === 'prebooking_pickup' ? selectedPreBookingSlotId : undefined,
          riderInstructions,
          riderCustomNote: riderCustomNote.trim() || undefined,
          unavailableReplacementPolicy: isGroceryCart ? replacementPolicy : undefined,
          couponCode: appliedCoupon?.code,
          riderTip: effectiveTip,
          paymentMethod,
        },
      });
      clearCart();
      setCheckoutOpen(false);

      if (paymentMethod !== 'cod' && res.razorpayConfigured && res.razorpayKeyId) {
        const payOutcome = await openRazorpayCheckout({
          order: res.order,
          keyId: res.razorpayKeyId,
          user,
        });
        await refreshOrders();
        setActiveTab('orders');
        notify(
          payOutcome.verified
            ? `Payment verified! Order ${res.order.orderNumber} confirmed.`
            : payOutcome.message || `Order ${res.order.orderNumber} created (awaiting payment).`,
          payOutcome.verified ? 'success' : 'info'
        );
      } else {
        await refreshOrders();
        setActiveTab('orders');
        notify(`Order ${res.order.orderNumber} placed successfully!`, 'success');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Order placement failed.', 'error');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end">
      <div className="bg-white w-full max-w-lg h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#E60023]" />
            <div>
              <h2 className="font-display font-bold text-base text-[#252525]">FYOORA Checkout</h2>
              <p className="text-[11px] text-neutral-500">
                {cart[0]?.vendorName || 'Your Cart'} · {selectedAddress.label}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCheckoutOpen(false)}
            className="p-2 rounded-xl hover:bg-neutral-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-sm text-neutral-500">
              Your cart is empty. Browse Vadakara restaurants, bakeries, or grocery items to get started.
            </div>
          ) : (
            <>
              {!insideArea && deliveryMode !== 'prebooking_pickup' && (
                <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{areaReason || 'Address outside active Vadakara delivery zone.'}</span>
                </div>
              )}

              {/* Cart Items */}
              <div className="space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.cartItemId}
                    className="p-3.5 rounded-2xl border border-neutral-200 flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#252525]">{item.name}</div>
                      {item.selectedVariation && (
                        <div className="text-[11px] text-neutral-500">{item.selectedVariation.name}</div>
                      )}
                      {item.selectedAddons && item.selectedAddons.length > 0 && (
                        <div className="text-[11px] text-neutral-500">
                          + {item.selectedAddons.map((a) => a.name).join(', ')}
                        </div>
                      )}
                      {item.kitchenInstructions && item.kitchenInstructions.length > 0 && (
                        <div className="text-[11px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded mt-1 inline-block">
                          Kitchen: {item.kitchenInstructions.join(', ')}
                          {item.kitchenCustomNote ? ` · ${item.kitchenCustomNote}` : ''}
                        </div>
                      )}
                      {item.customCake && (
                        <div className="text-[11px] text-[#E60023] mt-1">
                          Cake: {item.customCake.size} · {item.customCake.flavour} · {item.customCake.eggOption}
                          {item.customCake.messageOnCake ? ` · "${item.customCake.messageOnCake}"` : ''}
                        </div>
                      )}
                      {item.giftCustomisation && (
                        <div className="text-[11px] text-[#E60023] mt-1">
                          For {item.giftCustomisation.recipientName} · {item.giftCustomisation.packagingTier}
                        </div>
                      )}
                      <div className="font-mono font-bold text-xs text-[#252525] mt-1.5 tabular-nums">
                        ₹{item.unitPrice * item.quantity}
                      </div>
                    </div>

                    <div className="flex items-center border border-neutral-300 rounded-xl overflow-hidden shrink-0">
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.cartItemId, -1)}
                        className="p-2 hover:bg-neutral-100"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2.5 text-xs font-mono font-bold tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateCartQty(item.cartItemId, 1)}
                        className="p-2 hover:bg-neutral-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Delivery Mode */}
              <div>
                <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                  Delivery / Pickup Schedule
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'instant', label: 'Instant', icon: Zap },
                    { id: 'scheduled', label: 'Scheduled', icon: CalendarClock },
                    { id: 'prebooking_pickup', label: 'Self-Pickup', icon: Clock },
                  ].map((m) => {
                    const Icon = m.icon;
                    const disabled = m.id === 'prebooking_pickup' && !selectedPreBookingSlotId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDeliveryMode(m.id as typeof deliveryMode)}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 disabled:opacity-45 ${
                          deliveryMode === m.id
                            ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                            : 'border-neutral-200 text-neutral-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {deliveryMode === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-2 mt-2.5">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                    />
                    <select
                      value={scheduledSlot}
                      onChange={(e) => setScheduledSlot(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-neutral-300 text-xs bg-white"
                    >
                      <option>08:00 AM - 09:00 AM</option>
                      <option>10:00 AM - 11:00 AM</option>
                      <option>01:00 PM - 02:00 PM</option>
                      <option>05:00 PM - 06:00 PM</option>
                      <option>07:30 PM - 08:30 PM</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Delivery Tiers: Express, Normal, Eco */}
              {deliveryMode !== 'prebooking_pickup' && quotes.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                    Delivery Speed Tier
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {quotes.map((q) => {
                      const active = deliveryTier === q.tier;
                      return (
                        <button
                          key={q.tier}
                          type="button"
                          disabled={!q.feasible}
                          onClick={() => setDeliveryTier(q.tier)}
                          className={`p-3 rounded-2xl border text-left transition-colors disabled:opacity-45 ${
                            active
                              ? 'border-[#E60023] bg-[#E60023]/5'
                              : 'border-neutral-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-extrabold text-[#252525]">{q.tier}</span>
                            {q.tier === 'ECO' && <Leaf className="w-3.5 h-3.5 text-emerald-700" />}
                          </div>
                          {q.feasible ? (
                            <>
                              <div className="font-mono font-bold text-xs text-[#E60023] mt-1 tabular-nums">
                                {q.deliveryFee === 0 ? 'FREE' : `₹${q.deliveryFee}`}
                              </div>
                              <div className="text-[11px] text-neutral-500 mt-0.5 tabular-nums">
                                {q.etaMinMins}–{q.etaMaxMins} mins
                              </div>
                            </>
                          ) : (
                            <div className="text-[10px] text-red-600 mt-1 leading-tight">
                              Unavailable
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Grocery Item Replacement Policy */}
              {isGroceryCart && (
                <div className="p-3.5 rounded-2xl bg-[#F5F5F5] border border-neutral-200 space-y-2">
                  <div className="text-xs font-bold text-[#252525]">
                    If an item becomes unavailable during packing:
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'call_me', label: 'Call for Approval' },
                      { id: 'best_replacement', label: 'Best Equivalent' },
                      { id: 'refund_item', label: 'Refund Item' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setReplacementPolicy(opt.id as typeof replacementPolicy)}
                        className={`py-2 px-2 rounded-xl border text-[11px] font-semibold ${
                          replacementPolicy === opt.id
                            ? 'border-[#E60023] bg-white text-[#E60023]'
                            : 'border-neutral-200 bg-white text-neutral-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Separate Rider Delivery Instructions */}
              {deliveryMode !== 'prebooking_pickup' && (
                <div>
                  <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                    Rider Delivery Instructions
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {RIDER_CHIPS.map((chip) => {
                      const active = riderInstructions.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          onClick={() =>
                            setRiderInstructions((prev) =>
                              prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium ${
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
                    value={riderCustomNote}
                    onChange={(e) => setRiderCustomNote(e.target.value)}
                    placeholder="Gate landmark or rider directions..."
                    className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                  />
                </div>
              )}

              {/* Optional Rider Tip */}
              {deliveryMode !== 'prebooking_pickup' && (
                <div>
                  <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2">
                    Optional Rider Tip (100% goes to Rider)
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {[0, 10, 20, 30, 50].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setRiderTip(amt);
                          setCustomTip('');
                        }}
                        className={`py-2 rounded-xl border text-xs font-mono font-bold ${
                          !customTip && riderTip === amt
                            ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                            : 'border-neutral-200'
                        }`}
                      >
                        {amt === 0 ? 'None' : `₹${amt}`}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={0}
                      placeholder="Custom"
                      value={customTip}
                      onChange={(e) => setCustomTip(e.target.value)}
                      className="col-span-2 px-2 py-2 rounded-xl border border-neutral-200 text-xs font-mono text-center"
                    />
                  </div>
                </div>
              )}

              {/* Coupon */}
              <div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Coupon code (try VADAKARA50)"
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono uppercase"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    className="px-4 py-2.5 rounded-xl bg-[#252525] text-white text-xs font-bold"
                  >
                    Apply
                  </button>
                </div>
                {bootstrap?.coupons && bootstrap.coupons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {bootstrap.coupons.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCouponInput(c.code)}
                        className="text-[11px] font-mono font-semibold text-[#E60023] bg-[#E60023]/5 border border-[#E60023]/20 px-2 py-0.5 rounded"
                      >
                        {c.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#252525] uppercase tracking-wide">
                  Payment Method
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cod')}
                    className={`p-3 rounded-xl border text-left text-xs font-bold ${
                      paymentMethod === 'cod'
                        ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                        : 'border-neutral-200'
                    }`}
                  >
                    Cash on Delivery (COD)
                  </button>
                  <button
                    type="button"
                    disabled={!health?.razorpay.configured}
                    onClick={() => setPaymentMethod('razorpay_upi')}
                    className={`p-3 rounded-xl border text-left text-xs font-bold disabled:opacity-60 ${
                      paymentMethod === 'razorpay_upi'
                        ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                        : 'border-neutral-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span>
                        <CreditCard className="w-3.5 h-3.5 inline mr-1" />
                        Razorpay UPI / Card
                      </span>
                      {!health?.razorpay.configured && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-extrabold">
                          PENDING CONFIGURATION
                        </span>
                      )}
                    </div>
                  </button>
                </div>
                {!health?.razorpay.configured ? (
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Razorpay Checkout &amp; Webhook: <strong>PENDING CONFIGURATION</strong>. Online payments activate automatically once Razorpay credentials are added; Cash on Delivery works immediately.
                  </p>
                ) : !health?.razorpay.webhookConfigured ? (
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Razorpay Webhook verification (<span className="font-mono">/api/webhooks/razorpay</span>):{' '}
                    <strong>{health.razorpay.webhookStatusLabel || 'PENDING CONFIGURATION'}</strong>.
                  </p>
                ) : null}
              </div>

              {/* Bill Summary */}
              <div className="p-4 rounded-2xl bg-[#F5F5F5] space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Items Subtotal</span>
                  <span className="font-mono tabular-nums">₹{itemsSubtotal}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Coupon ({appliedCoupon?.code})</span>
                    <span className="font-mono tabular-nums">−₹{discount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-600">Delivery Fee ({deliveryMode === 'prebooking_pickup' ? 'Self-Pickup' : deliveryTier})</span>
                  <span className="font-mono tabular-nums">{deliveryFee === 0 ? 'FREE' : `₹${deliveryFee}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-600">Platform Fee</span>
                  <span className="font-mono tabular-nums">₹{platformFee}</span>
                </div>
                {effectiveTip > 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-600">Rider Tip</span>
                    <span className="font-mono tabular-nums">₹{effectiveTip}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-neutral-200 flex justify-between font-bold text-sm text-[#252525]">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">₹{grandTotal}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer CTA */}
        {cart.length > 0 && (
          <div className="p-4 border-t border-neutral-200 bg-white">
            <button
              type="button"
              disabled={placing || (deliveryMode !== 'prebooking_pickup' && !insideArea)}
              onClick={handlePlaceOrder}
              className="w-full py-3.5 rounded-2xl bg-[#E60023] hover:bg-[#B8001C] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span className="tabular-nums">
                {!user
                  ? `Sign In to Place Order · ₹${grandTotal}`
                  : placing
                    ? 'Confirming Order...'
                    : `Place Order · ₹${grandTotal}`}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
