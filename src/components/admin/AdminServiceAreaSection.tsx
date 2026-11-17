import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import type { DeliveryZoneConfig, GeoPoint, RestrictedZone } from '../../shared/types.ts';
import { VadakaraMap, type MapMarkerItem } from '../VadakaraMap.tsx';
import type { AdminOverviewPayload } from './adminTypes.ts';

interface AdminServiceAreaSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminServiceAreaSection({
  data,
  onRefresh,
  notify,
}: AdminServiceAreaSectionProps) {
  const area = data.serviceAreas[0];

  const [name, setName] = useState(area?.name || 'Vadakara Launch Zone');
  const [radiusKm, setRadiusKm] = useState(String(area?.radiusKm ?? 10));
  const [isActive, setIsActive] = useState(Boolean(area?.isActive ?? true));
  const [center, setCenter] = useState<GeoPoint>(area?.center || { lat: 11.6085, lng: 75.5917 });
  const [openHour, setOpenHour] = useState(area?.operatingHours.open || '07:00');
  const [closeHour, setCloseHour] = useState(area?.operatingHours.close || '23:00');

  const [baseFeeInr, setBaseFeeInr] = useState(String(area?.deliveryPricing.baseFeeInr ?? 25));
  const [perKmFeeInr, setPerKmFeeInr] = useState(String(area?.deliveryPricing.perKmFeeInr ?? 8));
  const [freeAboveInr, setFreeAboveInr] = useState(String(area?.deliveryPricing.freeDeliveryAboveInr ?? 499));
  const [pickupBaseInr, setPickupBaseInr] = useState(String(area?.pickupDropPricing.baseFeeInr ?? 35));
  const [pickupPerKmInr, setPickupPerKmInr] = useState(String(area?.pickupDropPricing.perKmFeeInr ?? 10));

  const [tiers, setTiers] = useState({
    EXPRESS: area?.deliveryTiersEnabled?.EXPRESS ?? true,
    NORMAL: area?.deliveryTiersEnabled?.NORMAL ?? true,
    ECO: area?.deliveryTiersEnabled?.ECO ?? true,
  });

  const [deliveryZones, setDeliveryZones] = useState<DeliveryZoneConfig[]>(area?.deliveryZones || []);
  const [restrictedZones, setRestrictedZones] = useState<RestrictedZone[]>(area?.restrictedZones || []);

  // Quick Add Sub-Zone / Restricted Area
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneRadius, setNewZoneRadius] = useState('4');
  const [newZoneSurcharge, setNewZoneSurcharge] = useState('10');

  const [newRestrictName, setNewRestrictName] = useState('');
  const [newRestrictReason, setNewRestrictReason] = useState('Coastal hazard / temporarily unserviceable');

  useEffect(() => {
    if (!area) return;
    setName(area.name);
    setRadiusKm(String(area.radiusKm));
    setIsActive(area.isActive);
    setCenter(area.center);
    setOpenHour(area.operatingHours.open);
    setCloseHour(area.operatingHours.close);
    setBaseFeeInr(String(area.deliveryPricing.baseFeeInr));
    setPerKmFeeInr(String(area.deliveryPricing.perKmFeeInr));
    setFreeAboveInr(String(area.deliveryPricing.freeDeliveryAboveInr));
    setPickupBaseInr(String(area.pickupDropPricing.baseFeeInr));
    setPickupPerKmInr(String(area.pickupDropPricing.perKmFeeInr));
    setTiers(area.deliveryTiersEnabled || { EXPRESS: true, NORMAL: true, ECO: true });
    setDeliveryZones(area.deliveryZones || []);
    setRestrictedZones(area.restrictedZones || []);
  }, [area]);

  const mapMarkers: MapMarkerItem[] = [
    { id: 'vadakara-hq', label: `${name} HQ`, position: center, kind: 'center' },
    ...data.vendors
      .filter((v) => v.approved && !v.suspended)
      .map((v) => ({
        id: v.id,
        label: v.name,
        position: v.location,
        kind: 'vendor' as const,
      })),
    ...data.riders
      .filter((r) => r.isOnline && r.kycStatus === 'approved' && !r.suspended)
      .map((r) => ({
        id: r.id,
        label: r.fullName,
        position: r.currentLocation,
        kind: 'rider' as const,
      })),
  ];

  const handleSaveZoneConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/service-area', {
        method: 'PUT',
        json: {
          name: name.trim(),
          radiusKm: Number(radiusKm) || 10,
          isActive,
          center,
          operatingHours: { open: openHour, close: closeHour },
          deliveryTiersEnabled: tiers,
          deliveryPricing: {
            baseFeeInr: Number(baseFeeInr) || 25,
            perKmFeeInr: Number(perKmFeeInr) || 8,
            freeDeliveryAboveInr: Number(freeAboveInr) || 499,
          },
          pickupDropPricing: {
            baseFeeInr: Number(pickupBaseInr) || 35,
            perKmFeeInr: Number(pickupPerKmInr) || 10,
          },
          deliveryZones,
          restrictedZones,
        },
      });
      await onRefresh();
      notify('Vadakara Geo-Zone, delivery charges, and tiers saved', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to save service area', 'error');
    }
  };

  return (
    <div className="space-y-5">
      {/* Live Vadakara Map */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
              Vadakara Service Map &amp; Live Fleet Plot
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Tap anywhere on the map to adjust Vadakara center coordinates. Plots approved vendors and active online riders.
            </p>
          </div>
          <span className="font-mono text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
            Center: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
          </span>
        </div>

        <VadakaraMap
          center={center}
          radiusKm={Number(radiusKm) || 10}
          markers={mapMarkers}
          heightClass="h-80"
          onSelectPoint={(pt) => {
            setCenter(pt);
            notify(`Updated draft HQ coordinates to ${pt.lat}, ${pt.lng}`, 'success');
          }}
          title={name}
        />
      </div>

      {/* Main Config Form */}
      <form onSubmit={handleSaveZoneConfig} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4 text-xs">
          <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
            Zone Coverage, Operating Hours &amp; Delivery Tiers
          </h3>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Zone Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Radius (km)</label>
              <input
                type="number"
                min={1}
                max={50}
                value={radiusKm}
                onChange={(e) => setRadiusKm(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Opens At</label>
              <input
                type="text"
                value={openHour}
                onChange={(e) => setOpenHour(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Closes At</label>
              <input
                type="text"
                value={closeHour}
                onChange={(e) => setCloseHour(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="font-semibold block mb-1">Base Fee (₹)</label>
              <input
                type="number"
                value={baseFeeInr}
                onChange={(e) => setBaseFeeInr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Per km Fee (₹)</label>
              <input
                type="number"
                value={perKmFeeInr}
                onChange={(e) => setPerKmFeeInr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Free Above (₹)</label>
              <input
                type="number"
                value={freeAboveInr}
                onChange={(e) => setFreeAboveInr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1">Pickup &amp; Drop Base (₹)</label>
              <input
                type="number"
                value={pickupBaseInr}
                onChange={(e) => setPickupBaseInr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1">Pickup &amp; Drop Per km (₹)</label>
              <input
                type="number"
                value={pickupPerKmInr}
                onChange={(e) => setPickupPerKmInr(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="font-semibold">Enabled Checkout Delivery Speed Tiers</div>
            <div className="flex flex-wrap gap-4">
              {(['EXPRESS', 'NORMAL', 'ECO'] as const).map((t) => (
                <label key={t} className="inline-flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tiers[t]}
                    onChange={(e) => setTiers((prev) => ({ ...prev, [t]: e.target.checked }))}
                    className="accent-[#E60023]"
                  />
                  <span>{t}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 font-bold pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-[#E60023]"
            />
            <span>Service Area Active (Uncheck to pause Vadakara marketplace orders)</span>
          </label>

          <button type="submit" className="px-5 py-2.5 rounded-xl bg-[#E60023] text-white text-xs font-bold">
            Save Zone Configuration
          </button>
        </div>

        {/* Sub-Zones & Restricted Geo Areas */}
        <div className="space-y-5 text-xs">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Delivery Sub-Zones ({deliveryZones.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="Zone name (e.g., Payyoli)"
                className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <input
                type="number"
                value={newZoneRadius}
                onChange={(e) => setNewZoneRadius(e.target.value)}
                placeholder="Radius km"
                className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
              />
              <div className="flex gap-1.5">
                <input
                  type="number"
                  value={newZoneSurcharge}
                  onChange={(e) => setNewZoneSurcharge(e.target.value)}
                  placeholder="Surcharge ₹"
                  className="w-full px-2 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newZoneName.trim()) return;
                    setDeliveryZones((prev) => [
                      ...prev,
                      {
                        id: `dz-${Date.now()}`,
                        name: newZoneName.trim(),
                        center,
                        radiusKm: Number(newZoneRadius) || 4,
                        surchargeInr: Number(newZoneSurcharge) || 0,
                        active: true,
                      },
                    ]);
                    setNewZoneName('');
                  }}
                  className="px-2.5 rounded-lg bg-[#252525] text-white shrink-0"
                  title="Add Delivery Zone"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {deliveryZones.map((dz) => (
                <div
                  key={dz.id}
                  className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2"
                >
                  <div>
                    <div className="font-semibold text-[#252525] dark:text-neutral-100">{dz.name}</div>
                    <div className="text-[11px] font-mono text-neutral-500">
                      Radius {dz.radiusKm}km · Surcharge +₹{dz.surchargeInr}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDeliveryZones((prev) =>
                          prev.map((z) => (z.id === dz.id ? { ...z, active: !z.active } : z))
                        )
                      }
                      className={`px-2 py-1 rounded-lg font-semibold ${
                        dz.active ? 'bg-emerald-700 text-white' : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    >
                      {dz.active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeliveryZones((prev) => prev.filter((z) => z.id !== dz.id))}
                      className="p-1 text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Restricted / Blocked Areas ({restrictedZones.length})
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newRestrictName}
                onChange={(e) => setNewRestrictName(e.target.value)}
                placeholder="Blocked locality name"
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <input
                type="text"
                value={newRestrictReason}
                onChange={(e) => setNewRestrictReason(e.target.value)}
                placeholder="Reason"
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900"
              />
              <button
                type="button"
                onClick={() => {
                  if (!newRestrictName.trim()) return;
                  setRestrictedZones((prev) => [
                    ...prev,
                    {
                      id: `rz-${Date.now()}`,
                      name: newRestrictName.trim(),
                      center,
                      radiusKm: 1.5,
                      reason: newRestrictReason.trim(),
                      active: true,
                    },
                  ]);
                  setNewRestrictName('');
                }}
                className="px-3 rounded-lg bg-[#E60023] text-white font-semibold"
              >
                Block
              </button>
            </div>
            {restrictedZones.length === 0 ? (
              <p className="text-neutral-500">No restricted areas active. Click Save Zone Configuration after edits.</p>
            ) : (
              <div className="space-y-2">
                {restrictedZones.map((rz) => (
                  <div
                    key={rz.id}
                    className="p-2.5 rounded-xl bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-semibold text-red-900 dark:text-red-300">{rz.name}</div>
                      <div className="text-[11px] text-red-700 dark:text-red-400">{rz.reason || 'Restricted'}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRestrictedZones((prev) => prev.filter((z) => z.id !== rz.id))}
                      className="text-red-700 dark:text-red-300 font-semibold"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
