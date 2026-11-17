import { useId, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { formatInr } from './adminTypes.ts';

interface SparklineChartProps {
  values: number[];
  positive?: boolean;
  height?: number;
}

export function SparklineChart({ values, positive = true, height = 28 }: SparklineChartProps) {
  if (!values || values.length < 2) {
    return (
      <div className="h-7 flex items-center text-[10px] text-neutral-400 dark:text-neutral-500">
        No 7d series
      </div>
    );
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const width = 96;
  const pad = 3;

  const points = values.map((v, idx) => {
    const x = pad + (idx / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    return { x, y };
  });
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const stroke = positive ? '#E60023' : '#DC2626';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0" aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.2" fill={stroke} />
    </svg>
  );
}

export interface ChartSeriesDef {
  key: string;
  label: string;
  color: string;
}

interface MultiSeriesChartProps {
  data: Array<Record<string, string | number>>;
  labelKey: string;
  series: ChartSeriesDef[];
  mode: 'line' | 'bar' | 'area';
  valueFormat?: 'currency' | 'integer';
  height?: number;
  emptyTitle?: string;
  emptySubtitle?: string;
}

export function MultiSeriesChart({
  data,
  labelKey,
  series,
  mode,
  valueFormat = 'currency',
  height = 240,
  emptyTitle = 'Not enough data yet',
  emptySubtitle = 'Real marketplace transactions inside this date window will populate this chart automatically.',
}: MultiSeriesChartProps) {
  const uid = useId().replace(/:/g, '');
  const [hiddenKeys, setHiddenKeys] = useState<Record<string, boolean>>({});
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visibleSeries = series.filter((s) => !hiddenKeys[s.key]);
  const hasAnyValues =
    data.length > 0 &&
    visibleSeries.some((s) => data.some((row) => Math.abs(Number(row[s.key] || 0)) > 0));

  if (data.length === 0 || !hasAnyValues) {
    return (
      <div
        className="w-full flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40 px-4 text-center"
        style={{ height }}
      >
        <BarChart3 className="w-6 h-6 text-neutral-400 dark:text-neutral-500 mb-2" />
        <div className="text-xs font-semibold text-[#252525] dark:text-neutral-200">{emptyTitle}</div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-sm mt-1">{emptySubtitle}</p>
      </div>
    );
  }

  const width = 760;
  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const allVals = visibleSeries.flatMap((s) => data.map((d) => Number(d[s.key] || 0)));
  const maxVal = Math.max(...allVals, 1);
  const minVal = Math.min(0, ...allVals);
  const range = Math.max(1, maxVal - minVal);

  const yFor = (v: number) => padT + ((maxVal - v) / range) * plotH;
  const xFor = (idx: number) =>
    data.length === 1
      ? padL + plotW / 2
      : padL + (idx / (data.length - 1)) * plotW;

  const formatTick = (v: number) => {
    if (valueFormat === 'integer') return Math.round(v).toLocaleString('en-IN');
    if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
    return `₹${Math.round(v)}`;
  };

  const gridTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => minVal + range * t);
  const activeRow = hoverIdx !== null && data[hoverIdx] ? data[hoverIdx] : null;

  return (
    <div className="space-y-3">
      {/* Interactive Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {series.map((s) => {
            const disabled = Boolean(hiddenKeys[s.key]);
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setHiddenKeys((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
                  disabled
                    ? 'border-neutral-200 dark:border-neutral-800 text-neutral-400 opacity-60'
                    : 'border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/70 text-[#252525] dark:text-neutral-200'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {activeRow && (
          <div className="flex flex-wrap items-center gap-3 text-[11px] bg-neutral-900 dark:bg-neutral-800 text-white px-3 py-1 rounded-lg font-mono tabular-nums">
            <span className="font-semibold text-neutral-300">{String(activeRow[labelKey])}</span>
            {visibleSeries.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}:{' '}
                <strong>
                  {valueFormat === 'currency'
                    ? formatInr(Number(activeRow[s.key] || 0))
                    : Number(activeRow[s.key] || 0).toLocaleString('en-IN')}
                </strong>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SVG Canvas */}
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[420px] h-auto select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            {visibleSeries.map((s) => (
              <linearGradient key={s.key} id={`grad-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
                <stop offset="100%" stopColor={s.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
          </defs>

          {/* Horizontal gridlines */}
          {gridTicks.map((tick, idx) => {
            const y = yFor(tick);
            return (
              <g key={idx}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="currentColor"
                  className="text-neutral-200 dark:text-neutral-800"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-neutral-500 dark:fill-neutral-400 text-[10px] font-mono"
                >
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}

          {/* Bar Mode */}
          {mode === 'bar' &&
            data.map((row, idx) => {
              const slotW = plotW / Math.max(1, data.length);
              const groupW = Math.min(44, slotW * 0.72);
              const barW = Math.max(4, groupW / Math.max(1, visibleSeries.length) - 2);
              const cx = data.length === 1 ? padL + plotW / 2 : padL + slotW * idx + slotW / 2;
              const startX = cx - groupW / 2;
              const zeroY = yFor(0);

              return (
                <g key={idx}>
                  {visibleSeries.map((s, sIdx) => {
                    const val = Number(row[s.key] || 0);
                    const yVal = yFor(val);
                    const topY = Math.min(zeroY, yVal);
                    const barH = Math.max(2, Math.abs(zeroY - yVal));
                    return (
                      <rect
                        key={s.key}
                        x={startX + sIdx * (barW + 2)}
                        y={topY}
                        width={barW}
                        height={barH}
                        rx={3}
                        fill={s.color}
                        opacity={hoverIdx === null || hoverIdx === idx ? 0.92 : 0.45}
                      />
                    );
                  })}
                </g>
              );
            })}

          {/* Line / Area Mode */}
          {(mode === 'line' || mode === 'area') &&
            visibleSeries.map((s) => {
              const coords = data.map((row, idx) => ({
                x: xFor(idx),
                y: yFor(Number(row[s.key] || 0)),
              }));
              const linePath = coords.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
              const zeroY = yFor(0);
              const areaPath =
                coords.length > 0
                  ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${zeroY.toFixed(1)} L ${coords[0].x.toFixed(1)} ${zeroY.toFixed(1)} Z`
                  : '';

              return (
                <g key={s.key}>
                  {mode === 'area' && coords.length > 1 && (
                    <path d={areaPath} fill={`url(#grad-${uid}-${s.key})`} />
                  )}
                  <path
                    d={linePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {coords.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={hoverIdx === idx ? 4.5 : data.length <= 12 ? 3 : 1.5}
                      fill={s.color}
                      stroke="#ffffff"
                      strokeWidth="1.2"
                    />
                  ))}
                </g>
              );
            })}

          {/* X-axis Labels */}
          {data.map((row, idx) => {
            const step = data.length > 14 ? Math.ceil(data.length / 8) : data.length > 8 ? 2 : 1;
            if (idx % step !== 0 && idx !== data.length - 1) return null;
            const slotW = plotW / Math.max(1, data.length);
            const x =
              mode === 'bar'
                ? data.length === 1
                  ? padL + plotW / 2
                  : padL + slotW * idx + slotW / 2
                : xFor(idx);
            return (
              <text
                key={idx}
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="fill-neutral-500 dark:fill-neutral-400 text-[10px] font-mono"
              >
                {String(row[labelKey]).slice(0, 12)}
              </text>
            );
          })}

          {/* Hover hit zones */}
          {data.map((_row, idx) => {
            const slotW = plotW / Math.max(1, data.length);
            const hitX = mode === 'bar' ? padL + slotW * idx : xFor(idx) - slotW / 2;
            return (
              <rect
                key={`hit-${idx}`}
                x={Math.max(padL, hitX)}
                y={padT}
                width={Math.max(12, slotW)}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}

          {hoverIdx !== null && (
            <line
              x1={
                mode === 'bar'
                  ? padL + (plotW / Math.max(1, data.length)) * hoverIdx + plotW / Math.max(1, data.length) / 2
                  : xFor(hoverIdx)
              }
              y1={padT}
              x2={
                mode === 'bar'
                  ? padL + (plotW / Math.max(1, data.length)) * hoverIdx + plotW / Math.max(1, data.length) / 2
                  : xFor(hoverIdx)
              }
              y2={padT + plotH}
              stroke="#E60023"
              strokeOpacity="0.35"
              strokeDasharray="3 3"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

const SLICE_PALETTE = [
  '#E60023',
  '#252525',
  '#059669',
  '#D97706',
  '#4F46E5',
  '#0891B2',
  '#BE185D',
  '#65A30D',
];

export interface DistributionSlice {
  label: string;
  value: number;
  secondary?: string;
}

interface CategoryDistributionChartProps {
  items: DistributionSlice[];
  mode: 'pie' | 'donut' | 'bar';
  valueFormat?: 'currency' | 'integer';
  emptyMessage?: string;
}

export function CategoryDistributionChart({
  items,
  mode,
  valueFormat = 'currency',
  emptyMessage = 'Not enough data yet for this breakdown.',
}: CategoryDistributionChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const nonZero = items.filter((i) => i.value > 0);
  const total = nonZero.reduce((s, i) => s + i.value, 0);

  if (nonZero.length === 0 || total <= 0) {
    return (
      <div className="h-52 flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-900/40 px-4 text-center">
        <div className="text-xs font-semibold text-[#252525] dark:text-neutral-200">Not enough data yet</div>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">{emptyMessage}</p>
      </div>
    );
  }

  if (mode === 'bar') {
    const maxV = Math.max(...nonZero.map((i) => i.value), 1);
    return (
      <div className="space-y-2.5">
        {nonZero.map((item, idx) => {
          const pct = Math.round((item.value / total) * 1000) / 10;
          const color = SLICE_PALETTE[idx % SLICE_PALETTE.length];
          return (
            <div key={item.label} className="space-y-1">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-medium text-[#252525] dark:text-neutral-200 truncate">{item.label}</span>
                <span className="font-mono tabular-nums text-neutral-700 dark:text-neutral-300 shrink-0">
                  {valueFormat === 'currency' ? formatInr(item.value) : item.value.toLocaleString('en-IN')} · {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(3, (item.value / maxV) * 100)}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Pie / Donut SVG
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 84;
  const innerR = mode === 'donut' ? 50 : 0;

  let cumulative = -Math.PI / 2;
  const slices = nonZero.map((item, idx) => {
    const angle = (item.value / total) * Math.PI * 2;
    const startAngle = cumulative;
    const endAngle = cumulative + angle;
    cumulative = endAngle;
    const largeArc = angle > Math.PI ? 1 : 0;
    const x1 = cx + outerR * Math.cos(startAngle);
    const y1 = cy + outerR * Math.sin(startAngle);
    const x2 = cx + outerR * Math.cos(endAngle);
    const y2 = cy + outerR * Math.sin(endAngle);

    let d = '';
    if (nonZero.length === 1) {
      d = `M ${cx} ${cy - outerR} A ${outerR} ${outerR} 0 1 1 ${cx - 0.01} ${cy - outerR} Z`;
    } else if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(endAngle);
      const iy1 = cy + innerR * Math.sin(endAngle);
      const ix2 = cx + innerR * Math.cos(startAngle);
      const iy2 = cy + innerR * Math.sin(startAngle);
      d = `M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
    } else {
      d = `M ${cx} ${cy} L ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    }

    return {
      ...item,
      idx,
      color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
      pct: Math.round((item.value / total) * 1000) / 10,
      d,
    };
  });

  const hovered = hoverIdx !== null ? slices[hoverIdx] : null;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((sl) => (
            <path
              key={sl.label}
              d={sl.d}
              fill={sl.color}
              stroke="#ffffff"
              strokeWidth="1.5"
              opacity={hoverIdx === null || hoverIdx === sl.idx ? 1 : 0.45}
              onMouseEnter={() => setHoverIdx(sl.idx)}
              onMouseLeave={() => setHoverIdx(null)}
              className="transition-opacity cursor-pointer"
            />
          ))}
        </svg>
        {mode === 'donut' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-6">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 font-semibold truncate max-w-[90px]">
              {hovered ? hovered.label : 'Total'}
            </div>
            <div className="font-mono font-bold text-sm text-[#252525] dark:text-white tabular-nums mt-0.5">
              {valueFormat === 'currency'
                ? formatInr(hovered ? hovered.value : total)
                : (hovered ? hovered.value : total).toLocaleString('en-IN')}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 w-full space-y-2">
        {slices.map((sl) => (
          <div
            key={sl.label}
            onMouseEnter={() => setHoverIdx(sl.idx)}
            onMouseLeave={() => setHoverIdx(null)}
            className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs transition ${
              hoverIdx === sl.idx ? 'bg-neutral-100 dark:bg-neutral-800' : ''
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sl.color }} />
              <span className="font-medium text-[#252525] dark:text-neutral-200 truncate">{sl.label}</span>
            </div>
            <div className="font-mono tabular-nums text-neutral-700 dark:text-neutral-300 shrink-0">
              {valueFormat === 'currency' ? formatInr(sl.value) : sl.value.toLocaleString('en-IN')} ({sl.pct}%)
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
