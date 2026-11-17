import { useState } from 'react';
import { Package, Search, X } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import type { Vendor } from '../../shared/types.ts';
import { formatInr, type AdminOverviewPayload } from './adminTypes.ts';

interface AdminVendorsSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onConfirmAction: (cfg: { title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void> }) => void;
}

export function AdminVendorsSection({
  data,
  onRefresh,
  notify,
  onConfirmAction,
}: AdminVendorsSectionProps) {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [inspectVendor, setInspectVendor] = useState<Vendor | null>(null);
  const [hoursEdit, setHoursEdit] = useState<Record<string, string>>({});

  const pendingApps = data.partnerApplications.filter((a) => a.status === 'pending');

  const vendorRows = data.analytics.vendors.filter((item) => {
    if (catFilter !== 'all' && item.vendor.serviceCategory !== catFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${item.vendor.name} ${item.vendor.areaName} ${item.vendor.serviceCategory}`
      .toLowerCase()
      .includes(q);
  });

  const inspectedProducts = inspectVendor
    ? data.products.filter((p) => p.vendorId === inspectVendor.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Partner & Rider Onboarding Queue */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Partner &amp; Rider Onboarding Queue ({pendingApps.length} pending / {data.partnerApplications.length} total)
            </h2>
            <p className="text-[11px] text-neutral-500">
              Approving an onboarding application creates the live vendor store or rider partner profile automatically.
            </p>
          </div>
        </div>

        {data.partnerApplications.length === 0 ? (
          <p className="text-xs text-neutral-500 py-3">No new store or rider onboarding applications submitted yet.</p>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.partnerApplications.map((appItem) => (
              <div
                key={appItem.id}
                className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase text-[#E60023]">{appItem.type} Application</span>
                  <span className="font-mono uppercase text-[11px] text-neutral-500">{appItem.status}</span>
                </div>
                <div className="font-bold text-sm text-[#252525] dark:text-neutral-100">
                  {appItem.businessName || appItem.applicantName}
                </div>
                <div className="text-neutral-500 dark:text-neutral-400">
                  {appItem.type === 'vendor'
                    ? `${appItem.serviceCategory} · ${appItem.address}`
                    : `${appItem.vehicleType} · ${appItem.vehicleNumber} · DL ${appItem.licenseNumber}`}
                </div>
                {appItem.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiRequest(`/api/admin/applications/${appItem.id}`, {
                          method: 'PATCH',
                          json: { status: 'approved' },
                        });
                        await onRefresh();
                        notify('Application approved and live portal unlocked!', 'success');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold"
                    >
                      Approve &amp; Onboard
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onConfirmAction({
                          title: 'Reject Partner Application?',
                          body: `Reject ${appItem.type} application for ${appItem.businessName || appItem.applicantName}?`,
                          confirmLabel: 'Reject Application',
                          onConfirm: async () => {
                            await apiRequest(`/api/admin/applications/${appItem.id}`, {
                              method: 'PATCH',
                              json: { status: 'rejected' },
                            });
                            await onRefresh();
                            notify('Application marked rejected', 'error');
                          },
                        });
                      }}
                      className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 font-semibold"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: `All Vendors (${data.vendors.length})` },
            { id: 'food', label: 'Restaurants / Food' },
            { id: 'bakery', label: 'Bakery' },
            { id: 'grocery', label: 'Grocery' },
            { id: 'celebration', label: 'Celebration' },
            { id: 'flowers_gifts', label: 'Flowers & Gifts' },
            { id: 'local_shopping', label: 'Local Shopping' },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCatFilter(c.id)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold ${
                catFilter === c.id
                  ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter vendors..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
          />
        </div>
      </div>

      {/* Vendor Controls & Ranking */}
      <div className="space-y-3">
        {vendorRows.map((item) => {
          const v = item.vendor;
          const draftHours = hoursEdit[v.id] ?? v.openingHours;
          return (
            <div
              key={v.id}
              className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">{v.name}</span>
                  <span className="text-[11px] text-neutral-500 capitalize">
                    {v.serviceCategory.replace('_', ' ')} · {v.areaName}
                  </span>
                  <span className="font-mono text-[11px] font-bold text-[#E60023]">Score {item.performanceScore}/100</span>
                </div>
                <div className="text-[11px] font-mono tabular-nums text-neutral-600 dark:text-neutral-300">
                  Orders {item.orderCount} · GMV {formatInr(item.gmv)} · Commission {formatInr(item.commissionGenerated)} · Net Payout {formatInr(item.netPayout)} · ★ {v.rating}
                </div>
                {item.alerts.length > 0 && (
                  <div className="text-[11px] text-amber-700 dark:text-amber-400">
                    Alerts: {item.alerts.join(' · ')}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={`Opening hours for ${v.name}`}
                  value={draftHours}
                  onChange={(e) => setHoursEdit((prev) => ({ ...prev, [v.id]: e.target.value }))}
                  onBlur={async () => {
                    if (draftHours.trim() && draftHours !== v.openingHours) {
                      await apiRequest(`/api/admin/vendors/${v.id}`, {
                        method: 'PATCH',
                        json: { openingHours: draftHours.trim() },
                      });
                      await onRefresh();
                      notify(`Updated opening hours for ${v.name}`, 'success');
                    }
                  }}
                  className="w-40 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono text-[11px]"
                />

                <select
                  aria-label={`Commission rate for ${v.name}`}
                  value={Math.round(v.commissionRate * 100)}
                  onChange={async (e) => {
                    await apiRequest(`/api/admin/vendors/${v.id}`, {
                      method: 'PATCH',
                      json: { commissionRate: Number(e.target.value) / 100 },
                    });
                    await onRefresh();
                    notify(`Updated ${v.name} commission to ${e.target.value}%`, 'success');
                  }}
                  className="px-2 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 font-mono font-semibold"
                >
                  {[8, 10, 12, 14, 15, 16, 18, 20, 22, 25].map((pct) => (
                    <option key={pct} value={pct}>
                      {pct}% comm.
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest(`/api/admin/vendors/${v.id}`, {
                      method: 'PATCH',
                      json: { isOpen: !v.isOpen },
                    });
                    await onRefresh();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold ${
                    v.isOpen
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                      : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {v.isOpen ? 'Store Open' : 'Store Offline'}
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest(`/api/admin/vendors/${v.id}`, {
                      method: 'PATCH',
                      json: { featured: !v.featured },
                    });
                    await onRefresh();
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border font-semibold ${
                    v.featured
                      ? 'border-[#E60023] text-[#E60023]'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {v.featured ? 'Featured' : 'Feature'}
                </button>

                <button
                  type="button"
                  onClick={() => setInspectVendor(v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 font-semibold text-[#252525] dark:text-neutral-200"
                >
                  <Package className="w-3.5 h-3.5" /> Inventory ({item.productCount})
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onConfirmAction({
                      title: `${v.suspended ? 'Unsuspend' : 'Suspend'} ${v.name}?`,
                      body: v.suspended
                        ? `Restore ${v.name} visibility and order intake on FYOORA Vadakara.`
                        : `Suspending ${v.name} immediately hides the store from customers.`,
                      confirmLabel: v.suspended ? 'Restore Store' : 'Suspend Store',
                      onConfirm: async () => {
                        await apiRequest(`/api/admin/vendors/${v.id}`, {
                          method: 'PATCH',
                          json: { suspended: !v.suspended },
                        });
                        await onRefresh();
                      },
                    });
                  }}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold ${
                    v.suspended
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 dark:bg-neutral-800 text-white'
                  }`}
                >
                  {v.suspended ? 'Suspended' : 'Suspend'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Product & Low-Stock Inventory Drawer */}
      {inspectVendor && (
        <div className="fixed inset-0 z-50 bg-black/45 flex justify-end">
          <div className="w-full max-w-lg bg-white dark:bg-[#171717] h-full overflow-y-auto p-6 space-y-4 border-l border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
                  {inspectVendor.name} · Catalog &amp; Stock
                </h3>
                <p className="text-[11px] text-neutral-500">Live product inventory and sold-out controls</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectVendor(null)}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inspectedProducts.length === 0 ? (
              <p className="text-xs text-neutral-500 py-8 text-center">No products listed for this vendor yet.</p>
            ) : (
              <div className="space-y-2.5 text-xs">
                {inspectedProducts.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-semibold text-[#252525] dark:text-neutral-100">{p.name}</div>
                      <div className="text-[11px] text-neutral-500 font-mono tabular-nums">
                        {formatInr(p.price)} · Stock: {p.stockQty} · {p.inStock ? 'In Stock' : 'Out of Stock'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/products/${p.id}`, {
                            method: 'PATCH',
                            json: { stockQty: p.stockQty + 10, soldOutManual: false },
                          });
                          await onRefresh();
                          notify(`Restocked ${p.name} (+10 units)`, 'success');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-semibold"
                      >
                        +10 Stock
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/admin/products/${p.id}`, {
                            method: 'PATCH',
                            json: { soldOutManual: !p.soldOutManual },
                          });
                          await onRefresh();
                        }}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          p.soldOutManual || !p.inStock
                            ? 'bg-red-600 text-white'
                            : 'border border-neutral-300 dark:border-neutral-700'
                        }`}
                      >
                        {p.soldOutManual ? 'Mark Available' : 'Mark Sold Out'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
