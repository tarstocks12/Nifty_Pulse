import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { DashboardPayload, StockRecord } from '../types/market';
import {
  formatINR,
  formatNumber,
  formatSignedPct,
  formatTurnoverCr,
  formatVolume,
} from '../utils/format';
import { getRatingClasses, getTagColorClasses } from '../utils/screenerMeta';
import { PriceTechnicalChart, Sparkline, StrengthGauge } from './Charts';
import { SymbolLink } from './SymbolLink';

interface StrengthOverviewViewProps {
  dashboard: DashboardPayload;
  selectedStock: StockRecord | null;
  loadingStock: boolean;
  onSelectSymbol: (symbol: string) => void;
  onJumpToScreener: (categoryId: string) => void;
}

const QUICK_SYMBOLS = [
  'RELIANCE',
  'HDFCBANK',
  'TCS',
  'ICICIBANK',
  'SBIN',
  'INFY',
  'BHARTIARTL',
  'HAL',
  'BEL',
  'TATAMOTORS',
  'BAJFINANCE',
  'SUNPHARMA',
];

interface RatioRow {
  label: string;
  stockVal: number;
  benchVal: number;
  unit: string;
  lowerIsBetter?: boolean;
  maxScale: number;
}

export function StrengthOverviewView({
  dashboard,
  selectedStock,
  loadingStock,
  onSelectSymbol,
  onJumpToScreener,
}: StrengthOverviewViewProps) {
  const [moversMode, setMoversMode] = useState<'split' | 'bullish' | 'bearish'>('split');

  const ratioRows: RatioRow[] = useMemo(() => {
    if (!selectedStock) return [];
    const f = selectedStock.fundamentals;
    const b = selectedStock.benchmark;
    return [
      {
        label: 'P/E Ratio',
        stockVal: f.pe,
        benchVal: b.pe,
        unit: 'x',
        lowerIsBetter: true,
        maxScale: Math.max(f.pe, b.pe, 40) * 1.15,
      },
      {
        label: 'Price / Book',
        stockVal: f.pb,
        benchVal: b.pb,
        unit: 'x',
        lowerIsBetter: true,
        maxScale: Math.max(f.pb, b.pb, 8) * 1.15,
      },
      {
        label: 'Return on Equity (ROE)',
        stockVal: f.roe,
        benchVal: b.roe,
        unit: '%',
        lowerIsBetter: false,
        maxScale: Math.max(f.roe, b.roe, 30) * 1.15,
      },
      {
        label: 'Debt / Equity',
        stockVal: f.debtToEquity,
        benchVal: b.debtToEquity,
        unit: 'x',
        lowerIsBetter: true,
        maxScale: Math.max(f.debtToEquity, b.debtToEquity, 1.5) * 1.15,
      },
      {
        label: '3Y Revenue CAGR',
        stockVal: f.revenueGrowth3Y,
        benchVal: b.revenueGrowth3Y,
        unit: '%',
        lowerIsBetter: false,
        maxScale: Math.max(f.revenueGrowth3Y, b.revenueGrowth3Y, 25) * 1.15,
      },
      {
        label: 'Operating / Net Margin',
        stockVal: f.profitMargin,
        benchVal: b.profitMargin,
        unit: '%',
        lowerIsBetter: false,
        maxScale: Math.max(f.profitMargin, b.profitMargin, 25) * 1.15,
      },
      {
        label: 'Dividend Yield',
        stockVal: f.divYield,
        benchVal: b.divYield,
        unit: '%',
        lowerIsBetter: false,
        maxScale: Math.max(f.divYield, b.divYield, 4) * 1.15,
      },
    ];
  }, [selectedStock]);

  const indexTiles = [
    dashboard.indices.nifty50,
    dashboard.indices.niftyBank,
    dashboard.indices.nifty500,
    dashboard.indices.niftyMidcap,
    dashboard.indices.indiaVix,
  ].filter(Boolean);

  const handleCardSelect = (symbol: string) => {
    onSelectSymbol(symbol);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="space-y-8">
      {/* 1. Market Pulse & Breadth Strip */}
      <section aria-label="Live NSE index pulse">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          {indexTiles.map((idx) => {
            if (!idx) return null;
            const up = idx.percChange >= 0;
            const isVix = idx.indexName.toUpperCase().includes('VIX');
            return (
              <div
                key={idx.indexName}
                className="bg-white dark:bg-[#111827] px-3.5 py-2.5 flex flex-col justify-between"
              >
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                  {idx.indexName}
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatNumber(idx.last, 2)}
                  </span>
                  <span
                    className={`font-mono text-xs font-medium tabular-nums inline-flex items-center ${
                      isVix
                        ? up
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                        : up
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatSignedPct(idx.percChange, 2)}
                  </span>
                </div>
              </div>
            );
          })}

          {dashboard.breadth && (
            <div className="bg-white dark:bg-[#111827] px-3.5 py-2.5 flex flex-col justify-between">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>NSE Breadth</span>
                <span className="font-mono tabular-nums">A/D {dashboard.breadth.adRatio.toFixed(2)}</span>
              </div>
              <div className="mt-1.5">
                <div className="h-1.5 w-full rounded-full overflow-hidden flex bg-slate-200 dark:bg-slate-800">
                  <div
                    className="bg-emerald-500 h-full"
                    style={{
                      width: `${(dashboard.breadth.advances / Math.max(1, dashboard.breadth.totalStocks)) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-rose-500 h-full"
                    style={{
                      width: `${(dashboard.breadth.declines / Math.max(1, dashboard.breadth.totalStocks)) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums mt-1">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {dashboard.breadth.advances} Adv
                  </span>
                  <span className="text-rose-600 dark:text-rose-400">
                    {dashboard.breadth.declines} Dec
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 2. FOCAL ANCHOR: Overall Symbol Strength & Industry Benchmark Analyzer */}
      <section
        aria-label="Overall symbol strength and benchmark comparison"
        className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
      >
        {/* Quick Symbol Switcher Row */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Scale className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Overall Symbol Strength &amp; Industry Benchmark
            </span>
            <span aria-hidden="true">·</span>
            <span>Weighted 6-Pillar Live Model</span>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5">
            {QUICK_SYMBOLS.map((sym) => {
              const isSelected = selectedStock?.symbol === sym;
              return (
                <button
                  key={sym}
                  type="button"
                  onClick={() => onSelectSymbol(sym)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {sym}
                </button>
              );
            })}
          </div>
        </div>

        {selectedStock ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
            {/* LEFT 5 COLS: Live Quote + Strength Gauge + 6-Pillar Weighted Breakdown */}
            <div className="lg:col-span-5 p-5 space-y-5">
              {/* Symbol Header + Live Price */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <SymbolLink
                      symbol={selectedStock.symbol}
                      compact
                      showFullChartLabel
                    />
                  </div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-1 truncate">
                    {selectedStock.name}
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    <span>{selectedStock.sector}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedStock.capTier}</span>
                    {selectedStock.isFnO && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Nifty F&amp;O</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {formatINR(selectedStock.ltp)}
                  </div>
                  <div
                    className={`font-mono text-xs font-semibold tabular-nums inline-flex items-center gap-0.5 mt-0.5 ${
                      selectedStock.perChange >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {selectedStock.perChange >= 0 ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    {selectedStock.change >= 0 ? '+' : ''}
                    {selectedStock.change.toFixed(2)} ({formatSignedPct(selectedStock.perChange)})
                  </div>
                </div>
              </div>

              {/* Intraday OHLC + 52W Range */}
              <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Open</div>
                  <div className="font-mono font-medium tabular-nums mt-0.5">{formatINR(selectedStock.open, 1)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Day High</div>
                  <div className="font-mono font-medium tabular-nums mt-0.5">{formatINR(selectedStock.high, 1)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Day Low</div>
                  <div className="font-mono font-medium tabular-nums mt-0.5">{formatINR(selectedStock.low, 1)}</div>
                </div>
                <div>
                  <div className="text-slate-500 dark:text-slate-400">Turnover</div>
                  <div className="font-mono font-medium tabular-nums mt-0.5">{formatTurnoverCr(selectedStock.turnoverCr)}</div>
                </div>
              </div>

              {/* 52-Week Price Range Bar */}
              <div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mb-1">
                  <span>52W Low {formatINR(selectedStock.fiftyTwoWeekLow, 1)}</span>
                  <span>
                    {selectedStock.technicals.from52wHighPct >= 0
                      ? 'At 52W Peak'
                      : `${selectedStock.technicals.from52wHighPct.toFixed(1)}% from 52W High`}
                  </span>
                  <span>52W High {formatINR(selectedStock.fiftyTwoWeekHigh, 1)}</span>
                </div>
                <div className="relative h-2 bg-slate-200 dark:bg-slate-800 rounded-full">
                  <div
                    className="absolute top-0 bottom-0 left-0 bg-emerald-500/40 rounded-full"
                    style={{
                      width: `${Math.max(
                        3,
                        Math.min(
                          100,
                          ((selectedStock.ltp - selectedStock.fiftyTwoWeekLow) /
                            Math.max(0.01, selectedStock.fiftyTwoWeekHigh - selectedStock.fiftyTwoWeekLow)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#111827]"
                    style={{
                      left: `calc(${Math.max(
                        2,
                        Math.min(
                          98,
                          ((selectedStock.ltp - selectedStock.fiftyTwoWeekLow) /
                            Math.max(0.01, selectedStock.fiftyTwoWeekHigh - selectedStock.fiftyTwoWeekLow)) *
                            100
                        )
                      )}% - 5px)`,
                    }}
                  />
                </div>
              </div>

              {/* Weighted Strength Gauge + Active Signal Tags */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="sm:col-span-5 flex justify-center">
                  <StrengthGauge
                    score={selectedStock.strength.overall}
                    rating={selectedStock.strength.rating}
                  />
                </div>
                <div className="sm:col-span-7 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Active Screener Signals ({selectedStock.signals.length})
                  </div>
                  {selectedStock.signals.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStock.signals.map((sig) => (
                        <button
                          key={sig.id}
                          type="button"
                          onClick={() => onJumpToScreener(sig.id)}
                          className={`px-2 py-0.5 text-[11px] font-medium border rounded-sm cursor-pointer transition-opacity hover:opacity-80 ${getTagColorClasses(
                            sig.tone
                          )}`}
                          title={`Filter screener by ${sig.label}`}
                        >
                          {sig.shortLabel}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Consolidating in neutral technical range. No extreme breakout trigger today.
                    </p>
                  )}
                </div>
              </div>

              {/* 6-Pillar Weighted Algorithm Breakdown */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Weighted Algorithm Breakdown
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    Weight · Pillar Score
                  </span>
                </div>
                {selectedStock.strength.pillars.map((p) => {
                  const barCol =
                    p.score >= 68
                      ? 'bg-emerald-500'
                      : p.score >= 48
                        ? 'bg-amber-500'
                        : 'bg-rose-500';
                  return (
                    <div key={p.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs gap-2">
                        <span className="text-slate-700 dark:text-slate-300 font-medium truncate">
                          {p.label}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                          {p.weight}% wt ·{' '}
                          <strong className="text-slate-900 dark:text-slate-100">{p.score}/100</strong>
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barCol}`}
                          style={{
                            width: `${p.score}%`,
                            transition: 'width 320ms cubic-bezier(0.16, 1, 0.3, 1)',
                          }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {p.summary}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT 7 COLS: Price/Technical Chart + Technical Snapshot + Financial Ratios vs Sector Benchmark */}
            <div className="lg:col-span-7 p-5 space-y-6">
              {/* Interactive NSE Bhavcopy Price + SMA + Bollinger Chart */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <BarChart3 className="w-3.5 h-3.5 text-sky-500" />
                    <span>3-Month Bhavcopy Technical Structure</span>
                    {loadingStock && (
                      <span className="font-normal text-slate-500 dark:text-slate-400">
                        · Updating history...
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    30D: <span className={selectedStock.perChange30d >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{formatSignedPct(selectedStock.perChange30d)}</span>
                  </div>
                </div>
                <PriceTechnicalChart
                  history={selectedStock.history || []}
                  sma50={selectedStock.technicals.sma50}
                  sma200={selectedStock.technicals.sma200}
                  bbUpper={selectedStock.technicals.bbUpper}
                  bbLower={selectedStock.technicals.bbLower}
                  ltp={selectedStock.ltp}
                />

                {/* Technical Readout Strip */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">RSI (14)</div>
                    <div
                      className={`font-mono font-semibold tabular-nums mt-0.5 ${
                        selectedStock.technicals.rsi14 >= 68
                          ? 'text-sky-500'
                          : selectedStock.technicals.rsi14 <= 32
                            ? 'text-amber-500'
                            : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {selectedStock.technicals.rsi14.toFixed(1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">MACD Hist</div>
                    <div
                      className={`font-mono font-semibold tabular-nums mt-0.5 ${
                        selectedStock.technicals.macdHistogram >= 0
                          ? 'text-emerald-500'
                          : 'text-rose-500'
                      }`}
                    >
                      {selectedStock.technicals.macdHistogram >= 0 ? '+' : ''}
                      {selectedStock.technicals.macdHistogram.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">50-DMA</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5 text-amber-600 dark:text-amber-400">
                      {formatNumber(selectedStock.technicals.sma50, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">200-DMA</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5 text-sky-600 dark:text-sky-400">
                      {formatNumber(selectedStock.technicals.sma200, 1)}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">Vol / 10D</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5 text-slate-900 dark:text-slate-100">
                      {selectedStock.technicals.volumeRatio10d.toFixed(2)}×
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 dark:text-slate-400 text-[11px]">Volume</div>
                    <div className="font-mono font-semibold tabular-nums mt-0.5 text-slate-900 dark:text-slate-100">
                      {formatVolume(selectedStock.volume)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Ratios vs Industry Benchmark Comparison Table */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                      Key Financial Ratios vs {selectedStock.benchmark.sector} Benchmark
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Benchmark index: {selectedStock.benchmark.nseIndexName} · Market Cap ₹
                      {formatNumber(selectedStock.fundamentals.marketCapCr, 0)} Cr
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2 rounded-xs bg-emerald-500 inline-block" />
                      {selectedStock.symbol}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2 rounded-xs bg-slate-400 dark:bg-slate-600 inline-block" />
                      Sector Avg
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                        <th className="py-2 text-left font-medium">Ratio</th>
                        <th className="py-2 text-right font-medium">{selectedStock.symbol}</th>
                        <th className="py-2 text-right font-medium">Industry Avg</th>
                        <th className="py-2 px-4 text-left font-medium hidden sm:table-cell w-44">
                          Comparison
                        </th>
                        <th className="py-2 text-right font-medium">Standing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                      {ratioRows.map((row) => {
                        const isBetter = row.lowerIsBetter
                          ? row.stockVal <= row.benchVal * 1.05
                          : row.stockVal >= row.benchVal * 0.95;
                        const stockPct = Math.min(100, Math.max(4, (row.stockVal / row.maxScale) * 100));
                        const benchPct = Math.min(100, Math.max(4, (row.benchVal / row.maxScale) * 100));
                        const verdict = row.lowerIsBetter
                          ? row.stockVal <= row.benchVal * 0.9
                            ? 'Attractive'
                            : row.stockVal <= row.benchVal * 1.1
                              ? 'In-Line'
                              : 'Premium'
                          : row.stockVal >= row.benchVal * 1.08
                            ? 'Outperforms'
                            : row.stockVal >= row.benchVal * 0.9
                              ? 'In-Line'
                              : 'Below Avg';

                        return (
                          <tr key={row.label} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2 font-medium text-slate-700 dark:text-slate-200">
                              {row.label}
                            </td>
                            <td className="py-2 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                              {row.stockVal.toFixed(2)}
                              {row.unit}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-slate-500 dark:text-slate-400">
                              {row.benchVal.toFixed(2)}
                              {row.unit}
                            </td>
                            <td className="py-2 px-4 hidden sm:table-cell">
                              <div className="space-y-1">
                                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${isBetter ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${stockPct}%` }}
                                  />
                                </div>
                                <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-slate-400 dark:bg-slate-600"
                                    style={{ width: `${benchPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td
                              className={`py-2 text-right font-medium ${
                                verdict === 'Outperforms' || verdict === 'Attractive'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : verdict === 'In-Line'
                                    ? 'text-slate-600 dark:text-slate-300'
                                    : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {verdict}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Select any NSE stock to compute its real-time weighted strength breakdown.
          </div>
        )}
      </section>

      {/* 3. TOP 20 BULLISH & TOP 20 BEARISH LIVE INTERACTIVE GRID */}
      <section aria-label="Top 20 bullish and bearish stocks for current trading day" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Today&apos;s Top 20 Bullish &amp; Top 20 Bearish Stocks
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Ranked live from CM Market intraday snapshots and composite technical strength · Click any card to inspect benchmarks
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg">
            {(
              [
                ['split', 'Split View (20 + 20)'],
                ['bullish', 'Top 20 Bullish'],
                ['bearish', 'Top 20 Bearish'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMoversMode(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  moversMode === id
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`grid gap-6 ${
            moversMode === 'split' ? 'grid-cols-1 xl:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* TOP 20 BULLISH */}
          {(moversMode === 'split' || moversMode === 'bullish') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Top 20 Bullish Momentum
                  </h3>
                </div>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                  Live Intraday + Strength
                </span>
              </div>

              <div
                className={`grid gap-2.5 ${
                  moversMode === 'split'
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                }`}
              >
                {dashboard.topBullish.map((stock, idx) => (
                  <MoverCard
                    key={stock.symbol}
                    stock={stock}
                    rank={idx + 1}
                    variant="bullish"
                    isSelected={selectedStock?.symbol === stock.symbol}
                    onSelect={handleCardSelect}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TOP 20 BEARISH */}
          {(moversMode === 'split' || moversMode === 'bearish') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-rose-500" />
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    Top 20 Bearish Pressure
                  </h3>
                </div>
                <span className="text-xs font-mono text-rose-600 dark:text-rose-400">
                  Live Weakness + Breakdown
                </span>
              </div>

              <div
                className={`grid gap-2.5 ${
                  moversMode === 'split'
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
                }`}
              >
                {dashboard.topBearish.map((stock, idx) => (
                  <MoverCard
                    key={stock.symbol}
                    stock={stock}
                    rank={idx + 1}
                    variant="bearish"
                    isSelected={selectedStock?.symbol === stock.symbol}
                    onSelect={handleCardSelect}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MoverCard({
  stock,
  rank,
  variant,
  isSelected,
  onSelect,
}: {
  stock: StockRecord;
  rank: number;
  variant: 'bullish' | 'bearish';
  isSelected: boolean;
  onSelect: (symbol: string) => void;
}) {
  const up = stock.perChange >= 0;
  const topTag = stock.signals[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(stock.symbol)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(stock.symbol);
        }
      }}
      className={`p-3.5 rounded-lg border transition-colors cursor-pointer bg-white dark:bg-[#111827] hover:bg-slate-50 dark:hover:bg-slate-800/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        isSelected
          ? 'border-emerald-500 dark:border-emerald-500'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500 w-5 shrink-0 tabular-nums">
            #{rank}
          </span>
          <SymbolLink
            symbol={stock.symbol}
            compact
            onSelect={onSelect}
          />
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
            {formatINR(stock.ltp, 2)}
          </div>
          <div
            className={`font-mono text-xs font-semibold tabular-nums ${
              up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatSignedPct(stock.perChange, 2)}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2.5">
        <div className="min-w-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {stock.sector} · {stock.isFnO ? 'F&O' : 'N500'}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] font-mono tabular-nums text-slate-600 dark:text-slate-300">
            <span className={getRatingClasses(stock.strength.rating)}>
              Str {stock.strength.overall}
            </span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span>RSI {stock.technicals.rsi14.toFixed(0)}</span>
            <span aria-hidden="true" className="text-slate-400">·</span>
            <span>{stock.technicals.volumeRatio10d.toFixed(1)}×V</span>
          </div>
        </div>
        <Sparkline data={stock.sparkline} positive={variant === 'bullish' ? up || stock.perChange30d >= 0 : false} width={74} height={24} />
      </div>

      {topTag && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/70 flex items-center justify-between gap-2">
          <span
            className={`px-1.5 py-0.5 text-[10px] font-medium border rounded-xs truncate ${getTagColorClasses(
              topTag.tone
            )}`}
          >
            {topTag.shortLabel}
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
            Vol {formatVolume(stock.volume)}
          </span>
        </div>
      )}
    </div>
  );
}
