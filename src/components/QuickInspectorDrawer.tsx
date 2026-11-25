import { ArrowRight, X } from 'lucide-react';
import type { StockRecord } from '../types/market';
import { formatINR, formatNumber, formatSignedPct, formatVolume } from '../utils/format';
import { getTagColorClasses } from '../utils/screenerMeta';
import { StrengthGauge } from './Charts';
import { SymbolLink } from './SymbolLink';

interface QuickInspectorDrawerProps {
  stock: StockRecord | null;
  onClose: () => void;
  onOpenFullDashboard: (symbol: string) => void;
}

export function QuickInspectorDrawer({
  stock,
  onClose,
  onOpenFullDashboard,
}: QuickInspectorDrawerProps) {
  if (!stock) return null;

  const up = stock.perChange >= 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-[1px]" onClick={onClose}>
      <aside
        className="w-full max-w-md bg-white dark:bg-[#0F172A] border-l border-slate-200 dark:border-slate-800 h-full overflow-y-auto p-5 flex flex-col justify-between gap-6"
        onClick={(e) => e.stopPropagation()}
        aria-label={`${stock.symbol} quick strength inspector`}
      >
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <SymbolLink symbol={stock.symbol} compact showFullChartLabel />
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-1.5">
                {stock.name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {stock.sector} · {stock.capTier} · {stock.isFnO ? 'Nifty F&O' : 'Nifty 500'}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close inspector"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Price + Gauge */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Last Traded Price</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-white mt-0.5">
                {formatINR(stock.ltp)}
              </div>
              <div
                className={`font-mono text-xs font-semibold tabular-nums mt-0.5 ${
                  up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {formatSignedPct(stock.perChange)} today · {formatSignedPct(stock.perChange30d, 1)} (30D)
              </div>
            </div>
            <StrengthGauge score={stock.strength.overall} rating={stock.strength.rating} />
          </div>

          {/* Active Signal Tags */}
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Triggered Screener Categories
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stock.signals.length > 0 ? (
                stock.signals.map((sig) => (
                  <span
                    key={sig.id}
                    className={`px-2 py-0.5 text-[11px] font-medium border rounded-xs ${getTagColorClasses(
                      sig.tone
                    )}`}
                  >
                    {sig.label}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500 dark:text-slate-400">No active extreme signals</span>
              )}
            </div>
          </div>

          {/* Key Technicals Grid */}
          <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <div className="text-slate-500 dark:text-slate-400">RSI (14)</div>
              <div className="font-mono font-semibold tabular-nums mt-0.5">{stock.technicals.rsi14.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">50-DMA</div>
              <div className="font-mono font-semibold tabular-nums mt-0.5">{formatNumber(stock.technicals.sma50, 1)}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">200-DMA</div>
              <div className="font-mono font-semibold tabular-nums mt-0.5">{formatNumber(stock.technicals.sma200, 1)}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Vol Surge</div>
              <div className="font-mono font-semibold tabular-nums mt-0.5">{stock.technicals.volumeRatio10d.toFixed(2)}×</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Volume</div>
              <div className="font-mono font-semibold tabular-nums mt-0.5">{formatVolume(stock.volume)}</div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">From 52W High</div>
              <div className="font-mono font-semibold tabular-nums mt-0.5">{stock.technicals.from52wHighPct.toFixed(1)}%</div>
            </div>
          </div>

          {/* Financial Ratio Quick Snapshot vs Benchmark */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Ratios vs {stock.benchmark.sector} Benchmark
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">P/E Ratio</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {stock.fundamentals.pe.toFixed(1)}x{' '}
                  <span className="text-[11px] font-normal text-slate-500">vs {stock.benchmark.pe}x</span>
                </div>
              </div>
              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">ROE</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {stock.fundamentals.roe.toFixed(1)}%{' '}
                  <span className="text-[11px] font-normal text-slate-500">vs {stock.benchmark.roe}%</span>
                </div>
              </div>
              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">3Y Rev CAGR</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {stock.fundamentals.revenueGrowth3Y.toFixed(1)}%{' '}
                  <span className="text-[11px] font-normal text-slate-500">vs {stock.benchmark.revenueGrowth3Y}%</span>
                </div>
              </div>
              <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-slate-500 dark:text-slate-400">Debt / Equity</div>
                <div className="font-mono font-semibold tabular-nums mt-0.5">
                  {stock.fundamentals.debtToEquity.toFixed(2)}x{' '}
                  <span className="text-[11px] font-normal text-slate-500">vs {stock.benchmark.debtToEquity}x</span>
                </div>
              </div>
            </div>
          </div>

          {/* 6 Pillars summary */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Weighted Strength Pillars
            </div>
            {stock.strength.pillars.map((p) => (
              <div key={p.key} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-300">{p.label} ({p.weight}%)</span>
                <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                  {p.score}/100
                </span>
              </div>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onOpenFullDashboard(stock.symbol);
            onClose();
          }}
          className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span>Open Full Benchmark &amp; Chart Analysis</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </aside>
    </div>
  );
}
