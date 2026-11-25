import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Filter, Search } from 'lucide-react';
import type { ScreenerCategoryId, StockRecord, UniverseFilter } from '../types/market';
import {
  formatINR,
  formatNumber,
  formatSignedPct,
  formatTurnoverCr,
  formatVolume,
} from '../utils/format';
import {
  SCREENER_BY_ID,
  SCREENER_DEFINITIONS,
  getRatingClasses,
  getTagColorClasses,
} from '../utils/screenerMeta';
import { Sparkline } from './Charts';
import { SymbolLink } from './SymbolLink';

interface ScreenerViewProps {
  mode: 'technical' | 'thematic';
  stocks: StockRecord[];
  categoryCounts: Record<ScreenerCategoryId, number>;
  activeCategory: ScreenerCategoryId;
  onCategoryChange: (cat: ScreenerCategoryId) => void;
  universeFilter: UniverseFilter;
  onInspectStock: (stock: StockRecord) => void;
}

type SortKey =
  | 'strength'
  | 'perChange'
  | 'perChange30d'
  | 'ltp'
  | 'rsi'
  | 'volRatio'
  | 'turnover'
  | 'pe'
  | 'roe';

export function ScreenerView({
  mode,
  stocks,
  categoryCounts,
  activeCategory,
  onCategoryChange,
  universeFilter,
  onInspectStock,
}: ScreenerViewProps) {
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [tableQuery, setTableQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('strength');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  const tabs = useMemo(() => {
    const groupTabs = SCREENER_DEFINITIONS.filter((d) => d.group === mode);
    if (mode === 'technical') {
      return [SCREENER_DEFINITIONS[0], ...groupTabs];
    }
    return groupTabs;
  }, [mode]);

  const effectiveCategory = useMemo(() => {
    if (tabs.some((t) => t.id === activeCategory)) return activeCategory;
    return tabs[0].id;
  }, [tabs, activeCategory]);

  const activeDef = SCREENER_BY_ID.get(effectiveCategory) || tabs[0];

  const sectors = useMemo(() => {
    const set = new Set(stocks.map((s) => s.sector));
    return ['ALL', ...Array.from(set).sort()];
  }, [stocks]);

  const filtered = useMemo(() => {
    const q = tableQuery.trim().toUpperCase();
    return stocks
      .filter((s) => {
        if (universeFilter === 'fno' && !s.isFnO) return false;
        if (universeFilter === 'nifty50' && !s.isNifty50) return false;
        if (universeFilter === 'nifty500' && !s.isNifty500) return false;
        if (sectorFilter !== 'ALL' && s.sector !== sectorFilter) return false;
        if (effectiveCategory !== 'all' && !s.signals.some((sig) => sig.id === effectiveCategory)) {
          return false;
        }
        if (q && !s.symbol.includes(q) && !s.name.toUpperCase().includes(q) && !s.sector.toUpperCase().includes(q)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        let va = 0;
        let vb = 0;
        switch (sortKey) {
          case 'strength':
            va = a.strength.overall;
            vb = b.strength.overall;
            break;
          case 'perChange':
            va = a.perChange;
            vb = b.perChange;
            break;
          case 'perChange30d':
            va = a.perChange30d;
            vb = b.perChange30d;
            break;
          case 'ltp':
            va = a.ltp;
            vb = b.ltp;
            break;
          case 'rsi':
            va = a.technicals.rsi14;
            vb = b.technicals.rsi14;
            break;
          case 'volRatio':
            va = a.technicals.volumeRatio10d;
            vb = b.technicals.volumeRatio10d;
            break;
          case 'turnover':
            va = a.turnoverCr;
            vb = b.turnoverCr;
            break;
          case 'pe':
            va = a.fundamentals.pe;
            vb = b.fundamentals.pe;
            break;
          case 'roe':
            va = a.fundamentals.roe;
            vb = b.fundamentals.roe;
            break;
        }
        return sortDir === 'desc' ? vb - va : va - vb;
      });
  }, [stocks, universeFilter, sectorFilter, effectiveCategory, tableQuery, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Segment',
      'LTP',
      '1D %',
      '30D %',
      'Strength',
      'Rating',
      'RSI14',
      'SMA50',
      'SMA200',
      'VolRatio10D',
      'PE',
      'ROE',
      'Signals',
      'TradingViewURL',
    ];
    const rows = filtered.map((s) => [
      s.symbol,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.sector}"`,
      s.isFnO ? 'F&O' : 'Nifty500',
      s.ltp,
      s.perChange,
      s.perChange30d,
      s.strength.overall,
      s.strength.rating,
      s.technicals.rsi14,
      s.technicals.sma50,
      s.technicals.sma200,
      s.technicals.volumeRatio10d,
      s.fundamentals.pe,
      s.fundamentals.roe,
      `"${s.signals.map((t) => t.shortLabel).join('; ')}"`,
      `https://www.tradingview.com/chart/?symbol=NSE%3A${encodeURIComponent(s.symbol)}`,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `niftypulse-${effectiveCategory}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIndicator = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null;
    return sortDir === 'desc' ? (
      <ArrowDown className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowUp className="w-3 h-3 inline ml-0.5" />
    );
  };

  return (
    <div className="space-y-5">
      {/* Category Selector Grid */}
      <div className="flex flex-wrap gap-1.5">
        {tabs.map((tab) => {
          const active = tab.id === effectiveCategory;
          const count = categoryCounts[tab.id] ?? 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onCategoryChange(tab.id)}
              className={`px-3 py-2 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2 ${
                active
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-emerald-600 dark:text-white dark:border-emerald-600'
                  : 'bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <span>{tab.shortLabel}</span>
              <span
                className={`font-mono text-[11px] tabular-nums ${
                  active ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Strategy Summary + Filters Toolbar */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {activeDef.label}
            </h2>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
              · {filtered.length} matching stocks
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {activeDef.description}
          </p>
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            Rule: {activeDef.criteria}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Filter ticker or sector..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44"
            />
          </div>

          <div className="relative flex items-center">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              aria-label="Filter by sector"
              className="pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </button>
        </div>
      </div>

      {/* CoinGecko / TradingView High-Density Data Grid */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              No stocks currently match this exact filter combination
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try switching the universe scope to All NSE or clearing the sector/search filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSectorFilter('ALL');
                setTableQuery('');
              }}
              className="mt-2 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-2 text-left font-medium w-9">#</th>
                  <th className="py-2.5 px-2 text-left font-medium min-w-[205px]">Symbol &amp; Chart</th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => toggleSort('ltp')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      LTP <SortIndicator k="ltp" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => toggleSort('perChange')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      1D % <SortIndicator k="perChange" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => toggleSort('perChange30d')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      30D % <SortIndicator k="perChange30d" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-medium">20D Trend</th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => toggleSort('strength')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      Strength <SortIndicator k="strength" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => toggleSort('rsi')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      RSI(14) <SortIndicator k="rsi" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-right font-medium whitespace-nowrap">50 / 200 DMA</th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => toggleSort('volRatio')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      Vol Surge <SortIndicator k="volRatio" />
                    </button>
                  </th>
                  {mode === 'thematic' ? (
                    <>
                      <th className="py-2.5 px-2 text-right font-medium">
                        <button type="button" onClick={() => toggleSort('pe')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                          P/E <SortIndicator k="pe" />
                        </button>
                      </th>
                      <th className="py-2.5 px-2 text-right font-medium">
                        <button type="button" onClick={() => toggleSort('roe')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                          ROE % <SortIndicator k="roe" />
                        </button>
                      </th>
                    </>
                  ) : (
                    <th className="py-2.5 px-2 text-right font-medium">
                      <button type="button" onClick={() => toggleSort('turnover')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                        Turnover <SortIndicator k="turnover" />
                      </button>
                    </th>
                  )}
                  <th className="py-2.5 pl-2 pr-4 text-left font-medium min-w-[190px]">Active Signals</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filtered.map((stock, i) => {
                  const up = stock.perChange >= 0;
                  const up30 = stock.perChange30d >= 0;
                  const golden = stock.technicals.sma50 >= stock.technicals.sma200;

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onInspectStock(stock)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 pl-4 pr-2 font-mono text-slate-400 dark:text-slate-500 tabular-nums">
                        {i + 1}
                      </td>
                      <td className="py-2.5 px-2">
                        <SymbolLink
                          symbol={stock.symbol}
                          name={stock.name}
                          isFnO={stock.isFnO}
                          isNifty50={stock.isNifty50}
                          onSelect={() => onInspectStock(stock)}
                        />
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                        {formatINR(stock.ltp)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono font-semibold tabular-nums whitespace-nowrap ${
                          up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(stock.perChange)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                          up30 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(stock.perChange30d, 1)}
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex justify-center">
                          <Sparkline
                            data={stock.sparkline}
                            positive={stock.sparkline.length >= 2 ? stock.sparkline[stock.sparkline.length - 1] >= stock.sparkline[0] : up}
                            width={82}
                            height={24}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="inline-flex flex-col items-end">
                          <span className={`font-mono font-bold tabular-nums ${getRatingClasses(stock.strength.rating)}`}>
                            {stock.strength.overall}
                          </span>
                          <div className="w-12 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-0.5">
                            <div
                              className={`h-full ${
                                stock.strength.overall >= 65
                                  ? 'bg-emerald-500'
                                  : stock.strength.overall >= 45
                                    ? 'bg-amber-500'
                                    : 'bg-rose-500'
                              }`}
                              style={{ width: `${stock.strength.overall}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap ${
                          stock.technicals.rsi14 >= 68
                            ? 'text-sky-600 dark:text-sky-400 font-semibold'
                            : stock.technicals.rsi14 <= 34
                              ? 'text-amber-600 dark:text-amber-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {stock.technicals.rsi14.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-slate-700 dark:text-slate-200">
                          {formatNumber(stock.technicals.sma50, 0)} / {formatNumber(stock.technicals.sma200, 0)}
                        </div>
                        <div className={`text-[10px] ${golden ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {golden ? '50D > 200D' : '50D < 200D'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        <div
                          className={
                            stock.technicals.volumeRatio10d >= 1.65
                              ? 'text-sky-600 dark:text-sky-400 font-semibold'
                              : 'text-slate-700 dark:text-slate-300'
                          }
                        >
                          {stock.technicals.volumeRatio10d.toFixed(2)}×
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {formatVolume(stock.volume)}
                        </div>
                      </td>
                      {mode === 'thematic' ? (
                        <>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                            {stock.fundamentals.pe.toFixed(1)}x
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                            {stock.fundamentals.roe.toFixed(1)}%
                          </td>
                        </>
                      ) : (
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatTurnoverCr(stock.turnoverCr)}
                        </td>
                      )}
                      <td className="py-2.5 pl-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {stock.signals.slice(0, 3).map((sig) => (
                            <span
                              key={sig.id}
                              className={`px-1.5 py-0.5 text-[10px] font-medium border rounded-xs whitespace-nowrap ${getTagColorClasses(
                                sig.tone
                              )}`}
                            >
                              {sig.shortLabel}
                            </span>
                          ))}
                          {stock.signals.length > 3 && (
                            <span className="text-[10px] font-mono text-slate-400 self-center">
                              +{stock.signals.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
