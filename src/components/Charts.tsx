import { useMemo, useState } from 'react';
import type { OhlcPoint, SectorRotationItem } from '../types/market';
import { formatINR, formatSignedPct, formatVolume } from '../utils/format';

/* 1. CoinGecko-style Sparkline SVG */
export function Sparkline({
  data,
  positive,
  width = 92,
  height = 28,
}: {
  data: number[];
  positive: boolean;
  width?: number;
  height?: number;
}) {
  const path = useMemo(() => {
    const pts = data.filter((v) => Number.isFinite(v) && v > 0);
    if (pts.length < 2) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const pad = 2;
    const coords = pts.map((v, i) => {
      const x = (i / (pts.length - 1)) * width;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return [x, y] as const;
    });
    const lineD = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const areaD = `${lineD} L${width},${height} L0,${height} Z`;
    return { lineD, areaD };
  }, [data, width, height]);

  if (!path) {
    return <div style={{ width, height }} className="bg-slate-200/40 dark:bg-slate-800/40 rounded-xs" />;
  }

  const stroke = positive ? '#10B981' : '#F43F5E';
  const fill = positive ? 'rgba(16, 185, 129, 0.14)' : 'rgba(244, 63, 94, 0.14)';

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible shrink-0">
      <path d={path.areaD} fill={fill} />
      <path d={path.lineD} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* 2. Weighted Strength Radial Gauge */
export function StrengthGauge({
  score,
  rating,
}: {
  score: number;
  rating: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 56;
  const cx = 72;
  const cy = 72;
  const circumference = Math.PI * r; // Semi-circle arc
  const offset = circumference * (1 - clamped / 100);

  const color =
    clamped >= 70
      ? '#10B981'
      : clamped >= 56
        ? '#14B8A6'
        : clamped >= 45
          ? '#F59E0B'
          : clamped >= 32
            ? '#F97316'
            : '#F43F5E';

  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="144" height="88" viewBox="0 0 144 88" className="overflow-visible">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-800"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
        <text
          x={cx}
          y={cy - 14}
          textAnchor="middle"
          className="fill-slate-900 dark:fill-slate-100 font-mono font-bold tabular-nums"
          fontSize="28"
        >
          {clamped}
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          className="fill-slate-500 dark:fill-slate-400 font-sans"
          fontSize="11"
        >
          of 100
        </text>
      </svg>
      <div className="text-xs font-semibold tracking-tight -mt-1" style={{ color }}>
        {rating}
      </div>
    </div>
  );
}

/* 3. Interactive TradingView-style Price + SMA50 + SMA200 + Bollinger Chart */
export function PriceTechnicalChart({
  history,
  sma50,
  sma200,
  bbUpper,
  bbLower,
  ltp,
}: {
  history: OhlcPoint[];
  sma50: number;
  sma200: number;
  bbUpper: number;
  bbLower: number;
  ltp: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chart = useMemo(() => {
    const pts = history.length >= 5 ? history : [];
    if (!pts.length) return null;

    const w = 640;
    const h = 210;
    const padL = 8;
    const padR = 58;
    const padT = 14;
    const padB = 22;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;

    const highs = pts.map((p) => p.high || p.close);
    const lows = pts.map((p) => p.low || p.close);
    const refVals = [...highs, ...lows, sma50, sma200, bbUpper, bbLower].filter(
      (v) => Number.isFinite(v) && v > 0
    );
    const minVal = Math.min(...refVals) * 0.992;
    const maxVal = Math.max(...refVals) * 1.008;
    const span = maxVal - minVal || 1;

    const xAt = (i: number) => padL + (i / Math.max(1, pts.length - 1)) * innerW;
    const yAt = (v: number) => padT + innerH - ((v - minVal) / span) * innerH;

    // Rolling 20-day Bollinger bands & 20-day SMA
    const closes = pts.map((p) => p.close);
    const bbUpperPts: string[] = [];
    const bbLowerPts: string[] = [];
    const sma20Pts: string[] = [];

    for (let i = 0; i < pts.length; i++) {
      const start = Math.max(0, i - 19);
      const slice = closes.slice(start, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
      const std = Math.sqrt(variance);
      const x = xAt(i).toFixed(1);
      bbUpperPts.push(`${x},${yAt(mean + 2 * std).toFixed(1)}`);
      bbLowerPts.push(`${x},${yAt(mean - 2 * std).toFixed(1)}`);
      sma20Pts.push(`${i === 0 ? 'M' : 'L'}${x},${yAt(mean).toFixed(1)}`);
    }

    const bbPolygon = [...bbUpperPts, ...bbLowerPts.reverse()].join(' ');
    const closeLine = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p.close).toFixed(1)}`)
      .join(' ');
    const closeArea = `${closeLine} L${xAt(pts.length - 1).toFixed(1)},${padT + innerH} L${padL},${padT + innerH} Z`;

    const isPositive = pts[pts.length - 1].close >= pts[0].close;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      val: maxVal - t * span,
      y: padT + t * innerH,
    }));

    return {
      w,
      h,
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH,
      pts,
      xAt,
      yAt,
      bbPolygon,
      sma20Line: sma20Pts.join(' '),
      closeLine,
      closeArea,
      isPositive,
      yTicks,
    };
  }, [history, sma50, sma200, bbUpper, bbLower]);

  if (!chart) {
    return (
      <div className="h-[210px] flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-md">
        Loading 3-month NSE Bhavcopy OHLCV history...
      </div>
    );
  }

  const activePoint = hoverIdx !== null ? chart.pts[hoverIdx] : chart.pts[chart.pts.length - 1];
  const strokeColor = chart.isPositive ? '#10B981' : '#F43F5E';
  const fillColor = chart.isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs font-mono tabular-nums">
        <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-300">
          <span className="text-slate-500 dark:text-slate-400">{activePoint.date}</span>
          <span>O {formatINR(activePoint.open, 1)}</span>
          <span>H {formatINR(activePoint.high, 1)}</span>
          <span>L {formatINR(activePoint.low, 1)}</span>
          <span className="font-semibold text-slate-900 dark:text-white">
            C {formatINR(activePoint.close, 1)}
          </span>
          <span className="text-slate-500 dark:text-slate-400">Vol {formatVolume(activePoint.volume)}</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-sans">
          <span className="inline-flex items-center gap-1 text-amber-500">
            <span className="w-2.5 h-0.5 bg-amber-500 inline-block" /> 50-DMA
          </span>
          <span className="inline-flex items-center gap-1 text-sky-500">
            <span className="w-2.5 h-0.5 bg-sky-500 inline-block" /> 200-DMA
          </span>
          <span className="inline-flex items-center gap-1 text-violet-400">
            <span className="w-2.5 h-2 bg-violet-500/20 border border-violet-400/50 inline-block" /> BB(20,2)
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${chart.w} ${chart.h}`}
        className="w-full h-[210px] select-none"
        onMouseLeave={() => setHoverIdx(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / rect.width) * chart.w;
          const idx = Math.round(((relX - chart.padL) / chart.innerW) * (chart.pts.length - 1));
          setHoverIdx(Math.max(0, Math.min(chart.pts.length - 1, idx)));
        }}
      >
        {/* Horizontal grid lines */}
        {chart.yTicks.map((tk, i) => (
          <g key={i}>
            <line
              x1={chart.padL}
              x2={chart.w - chart.padR}
              y1={tk.y}
              y2={tk.y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800/80"
              strokeWidth="1"
            />
            <text
              x={chart.w - chart.padR + 6}
              y={tk.y + 3}
              fontSize="10"
              className="fill-slate-500 dark:fill-slate-400 font-mono tabular-nums"
            >
              {tk.val.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Bollinger Band shaded envelope */}
        <polygon points={chart.bbPolygon} fill="rgba(139, 92, 246, 0.09)" />

        {/* SMA 200 reference line */}
        {sma200 > 0 && (
          <line
            x1={chart.padL}
            x2={chart.w - chart.padR}
            y1={chart.yAt(sma200)}
            y2={chart.yAt(sma200)}
            stroke="#0EA5E9"
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
        )}

        {/* SMA 50 reference line */}
        {sma50 > 0 && (
          <line
            x1={chart.padL}
            x2={chart.w - chart.padR}
            y1={chart.yAt(sma50)}
            y2={chart.yAt(sma50)}
            stroke="#F59E0B"
            strokeWidth="1.2"
            strokeDasharray="3 2"
          />
        )}

        {/* SMA 20 curve */}
        <path d={chart.sma20Line} fill="none" stroke="rgba(139, 92, 246, 0.55)" strokeWidth="1" />

        {/* Price Area & Close Line */}
        <path d={chart.closeArea} fill={fillColor} />
        <path d={chart.closeLine} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />

        {/* Hover Crosshair */}
        {hoverIdx !== null && (
          <g>
            <line
              x1={chart.xAt(hoverIdx)}
              x2={chart.xAt(hoverIdx)}
              y1={chart.padT}
              y2={chart.padT + chart.innerH}
              stroke="currentColor"
              className="text-slate-400 dark:text-slate-500"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={chart.xAt(hoverIdx)}
              cy={chart.yAt(chart.pts[hoverIdx].close)}
              r="4"
              fill={strokeColor}
              stroke="#0B111B"
              strokeWidth="1.5"
            />
          </g>
        )}

        {/* Live LTP tag on right axis */}
        {ltp > 0 && (
          <g transform={`translate(${chart.w - chart.padR + 2}, ${chart.yAt(ltp) - 8})`}>
            <rect width="54" height="16" rx="2" fill={strokeColor} />
            <text
              x="27"
              y="11"
              textAnchor="middle"
              fontSize="9.5"
              className="fill-white font-mono font-semibold tabular-nums"
            >
              {ltp.toFixed(1)}
            </text>
          </g>
        )}

        {/* Start / Mid / End dates */}
        <text x={chart.padL} y={chart.h - 4} fontSize="10" className="fill-slate-500 dark:fill-slate-400 font-mono">
          {chart.pts[0]?.date}
        </text>
        <text
          x={chart.padL + chart.innerW / 2}
          y={chart.h - 4}
          textAnchor="middle"
          fontSize="10"
          className="fill-slate-500 dark:fill-slate-400 font-mono"
        >
          {chart.pts[Math.floor(chart.pts.length / 2)]?.date}
        </text>
        <text
          x={chart.w - chart.padR}
          y={chart.h - 4}
          textAnchor="end"
          fontSize="10"
          className="fill-slate-500 dark:fill-slate-400 font-mono"
        >
          {chart.pts[chart.pts.length - 1]?.date}
        </text>
      </svg>
    </div>
  );
}

/* 4. Sector Rotation Quadrant Scatter Chart */
export function SectorRotationChart({
  sectors,
  selectedSector,
  onSelectSector,
}: {
  sectors: SectorRotationItem[];
  selectedSector: string;
  onSelectSector: (sector: string) => void;
}) {
  const w = 560;
  const h = 300;
  const pad = 42;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const maxAbsX = Math.max(6, ...sectors.map((s) => Math.abs(s.relativeStrengthVsNifty))) * 1.15;
  const maxAbsY = Math.max(3, ...sectors.map((s) => Math.abs(s.return1W))) * 1.15;

  const xAt = (v: number) => pad + ((v + maxAbsX) / (2 * maxAbsX)) * innerW;
  const yAt = (v: number) => pad + innerH - ((v + maxAbsY) / (2 * maxAbsY)) * innerH;
  const cx0 = xAt(0);
  const cy0 = yAt(0);

  const quadrantColor = (q: SectorRotationItem['quadrant']) => {
    if (q === 'Leading') return '#10B981';
    if (q === 'Improving') return '#0EA5E9';
    if (q === 'Weakening') return '#F59E0B';
    return '#F43F5E';
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[300px] select-none">
      {/* Quadrant backgrounds */}
      <rect x={cx0} y={pad} width={w - pad - cx0} height={cy0 - pad} fill="rgba(16, 185, 129, 0.05)" />
      <rect x={pad} y={pad} width={cx0 - pad} height={cy0 - pad} fill="rgba(14, 165, 233, 0.05)" />
      <rect x={cx0} y={cy0} width={w - pad - cx0} height={h - pad - cy0} fill="rgba(245, 158, 11, 0.05)" />
      <rect x={pad} y={cy0} width={cx0 - pad} height={h - pad - cy0} fill="rgba(244, 63, 94, 0.05)" />

      {/* Axes */}
      <line x1={pad} x2={w - pad} y1={cy0} y2={cy0} stroke="currentColor" className="text-slate-300 dark:text-slate-700" strokeWidth="1" strokeDasharray="3 3" />
      <line x1={cx0} x2={cx0} y1={pad} y2={h - pad} stroke="currentColor" className="text-slate-300 dark:text-slate-700" strokeWidth="1" strokeDasharray="3 3" />
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />

      {/* Quadrant labels */}
      <text x={w - pad - 8} y={pad + 15} textAnchor="end" fontSize="10" className="fill-emerald-500 font-semibold">
        Leading
      </text>
      <text x={pad + 8} y={pad + 15} textAnchor="start" fontSize="10" className="fill-sky-500 font-semibold">
        Improving
      </text>
      <text x={w - pad - 8} y={h - pad - 8} textAnchor="end" fontSize="10" className="fill-amber-500 font-semibold">
        Weakening
      </text>
      <text x={pad + 8} y={h - pad - 8} textAnchor="start" fontSize="10" className="fill-rose-500 font-semibold">
        Lagging
      </text>

      {/* Axis titles */}
      <text x={w / 2} y={h - 10} textAnchor="middle" fontSize="10.5" className="fill-slate-500 dark:fill-slate-400">
        1-Month Relative Strength vs Nifty 50 (%)
      </text>
      <text
        x={14}
        y={h / 2}
        textAnchor="middle"
        fontSize="10.5"
        transform={`rotate(-90 14 ${h / 2})`}
        className="fill-slate-500 dark:fill-slate-400"
      >
        1-Week Momentum (%)
      </text>

      {/* Sector nodes */}
      {sectors.map((sec) => {
        const x = xAt(sec.relativeStrengthVsNifty);
        const y = yAt(sec.return1W);
        const active = sec.sector === selectedSector;
        const col = quadrantColor(sec.quadrant);
        const shortName = sec.sector.split(' ')[0];
        return (
          <g
            key={sec.sector}
            className="cursor-pointer"
            onClick={() => onSelectSector(sec.sector)}
          >
            {active && (
              <circle cx={x} cy={y} r="12" fill={col} fillOpacity="0.18" />
            )}
            <circle
              cx={x}
              cy={y}
              r={active ? 6.5 : 5}
              fill={col}
              stroke={active ? '#FFFFFF' : 'transparent'}
              strokeWidth="1.5"
            />
            <text
              x={x}
              y={y - 9}
              textAnchor="middle"
              fontSize="10"
              className={`font-sans ${
                active
                  ? 'fill-slate-900 dark:fill-white font-semibold'
                  : 'fill-slate-600 dark:fill-slate-300'
              }`}
            >
              {shortName} ({formatSignedPct(sec.return1M, 1)})
            </text>
          </g>
        );
      })}
    </svg>
  );
}
