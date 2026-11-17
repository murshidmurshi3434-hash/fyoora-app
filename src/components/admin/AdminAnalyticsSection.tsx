import { useState } from 'react';
import { CategoryDistributionChart, MultiSeriesChart } from './AdminCharts.tsx';
import { formatInr, type AdminOverviewPayload, type ChartMode } from './adminTypes.ts';

interface AdminAnalyticsSectionProps {
  data: AdminOverviewPayload;
  serviceFilter: string;
  paymentFilter: string;
  onChangeFilters: (next: { serviceType?: string; paymentMethod?: string }) => void;
}

type AnalyticsTab = 'revenue' | 'orders' | 'customers' | 'vendors' | 'delivery' | 'categories';

export function AdminAnalyticsSection({
  data,
  serviceFilter,
  paymentFilter,
  onChangeFilters,
}: AdminAnalyticsSectionProps) {
  const [subTab, setSubTab] = useState<AnalyticsTab>('revenue');
  const [chartMode, setChartMode] = useState<ChartMode>('area');
  const [revGranularity, setRevGranularity] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [orderMetricMode, setOrderMetricMode] = useState<'hour' | 'weekday' | 'month'>('hour');

  const revSeries =
    revGranularity === 'daily'
      ? data.analytics.revenueDaily
      : revGranularity === 'weekly'
        ? data.analytics.revenueWeekly
        : revGranularity === 'monthly'
          ? data.analytics.revenueMonthly
          : data.analytics.revenueYearly;

  const isCartesian = chartMode === 'line' || chartMode === 'bar' || chartMode === 'area';

  return (
    <div className="space-y-5">
      {/* Analytics Controls Header */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'revenue', label: 'A. Revenue' },
            { id: 'orders', label: 'B. Orders' },
            { id: 'customers', label: 'C. Customers' },
            { id: 'vendors', label: 'D. Vendors' },
            { id: 'delivery', label: 'E. Delivery' },
            { id: 'categories', label: 'F. Categories & Pickup' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id as AnalyticsTab)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                subTab === t.id
                  ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter analytics by service"
            value={serviceFilter}
            onChange={(e) => onChangeFilters({ serviceType: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium text-[#252525] dark:text-neutral-200"
          >
            <option value="all">All Services</option>
            {data.serviceConfigs.map((s) => (
              <option key={s.serviceKey} value={s.serviceKey}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter analytics by payment method"
            value={paymentFilter}
            onChange={(e) => onChangeFilters({ paymentMethod: e.target.value })}
            className="px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-xs font-medium text-[#252525] dark:text-neutral-200"
          >
            <option value="all">All Payments</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="netbanking">Netbanking</option>
            <option value="cod">Cash on Delivery</option>
          </select>

          <div className="inline-flex items-center rounded-xl bg-neutral-100 dark:bg-neutral-800 p-0.5">
            {(['line', 'bar', 'area', 'pie', 'donut'] as ChartMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setChartMode(m)}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold uppercase transition ${
                  chartMode === m
                    ? 'bg-[#E60023] text-white'
                    : 'text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* A. REVENUE ANALYTICS */}
      {subTab === 'revenue' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
                  Revenue, Commissions, Delivery &amp; Profit Trends
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Window: {data.executive.window.label} · Compare GMV against net revenue, commissions, delivery fee inflow, and operating expenses.
                </p>
              </div>
              <div className="inline-flex gap-1">
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setRevGranularity(g)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize ${
                      revGranularity === g
                        ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {isCartesian ? (
              <MultiSeriesChart
                data={revSeries as unknown as Array<Record<string, string | number>>}
                labelKey="label"
                mode={chartMode as 'line' | 'bar' | 'area'}
                valueFormat="currency"
                height={270}
                series={[
                  { key: 'gmv', label: 'GMV', color: '#E60023' },
                  { key: 'netRevenue', label: 'Net Revenue', color: '#059669' },
                  { key: 'commissions', label: 'Commissions', color: '#4F46E5' },
                  { key: 'deliveryRevenue', label: 'Delivery Fee', color: '#0891B2' },
                  { key: 'expenses', label: 'Expenses', color: '#D97706' },
                  { key: 'netProfit', label: 'Est. Profit', color: '#16A34A' },
                ]}
              />
            ) : (
              <CategoryDistributionChart
                mode={chartMode === 'pie' ? 'pie' : 'donut'}
                items={[
                  { label: 'Vendor Commissions', value: data.executive.summary.vendorCommissions },
                  { label: 'Delivery Revenue', value: data.executive.summary.deliveryRevenue },
                  { label: 'Platform Fees', value: data.executive.summary.platformFees },
                  { label: 'Operating Expenses', value: data.executive.summary.totalOperatingExpenses },
                ]}
              />
            )}
          </div>
        </div>
      )}

      {/* B. ORDER ANALYTICS */}
      {subTab === 'orders' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Average Order Value (AOV)', value: data.analytics.orders.avgOrderValue > 0 ? formatInr(data.analytics.orders.avgOrderValue) : 'No paid orders' },
              {
                label: 'Average Prep Time',
                value: data.analytics.orders.avgPrepTimeMins !== null ? `${data.analytics.orders.avgPrepTimeMins} mins` : 'Not enough data yet',
              },
              {
                label: 'Average Delivery Time',
                value: data.analytics.orders.avgDeliveryTimeMins !== null ? `${data.analytics.orders.avgDeliveryTimeMins} mins` : 'Not enough data yet',
              },
              {
                label: 'Completed vs Cancelled',
                value: `${data.executive.counts.completedOrders} / ${data.executive.counts.cancelledOrders}`,
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{stat.label}</div>
                <div className="font-mono font-bold text-lg text-[#252525] dark:text-neutral-100 tabular-nums mt-1">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                  Order Volume Distribution
                </h3>
                <div className="inline-flex gap-1">
                  {[
                    { id: 'hour', label: 'By Hour' },
                    { id: 'weekday', label: 'By Weekday' },
                    { id: 'month', label: 'By Month' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setOrderMetricMode(m.id as 'hour' | 'weekday' | 'month')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        orderMetricMode === m.id
                          ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {isCartesian ? (
                <MultiSeriesChart
                  data={
                    (orderMetricMode === 'hour'
                      ? data.analytics.orders.byHour
                      : orderMetricMode === 'weekday'
                        ? data.analytics.orders.byWeekday
                        : data.analytics.orders.byMonth) as unknown as Array<Record<string, string | number>>
                  }
                  labelKey="label"
                  mode={chartMode as 'line' | 'bar' | 'area'}
                  valueFormat="integer"
                  series={
                    orderMetricMode === 'month'
                      ? [
                          { key: 'orders', label: 'Orders', color: '#252525' },
                          { key: 'completed', label: 'Completed', color: '#059669' },
                          { key: 'cancelled', label: 'Cancelled', color: '#E60023' },
                        ]
                      : [{ key: 'orders', label: 'Orders', color: '#E60023' }]
                  }
                />
              ) : (
                <CategoryDistributionChart
                  mode={chartMode === 'pie' ? 'pie' : 'donut'}
                  valueFormat="integer"
                  items={data.analytics.orders.statusDistribution.map((s) => ({ label: s.label, value: s.count }))}
                />
              )}
            </div>

            <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                Order Status Breakdown
              </h3>
              <CategoryDistributionChart
                mode={chartMode === 'pie' ? 'pie' : chartMode === 'donut' ? 'donut' : 'bar'}
                valueFormat="integer"
                items={data.analytics.orders.statusDistribution.map((s) => ({
                  label: s.label,
                  value: s.count,
                }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* C. CUSTOMER ANALYTICS */}
      {subTab === 'customers' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Total Customers', value: data.analytics.customers.totals.totalCustomers },
              { label: 'Returning (2+ Orders)', value: data.analytics.customers.totals.returningCustomersCount },
              { label: 'Repeat Purchase Rate', value: `${data.analytics.customers.totals.repeatPurchaseRatePct}%` },
              { label: 'Average Customer LTV', value: formatInr(data.analytics.customers.totals.avgLtv) },
              { label: 'High-Value Customers', value: data.analytics.customers.totals.highValueCount },
            ].map((stat) => (
              <div key={stat.label} className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4">
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{stat.label}</div>
                <div className="font-mono font-bold text-lg text-[#252525] dark:text-neutral-100 tabular-nums mt-1">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                Customer Segment Distribution
              </h3>
              <CategoryDistributionChart
                mode={chartMode === 'pie' ? 'pie' : chartMode === 'donut' ? 'donut' : 'bar'}
                valueFormat="integer"
                items={[
                  { label: 'New', value: data.analytics.customers.totals.newCustomersCount },
                  { label: 'Returning / Regular', value: data.analytics.customers.totals.returningCustomersCount },
                  { label: 'High Value', value: data.analytics.customers.totals.highValueCount },
                  { label: 'At Risk', value: data.analytics.customers.totals.atRiskCount },
                  { label: 'Inactive', value: data.analytics.customers.totals.inactiveCount },
                ]}
              />
            </div>

            <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                Most Active Customers
              </h3>
              {data.analytics.customers.items.length === 0 ? (
                <p className="text-xs text-neutral-500 py-6">No customer profiles registered yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                        <th className="py-2 font-medium">Customer</th>
                        <th className="py-2 font-medium">Segment</th>
                        <th className="py-2 font-medium text-right">Orders</th>
                        <th className="py-2 font-medium text-right">Lifetime Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {data.analytics.customers.items.slice(0, 8).map((c) => (
                        <tr key={c.id}>
                          <td className="py-2 font-medium text-[#252525] dark:text-neutral-200">{c.fullName}</td>
                          <td className="py-2 capitalize text-neutral-500">{c.segment.replace('_', ' ')}</td>
                          <td className="py-2 text-right font-mono tabular-nums">{c.orderCount}</td>
                          <td className="py-2 text-right font-mono tabular-nums font-semibold">{formatInr(c.totalSpend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* D. VENDOR ANALYTICS */}
      {subTab === 'vendors' && (
        <div className="space-y-5">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Vendor GMV &amp; Commission Share
            </h3>
            {isCartesian ? (
              <MultiSeriesChart
                data={data.analytics.vendors.slice(0, 10).map((v) => ({
                  label: v.vendor.name.slice(0, 16),
                  gmv: v.gmv,
                  commission: v.commissionGenerated,
                }))}
                labelKey="label"
                mode={chartMode as 'line' | 'bar' | 'area'}
                series={[
                  { key: 'gmv', label: 'Vendor GMV', color: '#E60023' },
                  { key: 'commission', label: 'Commission', color: '#059669' },
                ]}
              />
            ) : (
              <CategoryDistributionChart
                mode={chartMode === 'pie' ? 'pie' : 'donut'}
                items={data.analytics.vendors.map((v) => ({ label: v.vendor.name, value: v.gmv }))}
              />
            )}
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 overflow-x-auto">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100 mb-3">
              Vendor Performance Ranking ({data.analytics.vendors.length})
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 font-medium">Vendor</th>
                  <th className="py-2 font-medium text-right">Orders</th>
                  <th className="py-2 font-medium text-right">GMV</th>
                  <th className="py-2 font-medium text-right">Commission</th>
                  <th className="py-2 font-medium text-right">Acceptance %</th>
                  <th className="py-2 font-medium text-right">Cancel %</th>
                  <th className="py-2 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.analytics.vendors.map((v) => (
                  <tr key={v.vendor.id}>
                    <td className="py-2.5">
                      <div className="font-semibold text-[#252525] dark:text-neutral-100">{v.vendor.name}</div>
                      <div className="text-[11px] text-neutral-500 capitalize">{v.vendor.serviceCategory.replace('_', ' ')} · {v.vendor.areaName}</div>
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{v.orderCount}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums font-semibold">{formatInr(v.gmv)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{formatInr(v.commissionGenerated)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{v.acceptanceRatePct !== null ? `${v.acceptanceRatePct}%` : '—'}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{v.cancellationRatePct !== null ? `${v.cancellationRatePct}%` : '—'}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums font-bold">{v.performanceScore}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* E. DELIVERY ANALYTICS */}
      {subTab === 'delivery' && (
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                Rider Delivery Performance &amp; Economics
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Success rate, acceptance/rejection rate, avg delivery time, rider earnings and tips.
              </p>
            </div>
            <div className="font-mono text-xs tabular-nums text-neutral-600 dark:text-neutral-300">
              Total Delivery Expenses: <strong>{formatInr(data.executive.summary.deliveryExpenses)}</strong>
            </div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                <th className="py-2 font-medium">Rider</th>
                <th className="py-2 font-medium text-right">Period Deliveries</th>
                <th className="py-2 font-medium text-right">Avg Time</th>
                <th className="py-2 font-medium text-right">Acceptance %</th>
                <th className="py-2 font-medium text-right">Rejection %</th>
                <th className="py-2 font-medium text-right">Success %</th>
                <th className="py-2 font-medium text-right">Period Earnings</th>
                <th className="py-2 font-medium text-right">Period Tips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.analytics.riders.map((r) => (
                <tr key={r.rider.id}>
                  <td className="py-2.5">
                    <div className="font-semibold text-[#252525] dark:text-neutral-100">{r.rider.fullName}</div>
                    <div className="text-[11px] text-neutral-500">{r.rider.vehicleType} · {r.rider.vehicleNumber}</div>
                  </td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.periodDeliveries}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.avgDeliveryMins !== null ? `${r.avgDeliveryMins}m` : '—'}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.acceptanceRatePct !== null ? `${r.acceptanceRatePct}%` : '—'}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.rejectionRatePct !== null ? `${r.rejectionRatePct}%` : '—'}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{r.successRatePct !== null ? `${r.successRatePct}%` : '—'}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums font-semibold">{formatInr(r.periodEarnings)}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{formatInr(r.periodTips)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* F. CATEGORY & SERVICE ANALYTICS */}
      {subTab === 'categories' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Sales by Category &amp; Pickup/Drop
            </h3>
            {isCartesian ? (
              <MultiSeriesChart
                data={data.analytics.services.map((s) => ({
                  label: s.label.split(' ')[0],
                  gmv: s.gmv,
                  netRevenue: s.netRevenue,
                }))}
                labelKey="label"
                mode={chartMode as 'line' | 'bar' | 'area'}
                series={[
                  { key: 'gmv', label: 'GMV', color: '#E60023' },
                  { key: 'netRevenue', label: 'Net Revenue', color: '#059669' },
                ]}
              />
            ) : (
              <CategoryDistributionChart
                mode={chartMode === 'pie' ? 'pie' : 'donut'}
                items={data.analytics.services.map((s) => ({ label: s.label, value: s.gmv }))}
              />
            )}
          </div>

          <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 overflow-x-auto">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100 mb-3">
              Category Revenue Ledger
            </h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 font-medium">Service</th>
                  <th className="py-2 font-medium text-right">Orders</th>
                  <th className="py-2 font-medium text-right">GMV</th>
                  <th className="py-2 font-medium text-right">Net Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.analytics.services.map((s) => (
                  <tr key={s.serviceKey}>
                    <td className="py-2.5 font-medium text-[#252525] dark:text-neutral-200">
                      {s.label}
                      {!s.enabled && <span className="ml-1.5 text-[10px] text-amber-600">(Disabled)</span>}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums">{s.orders}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums font-semibold">{formatInr(s.gmv)}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">{formatInr(s.netRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
