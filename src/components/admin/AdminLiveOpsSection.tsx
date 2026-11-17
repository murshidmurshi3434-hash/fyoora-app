import { useState } from 'react';
import { Clock, Radio, RefreshCw, Truck } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import type { Order } from '../../shared/types.ts';
import { formatInr, formatShortDateTime, type AdminOverviewPayload } from './adminTypes.ts';

interface AdminLiveOpsSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

type QueueFilter =
  | 'all_active'
  | 'incoming'
  | 'awaiting_vendor'
  | 'preparing'
  | 'awaiting_riders'
  | 'active_deliveries'
  | 'delayed'
  | 'failed';

export function AdminLiveOpsSection({ data, onRefresh, notify }: AdminLiveOpsSectionProps) {
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all_active');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const queues: Array<{ id: QueueFilter; label: string; count: number; items: Order[]; alert?: boolean }> = [
    { id: 'incoming', label: 'Incoming', count: data.liveOps.incomingOrders.length, items: data.liveOps.incomingOrders },
    { id: 'awaiting_vendor', label: 'Awaiting Vendor', count: data.liveOps.awaitingVendor.length, items: data.liveOps.awaitingVendor },
    { id: 'preparing', label: 'Preparing', count: data.liveOps.beingPrepared.length, items: data.liveOps.beingPrepared },
    { id: 'awaiting_riders', label: 'Awaiting Riders', count: data.liveOps.awaitingRiders.length, items: data.liveOps.awaitingRiders, alert: data.liveOps.awaitingRiders.length > 0 },
    { id: 'active_deliveries', label: 'Active Deliveries', count: data.liveOps.activeDeliveries.length, items: data.liveOps.activeDeliveries },
    { id: 'delayed', label: 'Delayed', count: data.liveOps.delayedDeliveries.length, items: data.liveOps.delayedDeliveries, alert: data.liveOps.delayedDeliveries.length > 0 },
    { id: 'failed', label: 'Failed', count: data.liveOps.failedDeliveries.length, items: data.liveOps.failedDeliveries, alert: data.liveOps.failedDeliveries.length > 0 },
  ];

  const activeAllOrders = data.orders.filter(
    (o) => !['delivered', 'cancelled', 'refunded'].includes(o.status)
  );

  const visibleOrders =
    queueFilter === 'all_active'
      ? activeAllOrders
      : queues.find((q) => q.id === queueFilter)?.items || [];

  const approvedRiders = data.riders.filter((r) => r.kycStatus === 'approved' && !r.suspended);

  return (
    <div className="space-y-5">
      {/* Real-time Pipeline Counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <button
          type="button"
          onClick={() => setQueueFilter('all_active')}
          className={`text-left p-3.5 rounded-2xl border transition ${
            queueFilter === 'all_active'
              ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525] border-[#252525] dark:border-white'
              : 'bg-white dark:bg-[#171717] border-neutral-200 dark:border-neutral-800 text-[#252525] dark:text-neutral-100'
          }`}
        >
          <div className="text-[11px] opacity-75">All Live Orders</div>
          <div className="font-mono font-bold text-xl tabular-nums mt-1">{activeAllOrders.length}</div>
        </button>

        {queues.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setQueueFilter(q.id)}
            className={`text-left p-3.5 rounded-2xl border transition ${
              queueFilter === q.id
                ? 'bg-[#E60023] text-white border-[#E60023]'
                : 'bg-white dark:bg-[#171717] border-neutral-200 dark:border-neutral-800 text-[#252525] dark:text-neutral-100'
            }`}
          >
            <div className="text-[11px] opacity-80 truncate">{q.label}</div>
            <div className={`font-mono font-bold text-xl tabular-nums mt-1 ${q.alert && queueFilter !== q.id ? 'text-[#E60023]' : ''}`}>
              {q.count}
            </div>
          </button>
        ))}
      </div>

      {/* Fleet Availability Strip */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-[#252525] dark:text-neutral-100">
            <Radio className="w-4 h-4 text-emerald-600" />
            Online Riders: <strong className="font-mono tabular-nums">{data.liveOps.onlineRiders.length}</strong>
          </span>
          <span className="text-neutral-600 dark:text-neutral-300">
            Available (Idle): <strong className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{data.liveOps.availableRiders.length}</strong>
          </span>
          <span className="text-neutral-600 dark:text-neutral-300">
            Offline / Busy: <strong className="font-mono tabular-nums">{data.liveOps.offlineRiders.length}</strong>
          </span>
          <span className="text-neutral-600 dark:text-neutral-300">
            Unassigned Queue: <strong className="font-mono tabular-nums text-[#E60023]">{data.liveOps.unassignedOrders.length}</strong>
          </span>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-[#252525] dark:text-neutral-200 hover:border-[#E60023]"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Live State
        </button>
      </div>

      {/* Main Split: Active Dispatch Queue + Live Activity Stream */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Dispatch &amp; Order Pipeline ({visibleOrders.length})
            </h3>
            <span className="text-[11px] text-neutral-500">Assign riders directly to active orders</span>
          </div>

          {visibleOrders.length === 0 ? (
            <div className="py-10 text-center text-xs text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl">
              No orders in this live operations queue right now.
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleOrders.map((o) => {
                const elapsedMins = Math.max(0, Math.round((Date.now() - Date.parse(o.createdAt)) / 60_000));
                return (
                  <div
                    key={o.id}
                    className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#E60023]">{o.orderNumber}</span>
                        <span className="uppercase font-semibold text-[11px] text-neutral-700 dark:text-neutral-300">
                          {o.status.replace(/_/g, ' ')}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 font-mono tabular-nums">
                          <Clock className="w-3 h-3" /> {elapsedMins}m ago
                        </span>
                      </div>
                      <div className="font-semibold text-[#252525] dark:text-neutral-100">
                        {o.customerName} · {o.vendorName || 'Pickup & Drop Courier'}
                      </div>
                      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {o.deliveryAddress.line1}, {o.deliveryAddress.city} · {o.paymentMethod.toUpperCase()} ({o.paymentStatus})
                        {o.riderName ? ` · Rider: ${o.riderName}` : ' · Unassigned'}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono font-bold text-sm tabular-nums text-[#252525] dark:text-neutral-100">
                        {formatInr(o.pricing.grandTotal)}
                      </span>
                      {o.deliveryMode !== 'prebooking_pickup' && !['delivered', 'cancelled', 'refunded'].includes(o.status) && (
                        <select
                          aria-label={`Assign rider to ${o.orderNumber}`}
                          disabled={assigningId === o.id}
                          value={o.riderId || ''}
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            setAssigningId(o.id);
                            try {
                              await apiRequest(`/api/admin/orders/${o.id}/assign-rider`, {
                                method: 'PATCH',
                                json: { riderId: e.target.value },
                              });
                              await onRefresh();
                              notify(`Assigned rider to ${o.orderNumber}`, 'success');
                            } catch (err) {
                              notify(err instanceof Error ? err.message : 'Unable to assign rider', 'error');
                            } finally {
                              setAssigningId(null);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium text-[#252525] dark:text-neutral-200"
                        >
                          <option value="">Assign rider...</option>
                          {approvedRiders.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.fullName} ({r.isOnline ? 'Online' : 'Offline'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chronological Activity Feed */}
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Live Activity Feed
            </h3>
            <Truck className="w-4 h-4 text-[#E60023]" />
          </div>
          {data.liveOps.activityFeed.length === 0 ? (
            <p className="text-xs text-neutral-500 py-6">No recent live events yet.</p>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {data.liveOps.activityFeed.map((evt) => (
                <div key={evt.id} className="pb-2.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-[#252525] dark:text-neutral-100">{evt.title}</span>
                    <span className="font-mono text-[10px] text-neutral-400 shrink-0 tabular-nums">
                      {formatShortDateTime(evt.timestamp)}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{evt.subtitle}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
