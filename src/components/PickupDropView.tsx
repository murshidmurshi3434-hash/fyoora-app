import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, MapPin, Package, ShieldAlert, Truck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { openRazorpayCheckout } from '../lib/razorpayCheckout.ts';
import type { Order, PaymentMethod, SavedAddress } from '../shared/types.ts';
import { VadakaraMap } from './VadakaraMap.tsx';

const VADAKARA_SPOTS: Omit<SavedAddress, 'id'>[] = [
  {
    label: 'Link Road Bus Stand',
    line1: 'Link Road, Near New Bus Stand, Vadakara',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673101',
    lat: 11.6085,
    lng: 75.5917,
  },
  {
    label: 'Edodi Railway Gate',
    line1: 'Edodi Main Road, Near Railway Station, Vadakara',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673101',
    lat: 11.6058,
    lng: 75.5895,
  },
  {
    label: 'Ashokapuram NH-66',
    line1: 'Ashokapuram Junction, Vadakara',
    city: 'Vadakara',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673104',
    lat: 11.618,
    lng: 75.598,
  },
  {
    label: 'Kozhikode (Outside Zone Test)',
    line1: 'SM Street, Kozhikode City',
    city: 'Kozhikode',
    district: 'Kozhikode',
    state: 'Kerala',
    pincode: '673001',
    lat: 11.2588,
    lng: 75.7804,
  },
];

