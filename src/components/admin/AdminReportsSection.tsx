import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import {
  downloadFromAdminApi,
  formatInr,
  type AdminOverviewPayload,
  type GlobalDateState,
} from './adminTypes.ts';

interface AdminReportsSectionProps {
  data: AdminOverviewPayload;
  dateState: GlobalDateState;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

const REPORT_CARDS = [
  {
    id: 'orders',
    title: 'Orders & Dispatch Report',
    description: 'Order numbers, service vertical, vendor, pricing breakdown, payment mode, and status.',
  },
  {
    id: 'financial',
    title: 'Profit & Loss Statement (P&L)',
    description: 'GMV, vendor commissions, delivery revenue, net platform revenue, expenses, and estimated net profit.',
  },
  {
    id: 'settlements',
    title: 'Settlements & Payout Ledger',
    description: 'Vendor and rider gross balances, fees, tips, net payouts, bank UTRs, and statuses.',
  },
  {
    id: 'vendors',
    title: 'Vendor Performance Report',
    description: 'GMV, commissions, delivered vs cancelled counts, ratings, and performance scores per partner.',
  },
  {
    id: 'riders',
    title: 'Rider Earnings & Delivery Report',
    description: 'Period deliveries, all-time completions, earnings, rider tips, and pending settlements.',
  },
  {
    id: 'customers',
    title: 'Customer Growth & Segmentation',
    description: 'Segments (new/regular/high-value/at-risk), order counts, spend, AOV, and loyalty points.',
  },
  {
    id: 'services',
    title: 'Service Category Breakdown',
    description: 'Orders, completions, GMV, commissions, and net revenue across all 8 FYOORA services.',
  },
  {
    id: 'marketing',
    title: 'Marketing & Coupon Redemptions',
    description: 'Coupon redemptions, total discount issued, active state, and attributed GMV.',
  },
  {
    id: 'tax',
    title: 'Platform Tax & Payment Fee Summary',
    description: 'Captured order subtotals, platform fee, commissions, and estimated Razorpay MDR fees.',
  },
];

export function AdminReportsSection({ data, dateState, notify }: AdminReportsSectionProps) {
  const queryParams = new URLSearchParams({
    preset: dateState.preset,
    ...(dateState.startDate ? { startDate: dateState.startDate } : {}),
    ...(dateState.endDate ? { endDate: dateState.endDate } : {}),
  }).toString();

  const handleDownload = async (reportType: string, format: 'csv' | 'xls') => {
    try {
      await downloadFromAdminApi(
        `/api/admin/reports/export?reportType=${reportType}&format=${format}&${queryParams}`,
        `fyoora-${reportType}-${dateState.preset}-${new Date().toISOString().slice(0, 10)}.${format}`
      );
      notify(`Exported ${reportType.toUpperCase()} (${format.toUpperCase()})`, 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Unable to export report', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
            Enterprise Reporting &amp; Export Centre
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Active Date Window: <strong>{data.executive.window.label}</strong> · Download structured CSV, Excel (.xls), or print formatted PDF summaries.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#252525] dark:bg-white text-white dark:text-[#252525] text-xs font-semibold print:hidden"
        >
          <Printer className="w-3.5 h-3.5" /> Print / Save Executive PDF
        </button>
      </div>

      {/* 9 Exportable Report Modules */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 print:hidden">
        {REPORT_CARDS.map((rep) => (
          <div
            key={rep.id}
            className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 flex flex-col justify-between gap-4"
          >
            <div>
              <h3 className="font-display font-bold text-sm text-[#252525] dark:text-neutral-100">{rep.title}</h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{rep.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleDownload(rep.id, 'csv')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold hover:border-[#E60023]"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                type="button"
                onClick={() => void handleDownload(rep.id, 'xls')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#252525] dark:bg-neutral-800 text-white text-xs font-semibold hover:bg-[#E60023]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Excel (.xls)
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Printable Executive Financial & Operations Sheet */}
      <div className="bg-white dark:bg-[#171717] rounded-2xl border border-neutral-200 dark:border-neutral-800 p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div>
            <h3 className="font-display font-bold text-base text-[#252525] dark:text-neutral-100">
              FYOORA Vadakara — Printable Executive Financial Summary
            </h3>
            <p className="text-xs text-neutral-500">
              Period: {data.executive.window.label} · Generated {new Date().toLocaleString('en-IN')}
            </p>
          </div>
          <span className="font-mono font-bold text-sm text-[#E60023]">INR (₹)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          {[
            { label: 'Gross Marketplace Sales', value: formatInr(data.executive.summary.gmv) },
            { label: 'Net Platform Revenue', value: formatInr(data.executive.summary.netPlatformRevenue) },
            { label: 'Vendor Commissions', value: formatInr(data.executive.summary.vendorCommissions) },
            { label: 'Delivery Revenue', value: formatInr(data.executive.summary.deliveryRevenue) },
            { label: 'Operating Expenses', value: formatInr(data.executive.summary.totalOperatingExpenses) },
            { label: 'Estimated Net Profit', value: formatInr(data.executive.summary.estimatedNetProfit) },
            { label: 'Total Orders', value: data.executive.counts.totalOrders.toLocaleString('en-IN') },
            { label: 'Completed / Cancelled', value: `${data.executive.counts.completedOrders} / ${data.executive.counts.cancelledOrders}` },
          ].map((row) => (
            <div key={row.label} className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200/70 dark:border-neutral-800">
              <div className="text-neutral-500 text-[11px]">{row.label}</div>
              <div className="font-mono font-bold text-base text-[#252525] dark:text-neutral-100 tabular-nums mt-0.5">
                {row.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
