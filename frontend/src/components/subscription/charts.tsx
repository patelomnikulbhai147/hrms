// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIPTION MANAGEMENT — charts.
//
// Dependency-free SVG (no chart library is installed and none is being added).
// Two forms only, chosen by the job the data does:
//   • BarChart — revenue over time (magnitude across ordered buckets)
//   • Donut    — plan mix (part-to-whole across ≤ 6 named categories)
//
// COLOUR: the categorical slots below are a validated set, not a taste call.
// The plan-master colours (#64748b/#3b82f6/#8b5cf6/#4f46e5/#d97706) were measured
// and FAIL as a chart palette — #8b5cf6↔#3b82f6 collapse to ΔE 1.3 for deuteranopes
// and #4f46e5↔#8b5cf6 sit at ΔE 11.4 even in full colour vision. They stay as the
// plan's identity colour in the Plans tab; charts use the slots here, which pass
// every gate on both the light (#FFFFFF) and dark (#1D2230) surfaces. Three light
// slots sit under 3:1 contrast, so every segment is DIRECTLY LABELLED in the
// legend — identity is never carried by colour alone.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useRef, useState } from 'react';

// ── Theme-aware chart tokens ─────────────────────────────────────────────────
// Mirrors the app's own dark-mode mechanism (`:root:not([data-theme="light"])`),
// so charts flip with the rest of the UI rather than needing their own toggle.
const VIZ_CSS = `
.zh-viz {
  --viz-grid: #E2E8F0;
  --viz-axis: #94A3B8;
  --viz-ink: #0F172A;
  --viz-ink-muted: #64748B;
  --viz-surface: #FFFFFF;
  --viz-bar: #B5673A;
  --viz-bar-hover: #99552F;
  --viz-s1: #2a78d6;
  --viz-s2: #eb6834;
  --viz-s3: #1baf7a;
  --viz-s4: #eda100;
  --viz-s5: #e87ba4;
  --viz-s6: #4a3aa7;
}
:root:not([data-theme="light"]) .zh-viz {
  --viz-grid: #2B3245;
  --viz-axis: #64748B;
  --viz-ink: #F8FAFC;
  --viz-ink-muted: #94A3B8;
  --viz-surface: #1D2230;
  --viz-bar: #E0996A;
  --viz-bar-hover: #F0CBAE;
  --viz-s1: #3987e5;
  --viz-s2: #d95926;
  --viz-s3: #199e70;
  --viz-s4: #c98500;
  --viz-s5: #d55181;
  --viz-s6: #9085e9;
}
`;

/** The categorical slot order. Assign in FIXED order — never cycled, never by rank. */
export const SERIES_VARS = ['var(--viz-s1)', 'var(--viz-s2)', 'var(--viz-s3)', 'var(--viz-s4)', 'var(--viz-s5)', 'var(--viz-s6)'];

/** Injects the token block once per document. */
const VizStyles: React.FC = () => {
  useEffect(() => {
    const ID = 'zh-viz-tokens';
    if (document.getElementById(ID)) return;
    const el = document.createElement('style');
    el.id = ID;
    el.textContent = VIZ_CSS;
    document.head.appendChild(el);
  }, []);
  return null;
};

