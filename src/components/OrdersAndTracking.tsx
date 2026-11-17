import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  PackageCheck,
  RotateCcw,
  Star,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { apiRequest } from '../lib/api.ts';
import type { Order, SupportTicket } from '../shared/types.ts';
import { VadakaraMap } from './VadakaraMap.tsx';

export function OrdersAndTracking() {
  const { user, orders, bootstrap, health, refreshOrders, addToCart, notify, exitGuestBrowse } = useApp();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<Order | null>(null);
  const [reviewOrder, setReviewOrder] = useState<Order | null>(null);
  const [rating, setRating] = useState(5);
  const [deliveryRating, setDeliveryRating] = useState(5);
  const [comment, setComment] = useState('');

  const [ticketOrder, setTicketOrder] = useState<Order | null>(null);
  const [ticketCategory, setTicketCategory] = useState<SupportTicket['category']>('late_delivery');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');

  const vendors = bootstrap?.vendors || [];
  const activeOrder = orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  const handleCancelOrder = async (ord: Order) => {
    try {
      await apiRequest(`/api/orders/${ord.id}/transition`, {
        method: 'POST',
        json: { status: 'cancelled', note: 'Cancelled by customer' },
      });
      await refreshOrders();
      notify(`Order ${ord.orderNumber} cancelled`, 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to cancel order', 'error');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewOrder) return;
    try {
      await apiRequest(`/api/orders/${reviewOrder.id}/review`, {
        method: 'POST',
        json: { rating, deliveryRating, comment },
      });
      setReviewOrder(null);
      setComment('');
      await refreshOrders();
      notify('Thank you! Your verified review has been published.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to submit review', 'error');
    }
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketOrder) return;
    try {
      await apiRequest('/api/support/tickets', {
        method: 'POST',
        json: {
          orderId: ticketOrder.id,
          category: ticketCategory,
          subject: ticketSubject.trim(),
          description: ticketDesc.trim(),
        },
      });
      setTicketOrder(null);
      setTicketSubject('');
      setTicketDesc('');
      notify('Support ticket created. Check Profile → Support Tickets for replies.', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to open ticket', 'error');
    }
  };

  if (!user) {
    return (
      <div className="p-8 rounded-3xl border border-neutral-200 bg-white text-center space-y-3">
        <div className="text-sm font-semibold text-[#252525]">Sign in required for Orders</div>
        <p className="text-xs text-neutral-500 max-w-sm mx-auto">
          Sign in with verified authentication to view your live Vadakara orders, delivery OTPs, and order history.
        </p>
        <button
          type="button"
          onClick={exitGuestBrowse}
          className="px-5 py-2.5 rounded-xl bg-[#E60023] hover:bg-[#B8001C] text-white text-xs font-bold transition-colors"
        >
          Sign In to FYOORA
        </button>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="p-10 rounded-3xl border border-neutral-200 bg-white text-center space-y-2">
        <PackageCheck className="w-8 h-8 text-neutral-400 mx-auto" />
        <h3 className="font-display font-bold text-base text-[#252525]">No orders placed yet</h3>
        <p className="text-xs text-neutral-500">
          Your Food, Grocery, Bakery, Celebration, and Pickup &amp; Drop orders will appear here with real-time tracking.
        </p>
      </div>
    );
  }

  const vendorObj = activeOrder?.vendorId
    ? vendors.find((v) => v.id === activeOrder.vendorId)
    : undefined;

  return (
    <div className="grid lg:grid-cols-12 gap-6 pb-8">
      {/* Left Order List */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-[#252525]">Your Orders ({orders.length})</h2>
          <button
            type="button"
            onClick={() => refreshOrders()}
            className="text-xs font-semibold text-[#E60023]"
          >
            Refresh
          </button>
        </div>

        {orders.map((ord) => {
          const selected = activeOrder?.id === ord.id;
          return (
            <button
              key={ord.id}
              type="button"
              onClick={() => setSelectedOrderId(ord.id)}
              className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                selected ? 'border-[#E60023] bg-[#E60023]/5' : 'border-neutral-200 bg-white hover:border-neutral-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-neutral-500">{ord.orderNumber}</span>
                <span className="text-xs font-bold text-[#E60023] capitalize">
                  {ord.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="font-display font-bold text-sm text-[#252525] mt-1">
                {ord.vendorName || 'Pickup & Drop Parcel'}
              </div>
              <div className="text-xs text-neutral-500 mt-1 tabular-nums flex items-center justify-between">
                <span>
                  {ord.items.length > 0 ? `${ord.items.length} item(s)` : ord.pickupDropDetails?.parcelDescription}
                </span>
                <span className="font-mono font-bold text-[#252525]">₹{ord.pricing.grandTotal}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right Live Order Tracking Detail */}
      {activeOrder && (
        <div className="lg:col-span-7 bg-white rounded-3xl border border-neutral-200 p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-neutral-200">
            <div>
              <div className="font-mono text-xs font-bold text-[#E60023]">{activeOrder.orderNumber}</div>
              <h3 className="font-display text-xl font-extrabold text-[#252525] mt-0.5">
                {activeOrder.vendorName || 'Vadakara Pickup & Drop'}
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                {new Date(activeOrder.createdAt).toLocaleString()} · {activeOrder.deliveryMode.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-[#252525] uppercase">
                {activeOrder.status.replace(/_/g, ' ')}
              </div>
              <div className="text-[11px] font-semibold text-neutral-600 mt-0.5 uppercase">
                Payment: {activeOrder.paymentStatus} ({activeOrder.paymentMethod.toUpperCase()})
              </div>
              <div className="text-xs text-neutral-500 tabular-nums mt-0.5">
                ETA {activeOrder.etaMinutes.min}–{activeOrder.etaMinutes.max} mins
              </div>
            </div>
          </div>

          {activeOrder.status === 'payment_pending' && !health?.razorpay.configured && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-center gap-2">
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>
                Online Razorpay Checkout is <strong>PENDING CONFIGURATION</strong>. Cancel and reorder with Cash on Delivery, or configure Razorpay keys to verify payment.
              </span>
            </div>
          )}

          {/* Live Route Map */}
          <VadakaraMap
            center={bootstrap?.serviceArea.center}
            radiusKm={bootstrap?.serviceArea.radiusKm}
            heightClass="h-48"
            title="Live Vadakara Delivery Map"
            markers={[
              ...(activeOrder.pickupDropDetails
                ? [
                    {
                      id: 'pk',
                      label: 'Pickup',
                      position: {
                        lat: activeOrder.pickupDropDetails.pickupAddress.lat,
                        lng: activeOrder.pickupDropDetails.pickupAddress.lng,
                      },
                      kind: 'pickup' as const,
                    },
                  ]
                : vendorObj
                  ? [{ id: 'v', label: vendorObj.name, position: vendorObj.location, kind: 'vendor' as const }]
                  : []),
              {
                id: 'dest',
                label: 'Delivery Point',
                position: { lat: activeOrder.deliveryAddress.lat, lng: activeOrder.deliveryAddress.lng },
                kind: 'drop',
              },
            ]}
            routeOrigin={
              activeOrder.pickupDropDetails
                ? {
                    lat: activeOrder.pickupDropDetails.pickupAddress.lat,
                    lng: activeOrder.pickupDropDetails.pickupAddress.lng,
                  }
                : vendorObj?.location
            }
            routeDestination={{
              lat: activeOrder.deliveryAddress.lat,
              lng: activeOrder.deliveryAddress.lng,
            }}
          />

          {/* OTP Verification Codes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#F5F5F5] border border-neutral-200">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase">
                {activeOrder.serviceType === 'pickup_drop' ? 'Sender Pickup OTP' : 'Store Pickup OTP'}
              </div>
              <div className="font-mono font-extrabold text-xl text-[#252525] tabular-nums mt-0.5">
                {activeOrder.pickupOtp}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#F5F5F5] border border-neutral-200">
              <div className="text-[11px] font-semibold text-neutral-500 uppercase">Handover Delivery OTP</div>
              <div className="font-mono font-extrabold text-xl text-[#E60023] tabular-nums mt-0.5">
                {activeOrder.deliveryOtp}
              </div>
            </div>
          </div>

          {activeOrder.riderName && (
            <div className="p-3.5 rounded-2xl border border-neutral-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-neutral-500">Assigned Rider: </span>
                <strong className="text-[#252525]">{activeOrder.riderName}</strong>
              </div>
              <span className="font-mono font-semibold text-[#252525]">{activeOrder.riderPhone}</span>
            </div>
          )}

          {activeOrder.deliveryProofPhotoUrl && (
            <div className="p-3 rounded-2xl border border-neutral-200">
              <div className="text-xs font-bold text-[#252525] mb-2">Rider Delivery Proof Photo</div>
              <img
                src={activeOrder.deliveryProofPhotoUrl}
                alt="Delivery Proof"
                className="w-40 h-28 rounded-xl object-cover"
              />
            </div>
          )}

          {/* Status Timeline */}
          <div>
            <div className="text-xs font-bold text-[#252525] uppercase tracking-wide mb-2.5">
              Order Timeline
            </div>
            <div className="space-y-2">
              {activeOrder.statusHistory.map((h, i) => (
                <div key={`${h.status}-${i}`} className="flex items-start gap-2.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-[#E60023] shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-bold text-[#252525] capitalize">
                      {h.status.replace(/_/g, ' ')}
                      {h.note ? ` — ${h.note}` : ''}
                    </div>
                    <div className="text-[11px] text-neutral-400">
                      {new Date(h.timestamp).toLocaleString()} · by {h.actorRole.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Items & Bill */}
          <div className="p-4 rounded-2xl bg-[#F5F5F5] text-xs space-y-1.5">
            {activeOrder.items.map((it) => (
              <div key={it.cartItemId} className="flex justify-between">
                <span>
                  {it.quantity} × {it.name}
                </span>
                <span className="font-mono tabular-nums">₹{it.unitPrice * it.quantity}</span>
              </div>
            ))}
            {activeOrder.pricing.riderTip > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>Rider Tip</span>
                <span className="font-mono tabular-nums">₹{activeOrder.pricing.riderTip}</span>
              </div>
            )}
            <div className="pt-2 border-t border-neutral-200 flex justify-between font-bold text-sm text-[#252525]">
              <span>Total ({activeOrder.paymentMethod.toUpperCase()})</span>
              <span className="font-mono tabular-nums">₹{activeOrder.pricing.grandTotal}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {!['picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'refunded'].includes(
              activeOrder.status
            ) && (
              <button
                type="button"
                onClick={() => handleCancelOrder(activeOrder)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50"
              >
                <XCircle className="w-3.5 h-3.5" /> Cancel Order
              </button>
            )}
            {activeOrder.status === 'delivered' && !activeOrder.reviewed && (
              <button
                type="button"
                onClick={() => setReviewOrder(activeOrder)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#252525] text-white text-xs font-bold"
              >
                <Star className="w-3.5 h-3.5" /> Rate &amp; Review
              </button>
            )}
            {activeOrder.items.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  activeOrder.items.forEach((it) =>
                    addToCart({ ...it, cartItemId: `${it.productId}-${Date.now()}` })
                  );
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-300 text-xs font-bold"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reorder
              </button>
            )}
            <button
              type="button"
              onClick={() => setInvoiceOrder(activeOrder)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-300 text-xs font-bold"
            >
              <FileText className="w-3.5 h-3.5" /> Tax Invoice
            </button>
            <button
              type="button"
              onClick={() => setTicketOrder(activeOrder)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-neutral-300 text-xs font-bold"
            >
              <HelpCircle className="w-3.5 h-3.5" /> Order Help
            </button>
          </div>
        </div>
      )}

      {/* Tax Invoice Modal */}
      {invoiceOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between border-b border-neutral-200 pb-3">
              <div>
                <div className="text-[11px] font-bold text-[#E60023] uppercase">FYOORA Tax Invoice &amp; Receipt</div>
                <h3 className="font-display font-bold text-lg text-[#252525]">{invoiceOrder.orderNumber}</h3>
                <p className="text-[11px] text-neutral-500">
                  {new Date(invoiceOrder.createdAt).toLocaleString()} · Vadakara, Kozhikode
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceOrder(null)}
                className="text-xs font-bold text-neutral-500 hover:text-[#252525]"
              >
                Close
              </button>
            </div>

            <div className="text-xs space-y-1">
              <div><strong>Customer:</strong> {invoiceOrder.customerName} ({invoiceOrder.customerPhone})</div>
              <div><strong>Partner:</strong> {invoiceOrder.vendorName || 'FYOORA Pickup & Drop Courier'}</div>
              <div><strong>Delivery Point:</strong> {invoiceOrder.deliveryAddress.line1}, {invoiceOrder.deliveryAddress.pincode}</div>
              <div>
                <strong>Payment:</strong> {invoiceOrder.paymentMethod.toUpperCase()} · Status:{' '}
                <span className="uppercase font-semibold">{invoiceOrder.paymentStatus}</span>
                {invoiceOrder.razorpayPaymentId ? ` · Ref: ${invoiceOrder.razorpayPaymentId}` : ''}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#F5F5F5] text-xs space-y-1.5">
              {invoiceOrder.items.length > 0 ? (
                invoiceOrder.items.map((it) => (
                  <div key={it.cartItemId} className="flex justify-between">
                    <span>{it.quantity} × {it.name}</span>
                    <span className="font-mono tabular-nums">₹{it.unitPrice * it.quantity}</span>
                  </div>
                ))
              ) : (
                <div className="flex justify-between">
                  <span>{invoiceOrder.pickupDropDetails?.parcelDescription || 'Courier Delivery'}</span>
                  <span className="font-mono tabular-nums">₹{invoiceOrder.pricing.deliveryFee}</span>
                </div>
              )}
              <div className="border-t border-neutral-200 pt-1.5 space-y-1 text-neutral-600">
                {invoiceOrder.pricing.discount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Coupon Discount ({invoiceOrder.pricing.couponCode})</span>
                    <span className="font-mono tabular-nums">−₹{invoiceOrder.pricing.discount}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span className="font-mono tabular-nums">₹{invoiceOrder.pricing.deliveryFee}</span>
                </div>
                <div className="flex justify-between">
                  <span>Platform Fee</span>
                  <span className="font-mono tabular-nums">₹{invoiceOrder.pricing.platformFee}</span>
                </div>
                {invoiceOrder.pricing.riderTip > 0 && (
                  <div className="flex justify-between">
                    <span>Rider Tip (100% to Rider)</span>
                    <span className="font-mono tabular-nums">₹{invoiceOrder.pricing.riderTip}</span>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-neutral-300 flex justify-between font-bold text-sm text-[#252525]">
                <span>Total Payable</span>
                <span className="font-mono tabular-nums">₹{invoiceOrder.pricing.grandTotal}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full py-2.5 rounded-xl bg-[#252525] text-white text-xs font-bold"
            >
              Print / Save PDF Receipt
            </button>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleReviewSubmit}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-display font-bold text-lg">Review {reviewOrder.orderNumber}</h3>
            <div>
              <label className="text-xs font-semibold block mb-1">Store / Item Rating ({rating}/5)</label>
              <input
                type="range"
                min={1}
                max={5}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full accent-[#E60023]"
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">
                Delivery Experience ({deliveryRating}/5)
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={deliveryRating}
                onChange={(e) => setDeliveryRating(Number(e.target.value))}
                className="w-full accent-[#E60023]"
              />
            </div>
            <textarea
              rows={3}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share feedback on food quality, packaging, or delivery..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReviewOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold"
              >
                Submit Verified Review
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Support Ticket Modal */}
      {ticketOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={handleTicketSubmit}
            className="bg-white rounded-3xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#E60023]" />
              <h3 className="font-display font-bold text-lg">Report Issue · {ticketOrder.orderNumber}</h3>
            </div>
            <select
              value={ticketCategory}
              onChange={(e) => setTicketCategory(e.target.value as SupportTicket['category'])}
              className="w-full px-3 py-2.5 rounded-xl border border-neutral-300 text-xs bg-white"
            >
              <option value="missing_item">Missing Item</option>
              <option value="damaged_product">Damaged Product</option>
              <option value="late_delivery">Late Delivery</option>
              <option value="refund_request">Refund Request</option>
              <option value="pickup_drop_issue">Pickup &amp; Drop Issue</option>
            </select>
            <input
              type="text"
              required
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder="Short summary"
              className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs"
            />
            <textarea
              rows={3}
              required
              value={ticketDesc}
              onChange={(e) => setTicketDesc(e.target.value)}
              placeholder="Describe what happened..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTicketOrder(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-xs font-bold"
              >
                Close
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold"
              >
                Open Ticket
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
