import { useEffect, useState } from 'react';
import {
  Bike,
  Camera,
  CheckCircle2,
  Compass,
  IndianRupee,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { Order, RiderProfile, SettlementRecord } from '../../shared/types.ts';
import { VadakaraMap } from '../VadakaraMap.tsx';

interface RiderDashPayload {
  rider: RiderProfile;
  assignedOrders: Order[];
  availableJobs: Order[];
  settlements: SettlementRecord[];
}

export function RiderPortal() {
  const { user, logout, setActivePortal, notify } = useApp();
  const [data, setData] = useState<RiderDashPayload | null>(null);
  const [otpInputs, setOtpInputs] = useState<Record<string, string>>({});
  const [proofPhotos, setProofPhotos] = useState<Record<string, string>>({});

  const loadDash = async () => {
    try {
      const res = await apiRequest<RiderDashPayload>('/api/rider/dashboard');
      setData(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load rider dashboard', 'error');
    }
  };

  useEffect(() => {
    void loadDash();
  }, [user?.id]);

  if (!data) {
    return <div className="p-8 text-center text-sm text-neutral-500">Loading FYOORA Rider App...</div>;
  }

  const { rider, assignedOrders, availableJobs, settlements } = data;

  const toggleOnline = async () => {
    try {
      await apiRequest('/api/rider/status', {
        method: 'POST',
        json: { isOnline: !rider.isOnline },
      });
      await loadDash();
      notify(`You are now ${!rider.isOnline ? 'ONLINE' : 'OFFLINE'}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to change duty status.', 'error');
    }
  };

  const updateGpsBrowser = () => {
    if (!navigator.geolocation) {
      notify('Geolocation is unavailable in this browser; saved coordinates were left unchanged.', 'info');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await apiRequest('/api/rider/status', {
          method: 'POST',
          json: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        });
        await loadDash();
        notify('Rider GPS location updated', 'success');
      },
      () => {
        notify('Location access was denied. Your saved GPS location was left unchanged; enable location access and try again.', 'info');
      }
    );
  };

  const acceptJob = async (orderId: string) => {
    try {
      await apiRequest(`/api/rider/jobs/${orderId}/accept`, { method: 'POST' });
      await loadDash();
      notify('Delivery job accepted!', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not accept job', 'error');
    }
  };

  const transitionOrder = async (ord: Order, status: Order['status']) => {
    try {
      await apiRequest(`/api/orders/${ord.id}/transition`, {
        method: 'POST',
        json: {
          status,
          otp: otpInputs[ord.id],
          proofPhotoUrl: proofPhotos[ord.id],
        },
      });
      await loadDash();
      notify(`Order ${ord.orderNumber} marked ${status.replace(/_/g, ' ')}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Verification failed', 'error');
    }
  };

  const handlePhotoUpload = (orderId: string, file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProofPhotos((prev) => ({ ...prev, [orderId]: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] pb-12">
      <header className="bg-[#252525] text-white px-4 py-3.5 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#E60023] flex items-center justify-center">
              <Bike className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-display font-bold text-sm">{rider.fullName}</div>
              <div className="text-[11px] text-neutral-300">
                {rider.vehicleType} · {rider.vehicleNumber} · KYC:{' '}
                <span className="uppercase font-bold text-emerald-400">{rider.kycStatus}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActivePortal('customer')}
              className="px-2.5 py-1.5 rounded-xl bg-white/10 text-xs font-bold"
            >
              Customer
            </button>
            <button
              type="button"
              onClick={logout}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* Duty & GPS Bar */}
        <div className="bg-white rounded-3xl border border-neutral-200 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <div>
              <div className="font-bold text-[#252525]">
                Duty Status: {rider.isOnline ? 'ONLINE IN VADAKARA' : 'OFFLINE'}
              </div>
              <div className="font-mono text-[11px] text-neutral-500">
                GPS: {rider.currentLocation.lat.toFixed(4)}, {rider.currentLocation.lng.toFixed(4)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={updateGpsBrowser}
              className="px-3 py-2 rounded-xl border border-neutral-300 text-xs font-bold inline-flex items-center gap-1"
            >
              <Compass className="w-3.5 h-3.5 text-[#E60023]" /> Sync GPS
            </button>
            <button
              type="button"
              onClick={toggleOnline}
              disabled={!rider.isOnline && rider.kycStatus !== 'approved'}
              title={!rider.isOnline && rider.kycStatus !== 'approved' ? 'KYC approval is required to go online.' : undefined}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white ${
                rider.isOnline ? 'bg-emerald-700' : 'bg-neutral-700'
              } disabled:opacity-45 disabled:cursor-not-allowed`}
            >
              {!rider.isOnline && rider.kycStatus !== 'approved' ? 'KYC Pending' : rider.isOnline ? 'Go Offline' : 'Go Online'}
            </button>
          </div>
        </div>

        {/* Earnings & Separate Tips Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] text-neutral-500 font-semibold">Total Earnings</div>
            <div className="font-mono font-extrabold text-lg text-[#252525] tabular-nums mt-1">
              ₹{rider.earningsTotal}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] text-neutral-500 font-semibold">100% Customer Tips</div>
            <div className="font-mono font-extrabold text-lg text-[#E60023] tabular-nums mt-1">
              ₹{rider.tipsTotal}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-neutral-200 p-4">
            <div className="text-[11px] text-neutral-500 font-semibold">Pending Payout</div>
            <div className="font-mono font-extrabold text-lg text-emerald-700 tabular-nums mt-1">
              ₹{rider.pendingSettlement}
            </div>
          </div>
        </div>

        {/* Broadcast Available Jobs */}
        {availableJobs.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-display font-bold text-base text-[#252525]">
              Available Vadakara Jobs ({availableJobs.length})
            </h2>
            {availableJobs.map((job) => (
              <div key={job.id} className="bg-white rounded-3xl border-2 border-[#E60023]/30 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-mono text-xs font-bold text-[#E60023]">{job.orderNumber}</div>
                  <div className="font-bold text-sm text-[#252525]">
                    {job.vendorName || 'Pickup & Drop Parcel'} → {job.deliveryAddress.label}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5 tabular-nums">
                    {job.distanceKm.toFixed(1)} km · Delivery Fee ₹{job.pricing.deliveryFee} + Tip ₹{job.pricing.riderTip}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => acceptJob(job.id)}
                  className="px-4 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold shrink-0"
                >
                  Accept Job
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Assigned Deliveries */}
        <section className="space-y-3">
          <h2 className="font-display font-bold text-base text-[#252525]">
            My Assigned Deliveries ({assignedOrders.length})
          </h2>
          {assignedOrders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-neutral-200 p-6 text-center text-xs text-neutral-500">
              No assigned jobs right now. Stay online to receive Vadakara dispatch alerts.
            </div>
          ) : (
            assignedOrders.map((ord) => (
              <div key={ord.id} className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs font-bold text-[#E60023]">
                      {ord.orderNumber} · {ord.serviceType.replace(/_/g, ' ').toUpperCase()}
                    </div>
                    <h3 className="font-display font-bold text-base text-[#252525] mt-0.5">
                      {ord.vendorName || 'Pickup & Drop Courier'} → {ord.customerName}
                    </h3>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Drop: {ord.deliveryAddress.line1} · {ord.customerPhone}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold uppercase text-[#252525]">
                      {ord.status.replace(/_/g, ' ')}
                    </span>
                    <div className="text-xs font-mono text-emerald-700 font-bold mt-0.5 tabular-nums">
                      {ord.paymentMethod === 'cod' ? `Collect ₹${ord.pricing.grandTotal}` : 'Prepaid'}
                    </div>
                  </div>
                </div>

                {ord.riderInstructions.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#F5F5F5] text-xs">
                    <strong>Rider Instructions:</strong> {ord.riderInstructions.join(', ')}
                    {ord.riderCustomNote ? ` · ${ord.riderCustomNote}` : ''}
                  </div>
                )}

                <VadakaraMap
                  heightClass="h-40"
                  title="Rider Route"
                  markers={[
                    { id: 'r', label: 'You', position: rider.currentLocation, kind: 'rider' },
                    {
                      id: 'd',
                      label: 'Drop',
                      position: { lat: ord.deliveryAddress.lat, lng: ord.deliveryAddress.lng },
                      kind: 'drop',
                    },
                  ]}
                  routeOrigin={rider.currentLocation}
                  routeDestination={{ lat: ord.deliveryAddress.lat, lng: ord.deliveryAddress.lng }}
                />

                {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
                  <div className="space-y-3 pt-2 border-t border-neutral-200">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={otpInputs[ord.id] || ''}
                        onChange={(e) =>
                          setOtpInputs((prev) => ({ ...prev, [ord.id]: e.target.value.replace(/\D/g, '') }))
                        }
                        placeholder={
                          ord.serviceType === 'pickup_drop' &&
                          ['rider_assigned', 'rider_arrived_at_vendor'].includes(ord.status)
                            ? 'Enter 4-digit Sender Pickup OTP'
                            : 'Enter 4-digit Recipient Delivery OTP'
                        }
                        className="px-3.5 py-2.5 rounded-xl border border-neutral-300 text-xs font-mono"
                      />
                      <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-neutral-300 text-xs font-semibold cursor-pointer">
                        <Camera className="w-4 h-4 text-[#E60023]" />
                        <span>{proofPhotos[ord.id] ? 'Proof Photo Attached' : 'Attach Proof Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(ord.id, e.target.files?.[0])}
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {ord.status === 'rider_assigned' && (
                        <button
                          type="button"
                          onClick={() => transitionOrder(ord, 'rider_arrived_at_vendor')}
                          className="px-4 py-2 rounded-xl bg-[#252525] text-white text-xs font-bold"
                        >
                          Arrived at Pickup
                        </button>
                      )}
                      {['ready_for_pickup', 'rider_assigned', 'rider_arrived_at_vendor'].includes(ord.status) && (
                        <button
                          type="button"
                          onClick={() => transitionOrder(ord, 'picked_up')}
                          className="px-4 py-2 rounded-xl bg-[#E60023] text-white text-xs font-bold"
                        >
                          Confirm Picked Up
                        </button>
                      )}
                      {ord.status === 'picked_up' && (
                        <button
                          type="button"
                          onClick={() => transitionOrder(ord, 'out_for_delivery')}
                          className="px-4 py-2 rounded-xl bg-[#252525] text-white text-xs font-bold"
                        >
                          Start Delivery Trip
                        </button>
                      )}
                      {['picked_up', 'out_for_delivery'].includes(ord.status) && (
                        <button
                          type="button"
                          onClick={() => transitionOrder(ord, 'delivered')}
                          className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verify Delivery OTP &amp; Complete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </section>

        {/* Settlement History */}
        {settlements.length > 0 && (
          <section className="bg-white rounded-3xl border border-neutral-200 p-5 space-y-2.5">
            <div className="flex items-center gap-2 font-display font-bold text-sm">
              <IndianRupee className="w-4 h-4 text-[#E60023]" />
              <span>Settlement History</span>
            </div>
            {settlements.map((s) => (
              <div key={s.id} className="p-3 rounded-xl bg-[#F5F5F5] flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold">{s.periodLabel}</div>
                  <div className="text-neutral-500">Includes ₹{s.tipsIncluded} tips</div>
                </div>
                <div className="font-mono font-bold text-emerald-700">₹{s.netPayout} · {s.status}</div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
