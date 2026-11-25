import { ExternalLink, LineChart } from 'lucide-react';
import { getTradingViewUrl } from '../utils/format';

interface SymbolLinkProps {
  symbol: string;
  name?: string;
  isFnO?: boolean;
  isNifty50?: boolean;
  compact?: boolean;
  onSelect?: (symbol: string) => void;
  showFullChartLabel?: boolean;
}

/**
 * Renders an NSE stock symbol with an always-present direct hyperlink to TradingView's
 * advanced charting interface (https://www.tradingview.com/chart/?symbol=NSE:<SYMBOL>).
 */
export function SymbolLink({
  symbol,
  name,
  isFnO,
  isNifty50,
  compact = false,
  onSelect,
  showFullChartLabel = false,
}: SymbolLinkProps) {
  const tvUrl = getTradingViewUrl(symbol);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(symbol)}
              className="font-mono font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xs"
              title={`Analyze ${symbol} strength & benchmarks`}
            >
              {symbol}
            </button>
          ) : (
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 truncate">
              {symbol}
            </span>
          )}

          {/* Direct TradingView Chart Hyperlink — always rendered adjacent to every symbol */}
          <a
            href={tvUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={`Open ${symbol} live chart on TradingView`}
            aria-label={`Open ${symbol} live chart on TradingView`}
            className={`inline-flex items-center gap-1 shrink-0 rounded-sm border border-slate-200 dark:border-slate-700/80 bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-sky-500/60 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              showFullChartLabel ? 'px-2.5 py-1 text-xs font-medium' : 'px-1.5 py-0.5 text-[11px] font-medium'
            }`}
          >
            <LineChart className="w-3 h-3 shrink-0" />
            <span className="whitespace-nowrap">{showFullChartLabel ? 'TradingView Chart' : 'TV'}</span>
            <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-75" />
          </a>
        </div>

        {!compact && name && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
            <span className="truncate">{name}</span>
            {(isNifty50 || isFnO) && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                  {isNifty50 ? 'N50 · F&O' : 'F&O'}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
