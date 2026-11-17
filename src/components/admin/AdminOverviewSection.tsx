import { useState } from 'react';
import { ArrowUpRight, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import type { HealthStatus } from '../../context/AppContext.tsx';
import type { KpiMetric } from '../../shared/adminAnalytics.ts';
import { CategoryDistributionChart, MultiSeriesChart, SparklineChart } from './AdminCharts.tsx';
import { formatInr, formatShortDateTime, type AdminOverviewPayload, type AdminSectionKey } from './adminTypes.ts';

interface AdminOverviewSectionProps {
  data: AdminOverviewPayload;
  health: HealthStatus | null;
  onNavigate: (section: AdminSectionKey) => void;
}

function formatKpiValue(kpi: KpiMetric): string {
  if (kpi.format === 'currency') return formatInr(kpi.value);
  if (kpi.format === 'percent') return `${kpi.value}%`;
  return kpi.value.toLocaleString('en-IN');
}

function KpiCard({
  kpi,
  prevLabel,
  onNavigate,
}: {
  kpi: KpiMetric;
  prevLabel: string;
  onNavigate: (section: AdminSectionKey) => void;
}) {
  const isPositive = kpi.changePct === null ? true : kpi.changePct >= 0;
  const isCostOrNegative = ['refunds', 'cancelled_orders', 'delivery_expenses', 'operating_expenses', 'gateway_fees'].includes(kpi.id);
  const deltaTone =
    kpi.changePct === null
      ? 'text-neutral-500 dark:text-neutral-400'
      : kpi.changePct === 0
        ? 'text-neutral-500 dark:text-neutral-400'
        : isCostOrNegative
          ? kpi.changePct > 0
            ? 'text-red-600 dark:text-red-400'
            : 'text-emerald-700 dark:text-emerald-400'
          : kpi.changePct >= 0
            ? 'text-emerald-700 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400';

  return (
    <button
      type="button"
      onClick={() => onNavigate(kpi.targetSection as AdminSectionKey)}
      className="group text-left bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 hover:border-[#E60023]/60 transition flex flex-col justify-between gap-2.5"
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 leading-snug">
          {kpi.label}
        </span>
        <ArrowUpRight className="w-3.5 h-3.5 text-neutral-400 group-hover:text-[#E60023] shrink-0 transition" />
      </div>

      <div className="flex items-end justify-between gap-2 w-full">
        <div className="min-w-0">
          <div className="font-mono font-bold text-xl sm:text-2xl text-[#252525] dark:text-neutral-100 tabular-nums tracking-tight">
            {formatKpiValue(kpi)}
          </div>
          <div className={`mt-1 inline-flex items-center gap-1 text-[11px] font-mono tabular-nums ${deltaTone}`}>
            {kpi.changePct !== null ? (
              <>
                {kpi.changePct >= 0 ? (
                  <TrendingUp className="w-3 h-3 shrink-0" />
                ) : (
                  <TrendingDown className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {kpi.changePct > 0 ? `+${kpi.changePct}%` : `${kpi.changePct}%`} vs {prevLabel}
                </span>
              </>
            ) : (
              <span className="font-sans text-neutral-400 dark:text-neutral-500">
                {kpi.subtitle || prevLabel}
              </span>
            )}
          </div>
        </div>

        <SparklineChart values={kpi.sparkline} positive={isPositive} />
      </div>
    </button>
  );
}

export function AdminOverviewSection({ data, health, onNavigate }: AdminOverviewSectionProps) {
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [chartType, setChartType] = useState<'area' | 'bar' | 'line'>('area');

  const series =
    chartGranularity === 'daily'
      ? data.analytics.revenueDaily
      : chartGranularity === 'weekly'
        ? data.analytics.revenueWeekly
        : data.analytics.revenueMonthly;

  const serviceSlices = data.analytics.services
    .filter((s) => s.gmv > 0 || s.orders > 0)
    .map((s) => ({
      label: s.label,
      value: s.gmv > 0 ? s.gmv : s.orders,
    }));

  const unacknowledgedAlerts = data.alerts.filter((a) => !a.acknowledged);

  return (
    <div className="space-y-6">
      {/* Financial KPIs (10 Requested Metrics) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
              Financial Performance ({data.executive.window.label})
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              All values computed live from captured orders, vendor commission splits, rider payouts, and recorded expenses.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('ai_bi')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E60023] text-white text-xs font-semibold hover:bg-[#c9001e] transition shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask AI BI Copilot
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.executive.financialKpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              prevLabel={data.executive.window.prevLabel}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </section>

      {/* Operations KPIs (12 Requested Metrics) */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
            Marketplace Operations Snapshot
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('live_ops')}
            className="text-xs font-semibold text-[#E60023] hover:underline"
          >
            Open Live Command Centre →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {data.executive.operationsKpis.map((kpi) => (
            <KpiCard
              key={kpi.id}
              kpi={kpi}
              prevLabel={data.executive.window.prevLabel}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </section>

      {/* Primary Charts Row */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                GMV vs Net Platform Revenue &amp; Expenses
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Click legend labels to isolate individual financial series.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['daily', 'weekly', 'monthly'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setChartGranularity(g)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                    chartGranularity === g
                      ? 'bg-[#252525] dark:bg-white text-white dark:text-[#252525]'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {g}
                </button>
              ))}
              <span className="text-neutral-300 dark:text-neutral-700 mx-1">|</span>
              {(['area', 'bar', 'line'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setChartType(t)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize transition ${
                    chartType === t
                      ? 'bg-[#E60023] text-white'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <MultiSeriesChart
            data={series as unknown as Array<Record<string, string | number>>}
            labelKey="label"
            mode={chartType}
            valueFormat="currency"
            series={[
              { key: 'gmv', label: 'GMV', color: '#E60023' },
              { key: 'netRevenue', label: 'Net Revenue', color: '#059669' },
              { key: 'expenses', label: 'Operating Expenses', color: '#D97706' },
            ]}
          />
        </div>

        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
                Revenue by Service
              </h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Across all 8 FYOORA Vadakara verticals
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('services')}
              className="text-[11px] font-semibold text-[#E60023] hover:underline shrink-0"
            >
              Manage
            </button>
          </div>
          <CategoryDistributionChart
            items={serviceSlices}
            mode="donut"
            valueFormat="currency"
            emptyMessage="Captured service orders inside this period will render service share here."
          />
        </div>
      </section>

      {/* Active Operational Alerts & Live Feed Preview */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Active System Alerts ({unacknowledgedAlerts.length} unacknowledged)
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('alerts')}
              className="text-xs font-semibold text-[#E60023] hover:underline"
            >
              View Alert Centre
            </button>
          </div>
          {data.alerts.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4">
              All marketplace thresholds are healthy. Zero active alerts.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.alerts.slice(0, 5).map((alt) => (
                <div key={alt.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          alt.priority === 'critical'
                            ? 'bg-red-600'
                            : alt.priority === 'high'
                              ? 'bg-amber-500'
                              : alt.priority === 'medium'
                                ? 'bg-blue-500'
                                : 'bg-neutral-400'
                        }`}
                      />
                      <span className={`font-semibold text-[#252525] dark:text-neutral-100 ${alt.acknowledged ? 'opacity-60 line-through' : ''}`}>
                        {alt.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 pl-4">
                      {alt.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate(alt.targetSection as AdminSectionKey)}
                    className="text-[11px] font-semibold text-[#E60023] hover:underline shrink-0"
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
              Recent Activity Stream
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('live_ops')}
              className="text-xs font-semibold text-[#E60023] hover:underline"
            >
              Live Queue
            </button>
          </div>
          {data.liveOps.activityFeed.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4">
              No marketplace activity recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.liveOps.activityFeed.slice(0, 6).map((evt) => (
                <div key={evt.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-[#252525] dark:text-neutral-100 truncate">{evt.title}</div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">{evt.subtitle}</div>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0 tabular-nums">
                    {formatShortDateTime(evt.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Platform Integrations Matrix (Preserved from original dashboard) */}
      <section className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">
            Platform Integrations &amp; Runtime Status
          </h3>
          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Optional integrations stay safely disabled until configured
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 text-xs">
          {[
            {
              name: 'Firebase Google Sign-In',
              configured: Boolean(health?.auth?.googleAuthConfigured),
              label: health?.auth?.googleAuthConfigured ? 'Configured' : 'PENDING CONFIGURATION',
            },
            {
              name: 'Firebase Phone Auth (+91 OTP)',
              configured: Boolean(health?.auth?.phoneAuth.configured && health?.auth?.phoneAuth.provider === 'firebase_phone'),
              label:
                health?.auth?.phoneAuth.provider === 'firebase_phone'
                  ? health.auth.phoneAuth.statusLabel
                  : 'PENDING CONFIGURATION',
            },
            {
              name: 'SMS OTP Provider',
              configured: Boolean(health?.smsGatewayConfigured),
              label: health?.smsGatewayConfigured ? 'Configured' : 'PENDING CONFIGURATION',
            },
            {
              name: 'Razorpay Checkout Gateway',
              configured: Boolean(health?.razorpay.configured),
              label: health?.razorpay.statusLabel || 'PENDING CONFIGURATION',
            },
            {
              name: `Razorpay Webhook`,
              configured: Boolean(health?.razorpay.webhookConfigured),
              label: health?.razorpay.webhookStatusLabel || 'PENDING CONFIGURATION',
            },
            {
              name: 'Gemini AI (Customer + BI)',
              configured: Boolean(health?.geminiConfigured),
              label: health?.geminiConfigured ? 'Configured' : 'PENDING CONFIGURATION',
            },
            {
              name: 'Google Maps Platform',
              configured: Boolean(health?.mapsConfigured),
              label: health?.mapsConfigured ? 'Configured' : 'PENDING CONFIGURATION',
            },
          ].map((item) => (
            <div
              key={item.name}
              className="px-3 py-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800 flex items-center justify-between gap-2"
            >
              <span className="font-medium text-[#252525] dark:text-neutral-200 truncate">{item.name}</span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                  item.configured
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300'
                }`}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
