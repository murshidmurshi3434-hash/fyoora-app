import { useState } from 'react';
import { Eye, Search, ShieldAlert, X } from 'lucide-react';
import { apiRequest } from '../../lib/api.ts';
import type { Order, SavedAddress, SupportTicket } from '../../shared/types.ts';
import { formatInr, formatShortDateTime, type AdminOverviewPayload } from './adminTypes.ts';

interface AdminCustomersSectionProps {
  data: AdminOverviewPayload;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onConfirmAction: (cfg: { title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void> }) => void;
}

interface CustomerDetailResponse {
  customer: {
    id: string;
    fullName: string;
    phone: string;
    email?: string;
    accountStatus: string;
    profileCompleted: boolean;
    loyaltyPoints: number;
    referralCode: string;
    addressesCount: number;
    addresses: SavedAddress[];
    createdAt: string;
  };
  orders: Order[];
  tickets: SupportTicket[];
}

export function AdminCustomersSection({
  data,
  onRefresh,
  notify,
  onConfirmAction,
}: AdminCustomersSectionProps) {
  const [search, setSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'new' | 'regular' | 'high_value' | 'inactive' | 'at_risk'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<CustomerDetailResponse | null>(null);

  const customers = data.analytics.customers.items;
  const totals = data.analytics.customers.totals;

  const filtered = customers.filter((c) => {
    if (segmentFilter !== 'all' && c.segment !== segmentFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${c.fullName} ${c.phone} ${c.email || ''} ${c.favouriteCategories.join(' ')}`
      .toLowerCase()
      .includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const openCustomerDrawer = async (customerId: string) => {
    setDetailLoading(true);
    try {
      const res = await apiRequest<CustomerDetailResponse>(`/api/admin/customers/${customerId}`);
      setSelectedDetail(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to load customer detail', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Segment Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Customers', value: totals.totalCustomers },
          { label: 'New Customers', value: totals.newCustomersCount },
          { label: 'Returning (2+)', value: totals.returningCustomersCount },
          { label: 'High Value', value: totals.highValueCount },
          { label: 'At Risk / Inactive', value: totals.atRiskCount + totals.inactiveCount },
          { label: 'Repeat Rate / LTV', value: `${totals.repeatPurchaseRatePct}% · ${formatInr(totals.avgLtv)}` },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{card.label}</div>
            <div className="font-mono font-bold text-lg text-[#252525] dark:text-neutral-100 tabular-nums mt-1">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: `All (${customers.length})` },
            { id: 'high_value', label: `High-Value (${totals.highValueCount})` },
            { id: 'regular', label: 'Regular' },
            { id: 'new', label: `New (${totals.newCustomersCount})` },
            { id: 'at_risk', label: `At-Risk (${totals.atRiskCount})` },
            { id: 'inactive', label: `Inactive (${totals.inactiveCount})` },
          ].map((seg) => (
            <button
              key={seg.id}
              type="button"
              onClick={() => {
                setSegmentFilter(seg.id as typeof segmentFilter);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                segmentFilter === seg.id
                  ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {seg.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, phone, or email..."
            aria-label="Search customer accounts"
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 overflow-x-auto space-y-4">
        {paged.length === 0 ? (
          <p className="py-8 text-center text-xs text-neutral-500">No customer accounts match this filter.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Segment</th>
                <th className="py-2 font-medium text-right">Orders</th>
                <th className="py-2 font-medium text-right">Total Spend</th>
                <th className="py-2 font-medium text-right">AOV</th>
                <th className="py-2 font-medium text-right">Refunds / Complaints</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {paged.map((c) => (
                <tr key={c.id}>
                  <td className="py-3 pr-3">
                    <div className="font-semibold text-[#252525] dark:text-neutral-100">{c.fullName}</div>
                    <div className="text-[11px] text-neutral-500">
                      {c.phone}
                      {c.email ? ` · ${c.email}` : ''}
                    </div>
                    <div className="text-[10px] text-neutral-400 mt-0.5">
                      Joined {new Date(c.createdAt).toLocaleDateString()} · {c.favouriteCategories.join(', ') || 'No orders yet'}
                    </div>
                  </td>
                  <td className="py-3 capitalize font-medium text-neutral-700 dark:text-neutral-300">
                    {c.segment.replace('_', ' ')}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">{c.orderCount}</td>
                  <td className="py-3 text-right font-mono tabular-nums font-semibold">{formatInr(c.totalSpend)}</td>
                  <td className="py-3 text-right font-mono tabular-nums">{formatInr(c.avgOrderValue)}</td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    {c.refundCount} / {c.complaintCount}
                  </td>
                  <td className="py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        c.accountStatus === 'active'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : c.accountStatus === 'suspended'
                            ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {c.accountStatus.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => void openCustomerDrawer(c.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 font-semibold text-[#252525] dark:text-neutral-200 hover:border-[#E60023]"
                    >
                      <Eye className="w-3 h-3" /> Inspect
                    </button>
                    {c.accountStatus !== 'deletion_requested' && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextStatus = c.accountStatus === 'suspended' ? 'active' : 'suspended';
                          onConfirmAction({
                            title: `${nextStatus === 'suspended' ? 'Suspend' : 'Reactivate'} Customer Account?`,
                            body: `${c.fullName} (${c.phone}) will be ${nextStatus === 'suspended' ? 'blocked from placing orders' : 'restored to active customer access'}.`,
                            confirmLabel: nextStatus === 'suspended' ? 'Suspend Account' : 'Reactivate Account',
                            onConfirm: async () => {
                              await apiRequest(`/api/admin/customers/${c.id}/status`, {
                                method: 'PATCH',
                                json: { status: nextStatus },
                              });
                              await onRefresh();
                              notify(
                                `${c.fullName} account ${nextStatus === 'active' ? 'reactivated' : 'suspended'}`,
                                'success'
                              );
                            },
                          });
                        }}
                        className={`px-2.5 py-1 rounded-lg font-semibold ${
                          c.accountStatus === 'suspended'
                            ? 'bg-emerald-700 text-white'
                            : 'bg-[#252525] dark:bg-neutral-800 text-white'
                        }`}
                      >
                        {c.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-neutral-500">
            <span>
              Page {currentPage} of {totalPages} ({filtered.length} customers)
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Customer PII Profile Inspection Drawer */}
      {(detailLoading || selectedDetail) && (
        <div className="fixed inset-0 z-50 bg-black/45 flex justify-end">
          <div className="w-full max-w-lg bg-white dark:bg-[#171717] h-full overflow-y-auto p-6 space-y-5 border-l border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
                  Customer Profile &amp; PII Audit View
                </h3>
                <p className="text-[11px] text-neutral-500">Access to personal details is recorded in Security Audit Logs.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading || !selectedDetail ? (
              <div className="py-12 text-center text-xs text-neutral-500">Loading customer profile...</div>
            ) : (
              <div className="space-y-5 text-xs">
                <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                  <div className="font-bold text-sm text-[#252525] dark:text-neutral-100">
                    {selectedDetail.customer.fullName}
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-300">
                    Phone: {selectedDetail.customer.phone} · Email: {selectedDetail.customer.email || '—'}
                  </div>
                  <div className="text-neutral-500 font-mono">
                    Referral: {selectedDetail.customer.referralCode} · Loyalty: {selectedDetail.customer.loyaltyPoints} pts
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-[#252525] dark:text-neutral-200 mb-2">
                    Saved Delivery Addresses ({selectedDetail.customer.addresses.length})
                  </h4>
                  {selectedDetail.customer.addresses.length === 0 ? (
                    <p className="text-neutral-500">No saved addresses yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDetail.customer.addresses.map((addr) => (
                        <div key={addr.id} className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                          <div className="font-semibold">{addr.label} · {addr.city} ({addr.pincode})</div>
                          <div className="text-neutral-500">{addr.line1}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-[#252525] dark:text-neutral-200 mb-2">
                    Order History ({selectedDetail.orders.length})
                  </h4>
                  {selectedDetail.orders.length === 0 ? (
                    <p className="text-neutral-500">No orders placed yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDetail.orders.map((ord) => (
                        <div key={ord.id} className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                          <div>
                            <div className="font-mono font-bold text-[#E60023]">{ord.orderNumber}</div>
                            <div className="text-neutral-500">{ord.vendorName || 'Pickup & Drop'} · {formatShortDateTime(ord.createdAt)}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold">{formatInr(ord.pricing.grandTotal)}</div>
                            <div className="uppercase text-[10px] text-neutral-500">{ord.status.replace(/_/g, ' ')}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-[#252525] dark:text-neutral-200 mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-[#E60023]" />
                    Support Tickets ({selectedDetail.tickets.length})
                  </h4>
                  {selectedDetail.tickets.length === 0 ? (
                    <p className="text-neutral-500">No support complaints filed.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedDetail.tickets.map((t) => (
                        <div key={t.id} className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-800">
                          <div className="font-semibold">{t.subject}</div>
                          <div className="text-neutral-500 uppercase text-[10px]">{t.status} · {formatShortDateTime(t.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
