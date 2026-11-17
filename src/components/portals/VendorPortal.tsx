import { useEffect, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LogOut,
  PackagePlus,
  Store,
  Wallet,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type {
  Order,
  OrderStatus,
  PreBookingSlot,
  Product,
  SettlementRecord,
  Vendor,
} from '../../shared/types.ts';

interface VendorDashPayload {
  vendors: Vendor[];
  products: Product[];
  orders: Order[];
  preBookingSlots: PreBookingSlot[];
  settlements: SettlementRecord[];
}

export function VendorPortal() {
  const { user, logout, setActivePortal, notify } = useApp();
  const [data, setData] = useState<VendorDashPayload | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [tab, setTab] = useState<'orders' | 'catalog' | 'prebooking' | 'payouts'>('orders');

  // Add Product form
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('Specials');
  const [newPrice, setNewPrice] = useState('180');
  const [newStock, setNewStock] = useState('25');

  // Add Pre-booking Slot form
  const [slotDate, setSlotDate] = useState(new Date().toISOString().slice(0, 10));
  const [slotTime, setSlotTime] = useState('08:00 PM - 08:30 PM');
  const [slotCap, setSlotCap] = useState('12');

  const loadDash = async () => {
    try {
      const res = await apiRequest<VendorDashPayload>('/api/vendor/dashboard');
      setData(res);
      if (!selectedVendorId && res.vendors[0]) {
        setSelectedVendorId(res.vendors[0].id);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load vendor dashboard', 'error');
    }
  };

  useEffect(() => {
    void loadDash();
  }, [user?.id]);

  if (!data) {
    return <div className="p-8 text-center text-sm text-neutral-500">Loading FYOORA Partner Dashboard...</div>;
  }

  const activeVendor = data.vendors.find((v) => v.id === selectedVendorId) || data.vendors[0];
  const vendorProducts = data.products.filter((p) => p.vendorId === activeVendor?.id);
  const vendorOrders = data.orders.filter(
    (order) =>
      order.vendorId === activeVendor?.id ||
      order.subOrders.some((subOrder) => subOrder.vendorId === activeVendor?.id)
  );
  const getVendorSubOrder = (order: Order) =>
    order.subOrders.find((subOrder) => subOrder.vendorId === activeVendor?.id);
  const vendorSlots = data.preBookingSlots.filter((s) => s.vendorId === activeVendor?.id);

  const toggleOpen = async () => {
    if (!activeVendor) return;
    await apiRequest(`/api/vendor/store/${activeVendor.id}`, {
      method: 'PATCH',
      json: { isOpen: !activeVendor.isOpen },
    });
    await loadDash();
    notify(`${activeVendor.name} marked ${!activeVendor.isOpen ? 'OPEN' : 'CLOSED'}`, 'success');
  };

  const updatePrepTime = async (mins: number) => {
    if (!activeVendor) return;
    await apiRequest(`/api/vendor/store/${activeVendor.id}`, {
      method: 'PATCH',
      json: { avgPrepTimeMins: mins },
    });
    await loadDash();
    notify(`Prep time updated to ${mins} mins`, 'success');
  };

  const transitionOrder = async (orderId: string, status: OrderStatus) => {
    if (!activeVendor) return;
    try {
      await apiRequest(`/api/vendor/orders/${orderId}/transition`, {
        method: 'POST',
        json: { status, vendorId: activeVendor.id },
      });
      await loadDash();
      notify(`Order updated to ${status.replace(/_/g, ' ')}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Transition blocked', 'error');
    }
  };

  const toggleSoldOut = async (p: Product) => {
    await apiRequest(`/api/vendor/products/${p.id}`, {
      method: 'PATCH',
      json: { soldOutManual: !p.soldOutManual },
    });
    await loadDash();
  };

  const updateStock = async (p: Product, stockQty: number) => {
    if (!Number.isInteger(stockQty) || stockQty < 0) {
      notify('Stock must be a whole number of zero or more.', 'error');
      return;
    }
    try {
      await apiRequest(`/api/vendor/products/${p.id}`, {
        method: 'PATCH',
        json: { stockQty },
      });
      await loadDash();
      notify(`${p.name} stock updated`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update stock', 'error');
    }
  };

  const updatePrice = async (p: Product, price: number) => {
    if (!Number.isFinite(price) || price < 1) {
      notify('Enter a valid price of at least ₹1.', 'error');
      return;
    }
    try {
      await apiRequest(`/api/vendor/products/${p.id}`, {
        method: 'PATCH',
        json: { price },
      });
      await loadDash();
      notify(`Updated ${p.name} price to ₹${price}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update price', 'error');
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVendor || !newName.trim()) return;
    await apiRequest('/api/vendor/products', {
      method: 'POST',
      json: {
        vendorId: activeVendor.id,
        name: newName.trim(),
        category: newCategory.trim() || 'General',
        price: Math.max(1, Number(newPrice) || 100),
        stockQty: Math.max(0, Number(newStock) || 0),
      },
    });
    setNewName('');
    await loadDash();
    notify('Product added to live Vadakara catalog', 'success');
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVendor) return;
    await apiRequest('/api/vendor/prebooking-slots', {
      method: 'POST',
      json: {
        vendorId: activeVendor.id,
        date: slotDate,
        timeLabel: slotTime,
        maxCapacity: Number(slotCap) || 10,
      },
    });
    await loadDash();
    notify('Pre-booking pickup slot published', 'success');
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5]">
      <header className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3.5 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/assets/aistudio/fyoora-lockup-red_72717535.png" alt="FYOORA" className="h-7 object-contain" />
            <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
              Vendor Partner Portal
            </span>
          </div>

          <div className="flex items-center gap-2">
            {data.vendors.length > 1 && (
              <select
                value={activeVendor?.id}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-neutral-300 text-xs font-bold bg-white"
              >
                {data.vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setActivePortal('customer')}
              className="px-3 py-1.5 rounded-xl border border-neutral-300 text-xs font-bold hover:border-[#E60023]"
            >
              Customer View
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 rounded-xl bg-[#252525] text-white text-xs font-bold inline-flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {activeVendor && (
          <div className="bg-white rounded-3xl border border-neutral-200 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[#E60023]/10 text-[#E60023] flex items-center justify-center">
                <Store className="w-6 h-6" />
              </div>
              <div>
                <h1 className="font-display text-xl font-extrabold text-[#252525]">{activeVendor.name}</h1>
                <p className="text-xs text-neutral-500">
                  {activeVendor.address} · Commission {(activeVendor.commissionRate * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-neutral-600">Prep Time:</span>
                <select
                  value={activeVendor.avgPrepTimeMins}
                  onChange={(e) => updatePrepTime(Number(e.target.value))}
                  className="px-2.5 py-1.5 rounded-xl border border-neutral-300 font-mono font-bold"
                >
                  {[10, 15, 18, 22, 30, 45].map((m) => (
                    <option key={m} value={m}>
                      {m} mins
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={toggleOpen}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  activeVendor.isOpen
                    ? 'bg-emerald-700 text-white'
                    : 'bg-red-600 text-white'
                }`}
              >
                {activeVendor.isOpen ? 'Store Open (Tap to Pause)' : 'Store Closed (Tap to Open)'}
              </button>
            </div>
          </div>
        )}

        {/* Store KPI Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-semibold text-neutral-500">Active Orders</div>
            <div className="font-mono font-extrabold text-xl text-[#252525] tabular-nums mt-1">
              {vendorOrders.filter((order) => {
                const status = getVendorSubOrder(order)?.status || order.status;
                return !['delivered', 'cancelled', 'refunded'].includes(status);
              }).length}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-semibold text-neutral-500">Completed</div>
            <div className="font-mono font-extrabold text-xl text-emerald-700 tabular-nums mt-1">
              {vendorOrders.filter((order) => getVendorSubOrder(order)?.status === 'delivered' || (!getVendorSubOrder(order) && order.status === 'delivered')).length}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-semibold text-neutral-500">Store Gross Sales</div>
            <div className="font-mono font-extrabold text-xl text-[#252525] tabular-nums mt-1">
              ₹{vendorOrders.reduce((sum, order) => {
                const subOrder = getVendorSubOrder(order);
                const completed = subOrder?.status === 'delivered' || (!subOrder && order.status === 'delivered');
                return completed && order.paymentStatus === 'captured'
                  ? sum + (subOrder?.subtotal ?? order.pricing.itemsSubtotal)
                  : sum;
              }, 0)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] font-semibold text-neutral-500">Products In Stock</div>
            <div className="font-mono font-extrabold text-xl text-[#E60023] tabular-nums mt-1">
              {vendorProducts.filter((p) => p.inStock && !p.soldOutManual).length} / {vendorProducts.length}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'orders', label: `Live Orders (${vendorOrders.length})`, icon: ClipboardList },
            { id: 'catalog', label: `Catalog & Stock (${vendorProducts.length})`, icon: PackagePlus },
            ...(activeVendor?.supportsPreBooking
              ? [{ id: 'prebooking', label: 'Pre-Booking Slots', icon: CalendarClock }]
              : []),
            { id: 'payouts', label: 'Sales & Settlements', icon: Wallet },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold border whitespace-nowrap ${
                  tab === t.id
                    ? 'bg-[#252525] text-white border-[#252525]'
                    : 'bg-white text-neutral-700 border-neutral-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Orders Queue */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {vendorOrders.length === 0 ? (
              <div className="bg-white rounded-3xl border border-neutral-200 p-8 text-center text-sm text-neutral-500">
                No active orders for {activeVendor?.name} yet.
              </div>
            ) : (
              vendorOrders.map((ord) => {
                const ownSubOrder = getVendorSubOrder(ord);
                const ownItems = ownSubOrder?.items || ord.items.filter((item) => item.vendorId === activeVendor?.id);
                const ownStatus = ownSubOrder?.status || ord.status;
                const ownSubtotal = ownSubOrder?.subtotal ?? ord.pricing.itemsSubtotal;
                return (
                <div key={ord.id} className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs font-bold text-[#E60023]">
                        {ord.orderNumber} · {ord.deliveryMode.replace(/_/g, ' ').toUpperCase()}
                      </div>
                      <div className="font-display font-bold text-base text-[#252525] mt-0.5">
                        {ord.customerName} ({ord.customerPhone})
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Your Items: <strong className="text-[#252525] uppercase">{ownStatus.replace(/_/g, ' ')}</strong> · Store Pickup OTP:{' '}
                        <span className="font-mono font-bold text-[#252525]">{ord.pickupOtp}</span>
                      </div>
                    </div>
                    <div className="font-mono font-extrabold text-base tabular-nums">
                      ₹{ownSubtotal}
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#F5F5F5] text-xs space-y-1.5">
                    {ownItems.map((it) => (
                      <div key={it.cartItemId}>
                        <div className="font-bold">
                          {it.quantity} × {it.name} {it.selectedVariation ? `(${it.selectedVariation.name})` : ''}
                        </div>
                        {it.kitchenInstructions && it.kitchenInstructions.length > 0 && (
                          <div className="text-amber-800 font-semibold mt-0.5">
                            Kitchen Note: {it.kitchenInstructions.join(', ')} {it.kitchenCustomNote || ''}
                          </div>
                        )}
                        {it.customCake && (
                          <div className="text-[#E60023] font-semibold mt-0.5">
                            Custom Cake: {it.customCake.size} · {it.customCake.flavour} · {it.customCake.eggOption}
                            {it.customCake.messageOnCake ? ` · Text: "${it.customCake.messageOnCake}"` : ''}
                          </div>
                        )}
                        {it.giftCustomisation && (
                          <div className="text-[#E60023] font-semibold mt-0.5">
                            Gift Card: To {it.giftCustomisation.recipientName} — &ldquo;{it.giftCustomisation.giftMessage}&rdquo; ({it.giftCustomisation.packagingTier})
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {['order_placed', 'payment_confirmed'].includes(ownStatus) && (
                      <button
                        type="button"
                        onClick={() => transitionOrder(ord.id, 'vendor_accepted')}
                        className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-bold"
                      >
                        Accept Order
                      </button>
                    )}
                    {ownStatus === 'vendor_accepted' && (
                      <button
                        type="button"
                        onClick={() => transitionOrder(ord.id, 'preparation_started')}
                        className="px-4 py-2 rounded-xl bg-[#252525] text-white text-xs font-bold"
                      >
                        Start Preparing
                      </button>
                    )}
                    {ownStatus === 'preparation_started' && (
                      <button
                        type="button"
                        onClick={() => transitionOrder(ord.id, 'ready_for_pickup')}
                        className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Ready for Pickup
                      </button>
                    )}
                    {ownStatus === 'ready_for_pickup' && ord.deliveryMode === 'prebooking_pickup' && (
                      <button
                        type="button"
                        onClick={() => transitionOrder(ord.id, 'delivered')}
                        className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold"
                      >
                        Complete Self-Pickup
                      </button>
                    )}
                    {ord.subOrders.length <= 1 && ['order_placed', 'payment_confirmed', 'vendor_accepted'].includes(ownStatus) && (
                      <button
                        type="button"
                        onClick={() => transitionOrder(ord.id, 'cancelled')}
                        className="px-3.5 py-2 rounded-xl border border-red-200 text-red-700 text-xs font-bold hover:bg-red-50"
                      >
                        Reject / Cancel
                      </button>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>
        )}

        {/* Catalog & Inventory */}
        {tab === 'catalog' && (
          <div className="space-y-5">
            <form onSubmit={handleAddProduct} className="bg-white rounded-3xl border border-neutral-200 p-5 grid sm:grid-cols-5 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-neutral-600 block mb-1">New Item Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Kozhikodan Halwa 500g"
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-600 block mb-1">Category</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-neutral-600 block mb-1">Price (₹) &amp; Stock</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-neutral-300 text-xs font-mono"
                  />
                  <input
                    type="number"
                    value={newStock}
                    onChange={(e) => setNewStock(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-neutral-300 text-xs font-mono"
                  />
                </div>
              </div>
              <button type="submit" className="py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold">
                + Add Item
              </button>
            </form>

            <div className="grid sm:grid-cols-2 gap-3">
              {vendorProducts.map((p) => (
                <div key={`${p.id}-${p.price}-${p.stockQty}`} className="bg-white rounded-2xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#252525] truncate">{p.name}</div>
                    <div className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                      {p.category} · ₹{p.price} · Stock: <strong className="font-mono">{p.stockQty}</strong>
                    </div>
                  </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                    <label className="text-[10px] font-semibold text-neutral-500 flex items-center gap-1">
                      Price ₹
                      <input
                        key={`${p.id}-price-${p.price}`}
                        type="number"
                        min={1}
                        step="1"
                        aria-label={`Price for ${p.name}`}
                        defaultValue={p.price}
                        onBlur={(event) => {
                          const price = Number(event.target.value);
                          if (price !== p.price) void updatePrice(p, price);
                        }}
                        className="w-20 px-2 py-1.5 rounded-lg border border-neutral-300 text-xs font-mono text-[#252525]"
                      />
                    </label>
                    <label className="text-[10px] font-semibold text-neutral-500 flex items-center gap-1">
                      Stock
                      <input
                        key={`${p.id}-stock-${p.stockQty}`}
                        type="number"
                        min={0}
                        step="1"
                        aria-label={`Stock quantity for ${p.name}`}
                        defaultValue={p.stockQty}
                        onBlur={(event) => {
                          const stock = Number(event.target.value);
                          if (stock !== p.stockQty) void updateStock(p, stock);
                        }}
                        className="w-16 px-2 py-1.5 rounded-lg border border-neutral-300 text-xs font-mono text-[#252525]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleSoldOut(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        p.soldOutManual ? 'bg-red-600 text-white' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {p.soldOutManual ? 'Sold Out' : 'Available'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Restaurant Pre-Booking Slots */}
        {tab === 'prebooking' && (
          <div className="space-y-4">
            <form onSubmit={handleAddSlot} className="bg-white rounded-3xl border border-neutral-200 p-5 grid sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-xs font-semibold block mb-1">Date</label>
                <input
                  type="date"
                  value={slotDate}
                  onChange={(e) => setSlotDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">Pickup Time Window</label>
                <input
                  type="text"
                  value={slotTime}
                  onChange={(e) => setSlotTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1">Max Orders Capacity</label>
                <input
                  type="number"
                  min={1}
                  value={slotCap}
                  onChange={(e) => setSlotCap(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-neutral-300 text-xs font-mono"
                />
              </div>
              <button type="submit" className="py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold">
                + Open Slot
              </button>
            </form>

            <div className="grid sm:grid-cols-3 gap-3">
              {vendorSlots.map((s) => (
                <div key={s.id} className="bg-white rounded-2xl border border-neutral-200 p-4 text-xs">
                  <div className="font-mono text-neutral-500">{s.date}</div>
                  <div className="font-bold text-sm text-[#252525] mt-1">{s.timeLabel}</div>
                  <div className="mt-2 font-mono font-semibold text-[#E60023] tabular-nums">
                    Booked: {s.bookedCount} / {s.maxCapacity}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payouts */}
        {tab === 'payouts' && (
          <div className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-3">
            <h2 className="font-display font-bold text-base">Vendor Settlement Ledger</h2>
            {data.settlements.length === 0 ? (
              <p className="text-xs text-neutral-500">No settlement batches recorded yet for this store.</p>
            ) : (
              data.settlements.map((s) => (
                <div key={s.id} className="p-3.5 rounded-2xl bg-[#F5F5F5] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-[#252525]">{s.periodLabel}</div>
                    <div className="text-neutral-500">
                      Gross ₹{s.grossAmount} · Platform Commission ₹{s.commissionOrFee}
                    </div>
                    {s.transferReference && (
                      <div className="text-neutral-500 mt-1">
                        Transfer ref: {s.transferReference}{s.settledAt ? ` · ${new Date(s.settledAt).toLocaleDateString()}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-extrabold text-sm text-[#252525] tabular-nums">
                      Net ₹{s.netPayout}
                    </div>
                    <div className="text-[11px] font-bold text-emerald-700 uppercase">{s.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
