import { useState } from 'react';
import { apiRequest } from '../../lib/api.ts';
import type { AdminServiceKey } from '../../shared/types.ts';
import { formatInr, type AdminOverviewPayload } from './adminTypes.ts';

interface AdminServicesSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export function AdminServicesSection({ data, onRefresh, notify }: AdminServicesSectionProps) {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const updateService = async (
    key: AdminServiceKey,
    patch: { enabled?: boolean; commissionRate?: number; minOrderInr?: number }
  ) => {
    setSavingKey(key);
    try {
      await apiRequest(`/api/admin/services/${key}`, {
        method: 'PATCH',
        json: patch,
      });
      await onRefresh();
      notify(`Updated service configuration for ${key.replace('_', ' ')}`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to update service settings', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
          FYOORA Vadakara Service Catalogue (8 Verticals)
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Enable or pause individual customer services, calibrate platform commission rates, and monitor real GMV &amp; net revenue per vertical.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.analytics.services.map((svc) => (
          <div
            key={svc.serviceKey}
            className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                    {svc.label}
                  </h3>
                  <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                    {svc.vendorCount > 0 ? `${svc.vendorCount} vendors` : svc.serviceKey === 'pickup_drop' ? 'Direct courier' : '0 vendors yet'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingKey === svc.serviceKey}
                  onClick={() => void updateService(svc.serviceKey, { enabled: !svc.enabled })}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 ${
                    svc.enabled
                      ? 'bg-emerald-700 text-white'
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {svc.enabled ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
                <div>
                  <div className="text-[10px] text-neutral-500">Orders / Completed</div>
                  <div className="font-mono font-bold tabular-nums">
                    {svc.orders} / {svc.completedOrders}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500">GMV</div>
                  <div className="font-mono font-bold tabular-nums">{formatInr(svc.gmv)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500">Net Revenue</div>
                  <div className="font-mono font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatInr(svc.netRevenue)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-neutral-500">Active Customers</div>
                  <div className="font-mono font-bold tabular-nums">{svc.uniqueCustomers}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Commission %</label>
                <select
                  aria-label={`Commission percentage for ${svc.label}`}
                  value={Math.round(svc.commissionRate * 100)}
                  onChange={(e) =>
                    void updateService(svc.serviceKey, { commissionRate: Number(e.target.value) / 100 })
                  }
                  className="w-full px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs"
                >
                  {[8, 10, 12, 14, 15, 16, 18, 20, 22, 25].map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}%
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-neutral-500 block mb-1">Min Order (₹)</label>
                <input
                  type="number"
                  min={0}
                  max={5000}
                  defaultValue={svc.minOrderInr}
                  onBlur={(e) => {
                    const nextVal = Number(e.target.value);
                    if (Number.isFinite(nextVal) && nextVal !== svc.minOrderInr) {
                      void updateService(svc.serviceKey, { minOrderInr: nextVal });
                    }
                  }}
                  className="w-full px-2 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
