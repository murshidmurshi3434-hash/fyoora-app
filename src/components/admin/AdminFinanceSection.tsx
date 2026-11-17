import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import type { HealthStatus } from '../../context/AppContext.tsx';
import { apiRequest } from '../../lib/api.ts';
import type { Order } from '../../shared/types.ts';
import {
  downloadFromAdminApi,
  formatInr,
  formatShortDateTime,
  type AdminOverviewPayload,
} from './adminTypes.ts';

interface AdminFinanceSectionProps {
  data: AdminOverviewPayload;
  health: HealthStatus | null;
  onRefresh: () => Promise<void>;
  notify: (msg: string, type?: 'success' | 'error') => void;
  onConfirmAction: (cfg: { title: string; body: string; confirmLabel: string; onConfirm: () => Promise<void> }) => void;
}

type FinanceTab = 'settlements' | 'refunds_payments' | 'ledgers' | 'expenses';

export function AdminFinanceSection({
  data,
  health,
  onRefresh,
  notify,
  onConfirmAction,
}: AdminFinanceSectionProps) {
  const [subTab, setSubTab] = useState<FinanceTab>('settlements');
  const [settlementRefs, setSettlementRefs] = useState<Record<string, string>>({});
  const [settlementStatusFilter, setSettlementStatusFilter] = useState<'all' | 'pending' | 'settled' | 'failed'>('all');

  // Expense form
  const [expCategory, setExpCategory] = useState<'delivery_ops' | 'marketing' | 'infrastructure' | 'support' | 'other'>('delivery_ops');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const summary = data.executive.summary;
  const filteredSettlements = data.settlements.filter((s) =>
    settlementStatusFilter === 'all' ? true : s.status === settlementStatusFilter
  );

  const refundableOrders = data.orders.filter(
    (o) => ['cancelled', 'refund_pending', 'refunded'].includes(o.status) || o.paymentStatus === 'refund_pending' || o.paymentStatus === 'refunded'
  );

  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expDescription.trim() || !Number(expAmount)) return;
    setSavingExpense(true);
    try {
      await apiRequest('/api/admin/expenses', {
        method: 'POST',
        json: {
          category: expCategory,
          description: expDescription.trim(),
          amountInr: Number(expAmount),
        },
      });
      setExpDescription('');
      setExpAmount('');
      await onRefresh();
      notify('Operating expense recorded in financial ledger', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to record expense', 'error');
    } finally {
      setSavingExpense(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Financial Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'GMV', value: formatInr(summary.gmv) },
          { label: 'Net Platform Revenue', value: formatInr(summary.netPlatformRevenue) },
          { label: 'Vendor Commissions', value: formatInr(summary.vendorCommissions) },
          { label: 'Razorpay MDR + Ops Exp', value: formatInr(summary.totalOperatingExpenses) },
          { label: 'Estimated Net Profit', value: formatInr(summary.estimatedNetProfit) },
        ].map((card) => (
          <div key={card.label} className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{card.label}</div>
            <div className="font-mono font-bold text-xl text-[#252525] dark:text-neutral-100 tabular-nums mt-1">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Sub-navigation + Exports */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'settlements', label: `Settlements & Payouts (${data.settlements.length})` },
            { id: 'refunds_payments', label: `Razorpay & Refunds (${data.paymentTransactions.length})` },
            { id: 'ledgers', label: 'Commission & Rider Ledgers' },
            { id: 'expenses', label: `Operating Expenses (${data.expenses.length})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as FinanceTab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                subTab === t.id
                  ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void downloadFromAdminApi(
                `/api/admin/reports/export?reportType=financial&format=csv&preset=${data.executive.window.preset}`,
                `fyoora-pnl-${new Date().toISOString().slice(0, 10)}.csv`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-[#252525] dark:text-neutral-200 hover:border-[#E60023]"
          >
            <Download className="w-3.5 h-3.5" /> P&amp;L CSV
          </button>
          <button
            type="button"
            onClick={() =>
              void downloadFromAdminApi(
                `/api/admin/reports/export?reportType=settlements&format=xls&preset=${data.executive.window.preset}`,
                `fyoora-settlements-${new Date().toISOString().slice(0, 10)}.xls`
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-[#252525] dark:text-neutral-200 hover:border-[#E60023]"
          >
            <Download className="w-3.5 h-3.5" /> Settlements Excel
          </button>
        </div>
      </div>

      {/* 1. SETTLEMENTS & PAYOUTS */}
      {subTab === 'settlements' && (
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['all', 'pending', 'settled', 'failed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setSettlementStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${
                    settlementStatusFilter === st
                      ? 'bg-[#E60023] text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiRequest('/api/admin/settlements/generate', {
                    method: 'POST',
                    json: { periodLabel: `Vadakara Cycle ${new Date().toISOString().slice(0, 10)}` },
                  });
                  await onRefresh();
                  notify('Settlement batch generated for delivered vendor and rider balances', 'success');
                } catch (err) {
                  notify(err instanceof Error ? err.message : 'Unable to generate settlements', 'error');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-[#252525] dark:bg-white text-white dark:text-[#252525] text-xs font-semibold"
            >
              + Generate Settlement Batch
            </button>
          </div>

          <p className="text-[11px] text-amber-900 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl px-3.5 py-2.5">
            Send each payout through your bank first. Recording the transfer reference here updates the ledger; it does not move money.
          </p>

          {filteredSettlements.length === 0 ? (
            <p className="text-xs text-neutral-500 py-8 text-center">No settlement records match this filter.</p>
          ) : (
            <div className="space-y-2.5">
              {filteredSettlements.map((s) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#252525] dark:text-neutral-100">
                      {s.recipientName}{' '}
                      <span className="font-normal text-neutral-500">({s.recipientType}) · {s.periodLabel}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500 font-mono tabular-nums mt-0.5">
                      Gross {formatInr(s.grossAmount)} · Fee/Comm {formatInr(s.commissionOrFee)} · Tips {formatInr(s.tipsIncluded)}
                    </div>
                    {s.transferReference && (
                      <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-1">
                        Bank UTR: {s.transferReference} {s.settledAt ? `· ${formatShortDateTime(s.settledAt)}` : ''}
                      </div>
                    )}
                    {s.failureReason && (
                      <div className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                        Failure reason: {s.failureReason}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="font-mono font-bold tabular-nums text-sm text-[#252525] dark:text-neutral-100">
                      Net {formatInr(s.netPayout)} ·{' '}
                      <span
                        className={`uppercase text-xs ${
                          s.status === 'settled'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : s.status === 'failed'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {s.status}
                      </span>
                    </span>

                    {(s.status === 'pending' || s.status === 'failed') && (
                      <>
                        <input
                          aria-label={`Transfer reference for ${s.recipientName}`}
                          value={settlementRefs[s.id] || ''}
                          onChange={(event) =>
                            setSettlementRefs((prev) => ({ ...prev, [s.id]: event.target.value }))
                          }
                          placeholder="Bank UTR / transfer ref"
                          maxLength={50}
                          className="w-44 px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-xs font-mono"
                        />
                        <button
                          type="button"
                          disabled={(settlementRefs[s.id] || '').trim().length < 6}
                          onClick={async () => {
                            try {
                              await apiRequest(`/api/admin/settlements/${s.id}`, {
                                method: 'PATCH',
                                json: { status: 'settled', transferReference: settlementRefs[s.id]?.trim() },
                              });
                              await onRefresh();
                              notify(`Recorded ${s.recipientName} payout`, 'success');
                            } catch (err) {
                              notify(err instanceof Error ? err.message : 'Unable to record payout', 'error');
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Confirm Paid
                        </button>
                        {s.status === 'pending' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/admin/settlements/${s.id}`, {
                                method: 'PATCH',
                                json: { status: 'failed', failureReason: 'Bank transfer verification pending' },
                              });
                              await onRefresh();
                              notify(`Marked ${s.recipientName} payout as failed`, 'error');
                            }}
                            className="px-2.5 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 font-semibold"
                          >
                            Mark Failed
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. RAZORPAY GATEWAY RECONCILIATION & REFUNDS */}
      {subTab === 'refunds_payments' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Refunds &amp; Razorpay Reconciliation ({refundableOrders.length})
            </h3>
            {refundableOrders.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6">No cancelled or refunded orders inside the active window.</p>
            ) : (
              <div className="space-y-2.5">
                {refundableOrders.map((o) => (
                  <div
                    key={o.id}
                    className="p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-[#E60023]">{o.orderNumber}</div>
                      <div className="font-semibold text-[#252525] dark:text-neutral-100">
                        {o.customerName} · {o.vendorName || 'Pickup & Drop'}
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Order: {o.status.replace(/_/g, ' ')} · Payment: {o.paymentMethod.toUpperCase()} ({o.paymentStatus})
                        {o.razorpayPaymentId ? ` · Razorpay: ${o.razorpayPaymentId}` : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm tabular-nums">{formatInr(o.pricing.grandTotal)}</span>
                      {['cancelled', 'refund_pending'].includes(o.status) && o.paymentStatus !== 'refunded' ? (
                        o.razorpayPaymentId && ['captured', 'refund_pending'].includes(o.paymentStatus) ? (
                          <button
                            type="button"
                            disabled={!health?.razorpay.configured || o.razorpayRefundStatus === 'processed'}
                            onClick={() => {
                              const isReconcile = o.razorpayRefundStatus === 'pending' || Boolean(o.refundRequestStartedAt);
                              const run = async () => {
                                try {
                                  const result = await apiRequest<{ refundStatus?: string; found?: boolean; order: Order }>(
                                    `/api/admin/orders/${o.id}/${isReconcile ? 'refund-status' : 'refund'}`,
                                    { method: 'POST', json: {} }
                                  );
                                  await onRefresh();
                                  if (isReconcile && result.found === false) {
                                    notify('Razorpay has no matching refund record yet. Check again later.', 'error');
                                  } else if (result.refundStatus === 'processed') {
                                    notify(`Refund processed for ${o.orderNumber}`, 'success');
                                  } else {
                                    notify(`Razorpay refund status: ${result.refundStatus || 'pending'}`, 'success');
                                  }
                                } catch (err) {
                                  notify(err instanceof Error ? err.message : 'Unable to process refund action', 'error');
                                }
                              };
                              if (isReconcile) {
                                void run();
                              } else {
                                onConfirmAction({
                                  title: `Issue Full Razorpay Refund for ${o.orderNumber}?`,
                                  body: `This will send a live refund request of ${formatInr(o.pricing.grandTotal)} to Razorpay for payment ${o.razorpayPaymentId}.`,
                                  confirmLabel: 'Request Razorpay Refund',
                                  onConfirm: run,
                                });
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#252525] dark:bg-white text-white dark:text-[#252525] font-semibold disabled:opacity-45"
                          >
                            {o.razorpayRefundStatus === 'pending'
                              ? 'Refresh Refund Status'
                              : o.refundRequestStartedAt && !o.razorpayRefundStatus
                                ? 'Check Refund Status'
                                : o.razorpayRefundStatus === 'processed'
                                  ? 'Partial Refund Review'
                                  : 'Request Refund'}
                          </button>
                        ) : (
                          <span className="text-[11px] text-neutral-500">
                            {o.razorpayPaymentId ? 'Not eligible' : 'COD handled externally'}
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                          {o.paymentStatus}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 overflow-x-auto">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100 mb-3">
              Payment Gateway Transactions ({data.paymentTransactions.length})
            </h3>
            {data.paymentTransactions.length === 0 ? (
              <p className="text-xs text-neutral-500 py-4">No payment gateway transactions recorded yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                    <th className="py-2 font-medium">Transaction ID</th>
                    <th className="py-2 font-medium">Order</th>
                    <th className="py-2 font-medium">Gateway</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Amount</th>
                    <th className="py-2 font-medium text-right">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {data.paymentTransactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2 font-mono text-[11px]">{tx.gatewayPaymentId || tx.gatewayOrderId || tx.id}</td>
                      <td className="py-2 font-mono">{tx.orderId}</td>
                      <td className="py-2 uppercase">{tx.gateway}</td>
                      <td className="py-2 uppercase font-semibold">{tx.status}</td>
                      <td className="py-2 text-right font-mono tabular-nums font-semibold">{formatInr(tx.amount)}</td>
                      <td className="py-2 text-right font-mono text-neutral-500">{formatShortDateTime(tx.updatedAt || tx.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* 3. VENDOR COMMISSIONS & RIDER EARNINGS LEDGERS */}
      {subTab === 'ledgers' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 overflow-x-auto">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100 mb-3">
              Vendor Commission Ledger
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 font-medium">Vendor</th>
                  <th className="py-2 font-medium text-right">Rate</th>
                  <th className="py-2 font-medium text-right">GMV</th>
                  <th className="py-2 font-medium text-right">Commission</th>
                  <th className="py-2 font-medium text-right">Net Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.analytics.vendors.map((v) => (
                  <tr key={v.vendor.id}>
                    <td className="py-2 font-medium text-[#252525] dark:text-neutral-200">{v.vendor.name}</td>
                    <td className="py-2 text-right font-mono tabular-nums">{Math.round(v.vendor.commissionRate * 100)}%</td>
                    <td className="py-2 text-right font-mono tabular-nums">{formatInr(v.gmv)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{formatInr(v.commissionGenerated)}</td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold">{formatInr(v.netPayout)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 overflow-x-auto">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100 mb-3">
              Rider Earnings &amp; Tips Ledger
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 font-medium">Rider</th>
                  <th className="py-2 font-medium text-right">Lifetime Earnings</th>
                  <th className="py-2 font-medium text-right">Tips Total</th>
                  <th className="py-2 font-medium text-right">Pending Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.riders.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 font-medium text-[#252525] dark:text-neutral-200">{r.fullName}</td>
                    <td className="py-2 text-right font-mono tabular-nums font-semibold">{formatInr(r.earningsTotal)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{formatInr(r.tipsTotal)}</td>
                    <td className="py-2 text-right font-mono tabular-nums text-[#E60023] font-semibold">{formatInr(r.pendingSettlement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. OPERATING EXPENSES */}
      {subTab === 'expenses' && (
        <div className="space-y-5">
          <form
            onSubmit={handleLogExpense}
            className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 grid sm:grid-cols-4 gap-3 items-end"
          >
            <div>
              <label className="text-xs font-semibold block mb-1 text-[#252525] dark:text-neutral-200">Category</label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value as typeof expCategory)}
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              >
                <option value="delivery_ops">Delivery Ops</option>
                <option value="marketing">Marketing</option>
                <option value="infrastructure">Infrastructure / Cloud</option>
                <option value="support">Support / Staffing</option>
                <option value="other">Other Expense</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-[#252525] dark:text-neutral-200">Description</label>
              <input
                type="text"
                required
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                placeholder="e.g., Vadakara Monsoon Rider Bonus"
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1 text-[#252525] dark:text-neutral-200">Amount (₹)</label>
              <input
                type="number"
                required
                min={1}
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={savingExpense}
              className="py-2.5 px-4 rounded-xl bg-[#E60023] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Record Expense
            </button>
          </form>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100 mb-3">
              Recorded Operating Expenses ({data.expenses.length})
            </h3>
            {data.expenses.length === 0 ? (
              <p className="text-xs text-neutral-500 py-4">No additional operating expenses logged yet.</p>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                {data.expenses.map((exp) => (
                  <div key={exp.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[#252525] dark:text-neutral-100">{exp.description}</div>
                      <div className="text-[11px] text-neutral-500 capitalize">
                        {exp.category.replace('_', ' ')} · Recorded by {exp.createdBy} · {formatShortDateTime(exp.incurredOn)}
                      </div>
                    </div>
                    <span className="font-mono font-bold tabular-nums text-[#E60023]">{formatInr(exp.amountInr)}</span>
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
