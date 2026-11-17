import { Award, MapPin } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import { formatInr, formatShortDateTime, type AdminOverviewPayload } from './adminTypes.ts';

interface AdminRidersSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onConfirmAction: (cfg: { title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void> }) => void;
}

export function AdminRidersSection({
  data,
  onRefresh,
  notify,
  onConfirmAction,
}: AdminRidersSectionProps) {
  const riderStats = data.analytics.riders;

  return (
    <div className="space-y-5">
      {/* Fleet Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Registered Riders', value: data.riders.length },
          { label: 'Online Right Now', value: data.liveOps.onlineRiders.length },
          { label: 'Available (Idle)', value: data.liveOps.availableRiders.length },
          {
            label: 'Total Pending Rider Payouts',
            value: formatInr(data.riders.reduce((s, r) => s + r.pendingSettlement, 0)),
          },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{card.label}</div>
            <div className="font-mono font-bold text-xl text-[#252525] dark:text-neutral-100 tabular-nums mt-1">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Rider Management Roster & Leaderboard */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100 flex items-center gap-2">
              <Award className="w-4 h-4 text-[#E60023]" />
              Delivery Partner Fleet &amp; Performance Leaderboard
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              KYC verification, online status toggles, suspension controls, and active GPS coordinates.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {riderStats.map((item, idx) => {
            const r = item.rider;
            const showCoords = r.isOnline && !r.suspended && r.kycStatus === 'approved';
            return (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-neutral-400">#{idx + 1}</span>
                    <span className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                      {r.fullName}
                    </span>
                    <span className="text-neutral-500">
                      {r.vehicleType} · {r.vehicleNumber} · Aadhaar ****{r.aadhaarLast4}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono tabular-nums text-neutral-600 dark:text-neutral-300">
                    All-Time Deliveries: {r.completedDeliveries} · Period: {item.periodDeliveries} · Earnings: {formatInr(r.earningsTotal)} · Tips: {formatInr(r.tipsTotal)} · Pending: {formatInr(r.pendingSettlement)} · ★ {r.rating}
                  </div>

                  {showCoords && (
                    <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-mono">
                      <MapPin className="w-3 h-3" />
                      Active GPS: {r.currentLocation.lat.toFixed(4)}, {r.currentLocation.lng.toFixed(4)} (updated{' '}
                      {formatShortDateTime(r.lastLocationUpdatedAt)})
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`KYC status for ${r.fullName}`}
                    value={r.kycStatus}
                    onChange={async (e) => {
                      await apiRequest(`/api/admin/riders/${r.id}`, {
                        method: 'PATCH',
                        json: { kycStatus: e.target.value },
                      });
                      await onRefresh();
                      notify(`Updated KYC status for ${r.fullName}`, 'success');
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-semibold"
                  >
                    <option value="approved">KYC Approved</option>
                    <option value="pending">KYC Pending</option>
                    <option value="rejected">KYC Rejected</option>
                  </select>

                  <button
                    type="button"
                    disabled={r.kycStatus !== 'approved' || Boolean(r.suspended)}
                    onClick={async () => {
                      try {
                        await apiRequest(`/api/admin/riders/${r.id}`, {
                          method: 'PATCH',
                          json: { isOnline: !r.isOnline },
                        });
                        await onRefresh();
                      } catch (err) {
                        notify(err instanceof Error ? err.message : 'Unable to toggle rider status', 'error');
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-45 ${
                      r.isOnline
                        ? 'bg-emerald-700 text-white'
                        : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    {r.isOnline ? 'Online' : 'Offline'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onConfirmAction({
                        title: `${r.suspended ? 'Reactivate' : 'Suspend'} Rider ${r.fullName}?`,
                        body: r.suspended
                          ? `Restore ${r.fullName} to active delivery dispatch eligibility.`
                          : `Suspending ${r.fullName} immediately takes them offline and blocks new job assignments.`,
                        confirmLabel: r.suspended ? 'Reactivate Rider' : 'Suspend Rider',
                        onConfirm: async () => {
                          await apiRequest(`/api/admin/riders/${r.id}`, {
                            method: 'PATCH',
                            json: { suspended: !r.suspended },
                          });
                          await onRefresh();
                        },
                      });
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold ${
                      r.suspended
                        ? 'bg-red-600 text-white'
                        : 'bg-neutral-900 dark:bg-neutral-800 text-white'
                    }`}
                  >
                    {r.suspended ? 'Suspended' : 'Suspend'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