/** Container width, so the SVG is responsive without distorting its text. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
const Tip: React.FC<{ x: number; y: number; title: string; value: string; sub?: string; w: number }> = ({ x, y, title, value, sub, w }) => {
  const left = Math.max(4, Math.min(x, w - 150));
  return (
    <div
      className="pointer-events-none absolute z-20 rounded-xl border border-hairline bg-surface shadow-card px-3 py-2 min-w-[120px]"
      style={{ left, top: Math.max(0, y - 8), transform: 'translate(-50%, -100%)' }}
    >
      <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">{title}</div>
      <div className="text-[14px] font-bold text-ink tabular-nums mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-ink-muted mt-0.5">{sub}</div>}
    </div>
  );
};

// ── Bar chart ────────────────────────────────────────────────────────────────
export interface BarDatum { key: string; label: string; value: number; sub?: string }

/** Rounded-top bar anchored to the baseline (4px data-end radius). */
function barPath(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  if (h <= 0) return '';
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

export const BarChart: React.FC<{
  data: BarDatum[];
  height?: number;
  format: (n: number) => string;
  /** Compact form for the y-axis ticks. */
  tickFormat?: (n: number) => string;
  emptyLabel?: string;
}> = ({ data, height = 240, format, tickFormat, emptyLabel = 'No data for this period yet.' }) => {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const fmtTick = tickFormat || format;

  if (!data.length) {
    return <div className="py-14 text-center text-[13px] text-ink-muted font-medium">{emptyLabel}</div>;
  }

  const PAD_L = 52, PAD_R = 8, PAD_T = 12, PAD_B = 26;
  const width = Math.max(w, 280);
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const plotH = Math.max(10, height - PAD_T - PAD_B);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const slot = plotW / data.length;
  // Thin marks: cap the bar at 44px however wide the container gets.
  const barW = Math.max(6, Math.min(44, slot - 12));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  // Selective direct label: only the tallest bar carries its number.
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <div className="zh-viz relative" ref={ref}>
      <VizStyles />
      <svg width={width} height={height} role="img" aria-label="Bar chart" style={{ display: 'block' }}>
        {/* Recessive gridlines + y ticks */}
        {ticks.map((t, i) => {
          const y = PAD_T + plotH - (t / max) * plotH;
          return (
            <g key={i}>
              <line x1={PAD_L} x2={width - PAD_R} y1={y} y2={y} stroke="var(--viz-grid)" strokeWidth={1} />
              <text x={PAD_L - 8} y={y + 3.5} textAnchor="end" fontSize={10.5} fill="var(--viz-ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmtTick(t)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const h = max > 0 ? (d.value / max) * plotH : 0;
          const x = PAD_L + i * slot + (slot - barW) / 2;
          const y = PAD_T + plotH - h;
          const on = hover === i;
          return (
            <g key={d.key}>
              {/* Hit target is the whole column, not just the bar. */}
              <rect
                x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              />
              <path d={barPath(x, y, barW, h)} fill={on ? 'var(--viz-bar-hover)' : 'var(--viz-bar)'} style={{ transition: 'fill .15s' }} pointerEvents="none" />
              {i === peak && h > 14 && (
                <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="var(--viz-ink)" pointerEvents="none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {fmtTick(d.value)}
                </text>
              )}
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={10.5} fill="var(--viz-ink-muted)" pointerEvents="none">
                {d.label}
              </text>
            </g>
          );
        })}
        <line x1={PAD_L} x2={width - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH} stroke="var(--viz-axis)" strokeWidth={1} />
      </svg>

      {hover !== null && (
        <Tip
          w={width}
          x={PAD_L + hover * slot + slot / 2}
          y={PAD_T + plotH - (max > 0 ? (data[hover].value / max) * plotH : 0)}
          title={data[hover].label}
          value={format(data[hover].value)}
          sub={data[hover].sub}
        />
      )}
    </div>
  );
};

// ── Donut ────────────────────────────────────────────────────────────────────
export interface Slice { key: string; label: string; value: number }

function arcPath(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number) {
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(rO, a0), [x1, y1] = p(rO, a1);
  const [x2, y2] = p(rI, a1), [x3, y3] = p(rI, a0);
  return `M${x0},${y0} A${rO},${rO} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${rI},${rI} 0 ${large} 0 ${x3},${y3} Z`;
}

export const Donut: React.FC<{
  data: Slice[];
  size?: number;
  centerLabel: string;
  centerValue: React.ReactNode;
  emptyLabel?: string;
}> = ({ data, size = 190, centerLabel, centerValue, emptyLabel = 'Nothing to show yet.' }) => {
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0);
  const colorOf = useCallback((i: number) => SERIES_VARS[i % SERIES_VARS.length], []);

  if (!total) return <div className="py-14 text-center text-[13px] text-ink-muted font-medium">{emptyLabel}</div>;

  const cx = size / 2, cy = size / 2, rO = size / 2 - 2, rI = rO - 26;
  // A 2px surface gap between segments — expressed as an angle at the mid radius.
  const gap = 2 / ((rO + rI) / 2);
  let a = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const sweep = ((Number(d.value) || 0) / total) * Math.PI * 2;
    const a0 = a + gap / 2;
    const a1 = a + sweep - gap / 2;
    a += sweep;
    return { d, i, path: a1 > a0 ? arcPath(cx, cy, rO, rI, a0, a1) : '' };
  });

  return (
    <div className="zh-viz flex flex-col sm:flex-row items-center gap-6">
      <VizStyles />
      <div className="relative flex-shrink-0">
        <svg width={size} height={size} role="img" aria-label="Distribution donut chart">
          {arcs.map(({ d, i, path }) => path && (
            <path
              key={d.key}
              d={path}
              fill={colorOf(i)}
              opacity={hover === null || hover === i ? 1 : 0.45}
              style={{ transition: 'opacity .15s' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={22} fontWeight={700} fill="var(--viz-ink)">
            {hover === null ? String(centerValue) : String(data[hover].value)}
          </text>
          <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10} fill="var(--viz-ink-muted)" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {hover === null ? centerLabel : data[hover].label}
          </text>
        </svg>
      </div>

      {/* Legend — every slice is directly labelled with its count and share, so
          identity never depends on colour (three light slots are sub-3:1). */}
      <ul className="flex-1 w-full space-y-1.5 min-w-0">
        {data.map((d, i) => (
          <li
            key={d.key}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-muted transition-colors"
          >
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: colorOf(i) }} />
            <span className="text-[13px] text-ink-secondary font-medium truncate flex-1">{d.label}</span>
            <span className="text-[13px] font-bold text-ink tabular-nums">{d.value}</span>
            <span className="text-[11.5px] text-ink-muted tabular-nums w-10 text-right">
              {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