export function PickupDropView() {
  const { user, bootstrap, health, notify, refreshOrders, setActiveTab, exitGuestBrowse } = useApp();

  const [pickup, setPickup] = useState<SavedAddress>({
    id: 'pd-pickup',
    ...VADAKARA_SPOTS[0],
  });
  const [drop, setDrop] = useState<SavedAddress>({
    id: 'pd-drop',
    ...VADAKARA_SPOTS[2],
  });
  const [activePinMode, setActivePinMode] = useState<'pickup' | 'drop'>('pickup');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [parcelDescription, setParcelDescription] = useState('');
  const [parcelSize, setParcelSize] = useState<'small' | 'medium' | 'large'>('small');
  const [weightKg, setWeightKg] = useState(1.5);
  const [pickupInstructions, setPickupInstructions] = useState('Call on arrival at main gate');
  const [riderTip, setRiderTip] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');
  const [prohibitedAccepted, setProhibitedAccepted] = useState(false);

  const [quote, setQuote] = useState<{
    valid: boolean;
    reason?: string;
    distanceKm: number;
    deliveryFee: number;
    platformFee: number;
    totalFee: number;
    etaMinMins: number;
    etaMaxMins: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookedOrder, setBookedOrder] = useState<Order | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const q = await apiRequest<typeof quote>('/api/pickup-drop/quote', {
          method: 'POST',
          json: {
            pickup: { lat: pickup.lat, lng: pickup.lng },
            drop: { lat: drop.lat, lng: drop.lng },
            size: parcelSize,
            weightKg,
          },
        });
        if (active) setQuote(q);
      } catch {
        // ignore
      }
    })();
    return () => {
      active = false;
    };
  }, [drop.lat, drop.lng, parcelSize, pickup.lat, pickup.lng, weightKg]);

  const handleBookParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      exitGuestBrowse();
      notify('Please sign in with verified authentication to book a Pickup & Drop parcel.', 'info');
      return;
    }
    if (!quote?.valid) {
      notify(quote?.reason || 'Both pickup and drop must be inside Vadakara active zone.', 'error');
      return;
    }
    if (!recipientName.trim() || !recipientPhone.trim() || !parcelDescription.trim()) {
      notify('Please fill recipient name, phone, and parcel description.', 'error');
      return;
    }
    if (!prohibitedAccepted) {
      notify('Please confirm the prohibited items declaration.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<{
        order: Order;
        razorpayConfigured?: boolean;
        razorpayKeyId?: string;
      }>('/api/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': `pd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
        json: {
          serviceType: 'pickup_drop',
          deliveryTier: 'NORMAL',
          deliveryMode: 'instant',
          paymentMethod,
          riderTip,
          riderInstructions: [pickupInstructions],
          pickupDropDetails: {
            pickupAddress: pickup,
            dropAddress: drop,
            recipientName: recipientName.trim(),
            recipientPhone: recipientPhone.trim(),
            parcelDescription: parcelDescription.trim(),
            parcelSize,
            weightKg,
            pickupInstructions: pickupInstructions.trim(),
            prohibitedPolicyAccepted: prohibitedAccepted,
          },
        },
      });
      if (paymentMethod !== 'cod' && res.razorpayConfigured && res.razorpayKeyId) {
        const payOutcome = await openRazorpayCheckout({
          order: res.order,
          keyId: res.razorpayKeyId,
          user,
        });
        setBookedOrder(payOutcome.order || res.order);
        await refreshOrders();
        notify(
          payOutcome.verified
            ? `Payment verified & Parcel ${res.order.orderNumber} booked!`
            : payOutcome.message || `Parcel ${res.order.orderNumber} created (awaiting payment).`,
          payOutcome.verified ? 'success' : 'info'
        );
      } else {
        setBookedOrder(res.order);
        await refreshOrders();
        notify(`Parcel ${res.order.orderNumber} booked!`, 'success');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to book parcel.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (bookedOrder) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-3xl border border-neutral-200 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-[#E60023]">{bookedOrder.orderNumber}</div>
            <h2 className="font-display text-xl font-bold text-[#252525]">
              Pickup &amp; Drop Courier Booked
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200 text-center">
            <div className="text-[11px] font-semibold text-neutral-500 uppercase">Sender Pickup OTP</div>
            <div className="font-mono font-extrabold text-2xl text-[#252525] tabular-nums mt-1">
              {bookedOrder.pickupOtp}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Share with rider at pickup</div>
          </div>
          <div className="p-4 rounded-2xl bg-[#F5F5F5] border border-neutral-200 text-center">
            <div className="text-[11px] font-semibold text-neutral-500 uppercase">Recipient Delivery OTP</div>
            <div className="font-mono font-extrabold text-2xl text-[#E60023] tabular-nums mt-1">
              {bookedOrder.deliveryOtp}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">Share with recipient for handover</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl border border-neutral-200 text-xs space-y-1.5">
          <div>
            <strong>Assigned Rider:</strong> {bookedOrder.riderName || 'Dispatching nearest rider'} ({bookedOrder.riderPhone || 'Pending'})
          </div>
          <div>
            <strong>Distance &amp; ETA:</strong> {bookedOrder.distanceKm.toFixed(1)} km · {bookedOrder.etaMinutes.min}–{bookedOrder.etaMinutes.max} mins
          </div>
          <div>
            <strong>Total Fare:</strong> ₹{bookedOrder.pricing.grandTotal} ({bookedOrder.paymentMethod.toUpperCase()})
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className="flex-1 py-3 rounded-xl bg-[#252525] text-white font-semibold text-sm"
          >
            Track Live Parcel
          </button>
          <button
            type="button"
            onClick={() => setBookedOrder(null)}
            className="px-4 py-3 rounded-xl border border-neutral-300 text-sm font-semibold"
          >
            Send Another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-7 space-y-5">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-extrabold text-[#252525]">
                Vadakara Pickup &amp; Drop Courier
              </h2>
              <p className="text-xs text-neutral-500">
                Any registered FYOORA customer can send documents, keys, tiffins, or parcels anywhere inside the Vadakara active zone.
              </p>
            </div>
            <Package className="w-6 h-6 text-[#E60023] shrink-0" />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActivePinMode('pickup')}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold ${
                activePinMode === 'pickup'
                  ? 'border-[#252525] bg-[#252525] text-white'
                  : 'border-neutral-200 text-neutral-600'
              }`}
            >
              Adjust Pickup Pin on Map
            </button>
            <button
              type="button"
              onClick={() => setActivePinMode('drop')}
              className={`flex-1 py-2 rounded-xl border text-xs font-bold ${
                activePinMode === 'drop'
                  ? 'border-[#E60023] bg-[#E60023] text-white'
                  : 'border-neutral-200 text-neutral-600'
              }`}
            >
              Adjust Drop Pin on Map
            </button>
          </div>

          <VadakaraMap
            center={bootstrap?.serviceArea.center}
            radiusKm={bootstrap?.serviceArea.radiusKm}
            heightClass="h-56"
            title="Pickup → Drop Route"
            markers={[
              { id: 'pk', label: 'Pickup', position: { lat: pickup.lat, lng: pickup.lng }, kind: 'pickup' },
              { id: 'dp', label: 'Drop', position: { lat: drop.lat, lng: drop.lng }, kind: 'drop' },
            ]}
            routeOrigin={{ lat: pickup.lat, lng: pickup.lng }}
            routeDestination={{ lat: drop.lat, lng: drop.lng }}
            onSelectPoint={(pt) => {
              if (activePinMode === 'pickup') {
                setPickup((prev) => ({
                  ...prev,
                  lat: pt.lat,
                  lng: pt.lng,
                  line1: `Custom Vadakara Pin (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)})`,
                }));
              } else {
                setDrop((prev) => ({
                  ...prev,
                  lat: pt.lat,
                  lng: pt.lng,
                  line1: `Custom Vadakara Pin (${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)})`,
                }));
              }
            }}
          />

          {/* Quick Pickers for Pickup & Drop */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[#252525] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#252525]" /> Pickup Point
              </label>
              <select
                value={pickup.line1}
                onChange={(e) => {
                  const found = VADAKARA_SPOTS.find((s) => s.line1 === e.target.value);
                  if (found) setPickup({ id: 'pd-pickup', ...found });
                }}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs bg-white"
              >
                {VADAKARA_SPOTS.map((s) => (
                  <option key={`pk-${s.label}`} value={s.line1}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={pickup.line1}
                onChange={(e) => setPickup((p) => ({ ...p, line1: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[#E60023] flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#E60023]" /> Drop Point
              </label>
              <select
                value={drop.line1}
                onChange={(e) => {
                  const found = VADAKARA_SPOTS.find((s) => s.line1 === e.target.value);
                  if (found) setDrop({ id: 'pd-drop', ...found });
                }}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs bg-white"
              >
                {VADAKARA_SPOTS.map((s) => (
                  <option key={`dp-${s.label}`} value={s.line1}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={drop.line1}
                onChange={(e) => setDrop((d) => ({ ...d, line1: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-neutral-200 text-xs"
              />
            </div>
          </div>

          {quote && !quote.valid && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{quote.reason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Right Parcel Details & Quote Summary */}
      <form onSubmit={handleBookParcel} className="lg:col-span-5 space-y-4">
        <div className="rounded-3xl border border-neutral-200 bg-white p-5 space-y-4">
          <h3 className="font-display font-bold text-base text-[#252525]">Parcel &amp; Recipient Details</h3>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Recipient Name *</label>
              <input
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g. Ashraf K"
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Recipient Mobile *</label>
              <input
                type="tel"
                required
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+91 9847..."
                className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">What are you sending? *</label>
            <input
              type="text"
              required
              value={parcelDescription}
              onChange={(e) => setParcelDescription(e.target.value)}
              placeholder="e.g. House keys & signed documents envelope"
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['small', 'medium', 'large'] as const).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => setParcelSize(sz)}
                className={`py-2 rounded-xl border text-xs font-bold capitalize ${
                  parcelSize === sz
                    ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                    : 'border-neutral-200 text-neutral-700'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-neutral-700 mb-1">
              <span>Estimated Weight</span>
              <span className="font-mono tabular-nums">{weightKg} kg (max 15 kg)</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={15}
              step={0.5}
              value={weightKg}
              onChange={(e) => setWeightKg(Number(e.target.value))}
              className="w-full accent-[#E60023]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-600 mb-1">Pickup Instructions for Rider</label>
            <input
              type="text"
              value={pickupInstructions}
              onChange={(e) => setPickupInstructions(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
            />
          </div>

          {/* Optional Rider Tip */}
          <div>
            <div className="text-[11px] font-semibold text-neutral-600 mb-1.5">Optional Rider Tip (100% to rider)</div>
            <div className="flex gap-1.5">
              {[0, 10, 20, 30, 50].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setRiderTip(amt)}
                  className={`flex-1 py-1.5 rounded-xl border text-xs font-mono font-bold ${
                    riderTip === amt
                      ? 'border-[#252525] bg-[#252525] text-white'
                      : 'border-neutral-200 text-neutral-700'
                  }`}
                >
                  {amt === 0 ? 'None' : `₹${amt}`}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 text-[11px] text-neutral-600 bg-[#F5F5F5] p-3 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={prohibitedAccepted}
              onChange={(e) => setProhibitedAccepted(e.target.checked)}
              className="mt-0.5 accent-[#E60023]"
            />
            <span>
              <ShieldAlert className="w-3.5 h-3.5 inline text-[#E60023] mr-1" />
              I confirm this parcel contains no illegal, hazardous, flammable, perishable biological, or restricted items under FYOORA courier policy.
            </span>
          </label>

          {/* Fare Breakdown */}
          {quote && quote.valid && (
            <div className="p-4 rounded-2xl bg-[#F5F5F5] space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Route Distance &amp; ETA</span>
                <span className="font-mono font-semibold text-[#252525] tabular-nums">
                  {quote.distanceKm.toFixed(1)} km · {quote.etaMinMins}–{quote.etaMaxMins} mins
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Courier Delivery Fee</span>
                <span className="font-mono tabular-nums">₹{quote.deliveryFee}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Platform Fee</span>
                <span className="font-mono tabular-nums">₹{quote.platformFee}</span>
              </div>
              {riderTip > 0 && (
                <div className="flex justify-between text-neutral-600">
                  <span>Rider Tip</span>
                  <span className="font-mono tabular-nums">₹{riderTip}</span>
                </div>
              )}
              <div className="pt-2 border-t border-neutral-200 flex justify-between font-bold text-sm text-[#252525]">
                <span>Total Payable</span>
                <span className="font-mono tabular-nums">₹{quote.totalFee + riderTip}</span>
              </div>
            </div>
          )}

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('cod')}
              className={`py-2.5 rounded-xl border text-xs font-bold ${
                paymentMethod === 'cod'
                  ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                  : 'border-neutral-200'
              }`}
            >
              Pay on Pickup / COD
            </button>
            <button
              type="button"
              disabled={!health?.razorpay.configured}
              onClick={() => setPaymentMethod('razorpay_upi')}
              className={`py-2.5 px-2 rounded-xl border text-xs font-bold disabled:opacity-60 ${
                paymentMethod === 'razorpay_upi'
                  ? 'border-[#E60023] bg-[#E60023]/5 text-[#E60023]'
                  : 'border-neutral-200'
              }`}
            >
              Razorpay UPI {!health?.razorpay.configured ? '(PENDING CONFIGURATION)' : ''}
            </button>
          </div>
          {health?.razorpay && !health.razorpay.webhookConfigured && (
            <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Razorpay Webhook: <strong>{health.razorpay.webhookStatusLabel || 'PENDING CONFIGURATION'}</strong>
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !quote?.valid}
            className="w-full py-3.5 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            <Truck className="w-4 h-4" />
            <span>
              {!user
                ? 'Sign In to Book Pickup & Drop'
                : submitting
                  ? 'Dispatching Rider...'
                  : 'Book Vadakara Pickup & Drop'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
