import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Download,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import type {
  UniverseFilter,
  XtsiDashboardPayload,
  XtsiFilterOption,
  XtsiSymbolRow,
  XtsiTimeframe,
  XtsiTimeframeSignal,
} from '../types/market';
import { formatINR, formatSignedPct, getTradingViewUrl } from '../utils/format';
import { SymbolLink } from './SymbolLink';

interface XtsiDashboardViewProps {
  watchlist: UniverseFilter;
  onWatchlistChange: (wl: UniverseFilter) => void;
  onSelectSymbolForStrength: (symbol: string) => void;
}

const XTSI_FILTER_OPTIONS: XtsiFilterOption[] = [
  'All',
  'Regime: Bull',
  'Regime: Bear',
  'Bull & OSC < -25',
  'Bull & OSC < -40',
  'Bull & OSC < 0',
  'Bear & OSC > 0',
  'Bull & OSC > 0 (P2)',
  'Bear & OSC < 0 (P2)',
];

const TIMEFRAMES: { tf: XtsiTimeframe; htf: string; label: string; tvInterval: '5' | '60' | 'D' }[] = [
  { tf: '5m', htf: '1H', label: '5m Chart · HTF 1H', tvInterval: '5' },
  { tf: '1H', htf: '1D', label: '1H Chart · HTF 1D', tvInterval: '60' },
  { tf: '1D', htf: '1W', label: '1D Chart · HTF 1W', tvInterval: 'D' },
];

type StrengthFilter =
  | 'All'
  | 'All Bull'
  | 'STRONG BULL'
  | 'BULL'
  | 'NEUTRAL'
  | 'BEAR'
  | 'STRONG BEAR'
  | 'All Bear';

type BarCountFilter = 'all' | 'fresh' | '3' | '5' | '10' | '25';

type SortField = 'minCtfBars' | 'tsiStrength' | 'perChange' | 'symbol' | '5m' | '1H' | '1D';
type TfSortMode = 'bars' | 'oscillator';

function matchesXtsiFilter(sig: XtsiTimeframeSignal | undefined, filter: XtsiFilterOption): boolean {
  if (filter === 'All') return true;
  if (!sig || sig.unavailable) return false;
  switch (filter) {
    case 'Regime: Bull':
      return sig.isBull;
    case 'Regime: Bear':
      return sig.isBear;
    case 'Bull & OSC < -25':
      return sig.isBull && sig.scaledTsi < -25;
    case 'Bull & OSC < -40':
      return sig.isBull && sig.scaledTsi < -40;
    case 'Bull & OSC < 0':
      return sig.isBull && sig.scaledTsi < 0;
    case 'Bear & OSC > 0':
      return sig.isBear && sig.scaledTsi > 0;
    case 'Bull & OSC > 0 (P2)':
      return sig.isBull && sig.scaledTsi > 0;
    case 'Bear & OSC < 0 (P2)':
      return sig.isBear && sig.scaledTsi < 0;
    default:
      return true;
  }
}

function strengthBadgeClass(label: XtsiSymbolRow['tsiStrengthLabel']): string {
  switch (label) {
    case 'STRONG BULL':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35';
    case 'BULL':
      return 'bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/30';
    case 'BEAR':
      return 'bg-orange-500/12 text-orange-700 dark:text-orange-300 border-orange-500/30';
    case 'STRONG BEAR':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35';
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25';
  }
}

export function XtsiDashboardView({
  watchlist,
  onWatchlistChange,
  onSelectSymbolForStrength,
}: XtsiDashboardViewProps) {
  const [payload, setPayload] = useState<XtsiDashboardPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Exact D4-TSI Filters
  const [tfFilters, setTfFilters] = useState<Record<XtsiTimeframe, XtsiFilterOption>>({
    '5m': 'All',
    '1H': 'All',
    '1D': 'All',
  });
  const [strengthFilter, setStrengthFilter] = useState<StrengthFilter>('All');
  const [barFilter, setBarFilter] = useState<BarCountFilter>('all');
  const [barFilterTf, setBarFilterTf] = useState<'any' | XtsiTimeframe>('any');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('minCtfBars');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [tfSortMode, setTfSortMode] = useState<TfSortMode>('bars');

  const fetchXtsi = useCallback(
    async (force = false) => {
      if (force) setRefreshing(true);
      try {
        const res = await fetch(
          `/api/xtsi?watchlist=${encodeURIComponent(watchlist)}${force ? '&refresh=1' : ''}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data: XtsiDashboardPayload = await res.json();
        setPayload((prev) => {
          // Never wipe populated rows if a transient refresh returned 0 rows
          if (prev && prev.watchlist === data.watchlist && data.rows.length === 0 && prev.rows.length > 0) {
            return prev;
          }
          return data;
        });
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Unable to load X TSI scan.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [watchlist]
  );

  // Initial fetch whenever watchlist changes
  useEffect(() => {
    setLoading(true);
    fetchXtsi(false);
  }, [fetchXtsi]);

  // Progressive background poll while scanning remaining watchlist symbols
  useEffect(() => {
    if (!payload?.scanning) return;
    const timer = setTimeout(() => {
      fetchXtsi(false);
    }, 2600);
    return () => clearTimeout(timer);
  }, [payload, fetchXtsi]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'minCtfBars' || field === 'symbol' || tfSortMode === 'bars' ? 'asc' : 'desc');
    }
  };

  const resetAllFilters = () => {
    setTfFilters({ '5m': 'All', '1H': 'All', '1D': 'All' });
    setStrengthFilter('All');
    setBarFilter('all');
    setBarFilterTf('any');
    setSearchQuery('');
  };

  const rows = payload?.rows || [];

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return rows
      .filter((row) => {
        if (q && !row.symbol.toUpperCase().includes(q) && !row.name.toUpperCase().includes(q)) {
          return false;
        }
        // Strength filter
        if (strengthFilter !== 'All') {
          if (strengthFilter === 'All Bull') {
            if (row.tsiStrengthLabel !== 'STRONG BULL' && row.tsiStrengthLabel !== 'BULL') return false;
          } else if (strengthFilter === 'All Bear') {
            if (row.tsiStrengthLabel !== 'STRONG BEAR' && row.tsiStrengthLabel !== 'BEAR') return false;
          } else if (row.tsiStrengthLabel !== strengthFilter) {
            return false;
          }
        }
        // Individual timeframe D4-TSI dropdown filters
        for (const tf of ['5m', '1H', '1D'] as XtsiTimeframe[]) {
          if (!matchesXtsiFilter(row.timeframes[tf], tfFilters[tf])) {
            return false;
          }
        }
        // Bar count filter after X TSI cross
        if (barFilter !== 'all') {
          const tfsToCheck: XtsiTimeframe[] = barFilterTf === 'any' ? ['5m', '1H', '1D'] : [barFilterTf];
          const ok = tfsToCheck.some((tf) => {
            const s = row.timeframes[tf];
            if (!s || s.unavailable || s.ctfBarsSinceCross <= 0) return false;
            if (barFilter === 'fresh') return s.freshCross;
            return s.ctfBarsSinceCross <= Number(barFilter);
          });
          if (!ok) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortField === 'symbol') {
          return sortDir === 'asc'
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        }
        if (sortField === 'tsiStrength') {
          return sortDir === 'asc' ? a.tsiStrength - b.tsiStrength : b.tsiStrength - a.tsiStrength;
        }
        if (sortField === 'perChange') {
          return sortDir === 'asc' ? a.perChange - b.perChange : b.perChange - a.perChange;
        }
        if (sortField === 'minCtfBars') {
          return sortDir === 'asc' ? a.minCtfBars - b.minCtfBars : b.minCtfBars - a.minCtfBars;
        }
        // Timeframe column sort (by bar count or oscillator value)
        const sA = a.timeframes[sortField];
        const sB = b.timeframes[sortField];
        if (tfSortMode === 'oscillator') {
          const va = sA?.unavailable ? -999 : sA.scaledTsi;
          const vb = sB?.unavailable ? -999 : sB.scaledTsi;
          return sortDir === 'asc' ? va - vb : vb - va;
        }
        const ba = sA?.unavailable || sA.ctfBarsSinceCross <= 0 ? 9999 : sA.ctfBarsSinceCross;
        const bb = sB?.unavailable || sB.ctfBarsSinceCross <= 0 ? 9999 : sB.ctfBarsSinceCross;
        return sortDir === 'asc' ? ba - bb : bb - ba;
      });
  }, [rows, searchQuery, strengthFilter, tfFilters, barFilter, barFilterTf, sortField, sortDir, tfSortMode]);

  const stats = useMemo(() => {
    let freshCount = 0;
    let bull1H = 0;
    let bear1H = 0;
    let deepBullOversold = 0;
    let bearOverbought = 0;

    for (const r of rows) {
      if (r.hasFreshXtsi) freshCount++;
      const s5 = r.timeframes['5m'];
      const s1h = r.timeframes['1H'];
      const s1d = r.timeframes['1D'];
      if (s1h.isBull) bull1H++;
      if (s1h.isBear) bear1H++;
      if (
        (s5.isBull && s5.scaledTsi < -25) ||
        (s1h.isBull && s1h.scaledTsi < -25) ||
        (s1d.isBull && s1d.scaledTsi < -25)
      ) {
        deepBullOversold++;
      }
      if (
        (s5.isBear && s5.scaledTsi > 0) ||
        (s1h.isBear && s1h.scaledTsi > 0) ||
        (s1d.isBear && s1d.scaledTsi > 0)
      ) {
        bearOverbought++;
      }
    }
    return { freshCount, bull1H, bear1H, deepBullOversold, bearOverbought };
  }, [rows]);

  const handleExportCsv = () => {
    const headers = [
      'Symbol',
      'LTP',
      '1D %',
      'TSI Strength',
      '5m_HTF1H_Regime',
      '5m_Bars',
      '1H_HTF_Bars',
      '5m_HTF1H_OSC',
      '1H_HTF1D_Regime',
      '1H_Bars',
      '1D_HTF_Bars',
      '1H_HTF1D_OSC',
      '1D_HTF1W_Regime',
      '1D_Bars',
      '1W_HTF_Bars',
      '1D_HTF1W_OSC',
      'TradingViewURL',
    ];
    const csvRows = filteredRows.map((r) => [
      r.symbol,
      r.ltp,
      r.perChange,
      `${r.tsiStrength} (${r.tsiStrengthLabel})`,
      r.timeframes['5m'].regime,
      r.timeframes['5m'].ctfBarsSinceCross,
      r.timeframes['5m'].htfBarsSinceCross,
      r.timeframes['5m'].scaledTsi,
      r.timeframes['1H'].regime,
      r.timeframes['1H'].ctfBarsSinceCross,
      r.timeframes['1H'].htfBarsSinceCross,
      r.timeframes['1H'].scaledTsi,
      r.timeframes['1D'].regime,
      r.timeframes['1D'].ctfBarsSinceCross,
      r.timeframes['1D'].htfBarsSinceCross,
      r.timeframes['1D'].scaledTsi,
      getTradingViewUrl(r.symbol),
    ]);
    const csv = [headers.join(','), ...csvRows.map((x) => x.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `niftypulse-xtsi-${watchlist}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ f }: { f: SortField }) => {
    if (sortField !== f) return null;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 inline ml-0.5" />
    ) : (
      <ArrowDown className="w-3 h-3 inline ml-0.5" />
    );
  };

  const hasActiveFilter =
    tfFilters['5m'] !== 'All' ||
    tfFilters['1H'] !== 'All' ||
    tfFilters['1D'] !== 'All' ||
    strengthFilter !== 'All' ||
    barFilter !== 'all' ||
    searchQuery.trim().length > 0;

  return (
    <div className="space-y-5">
      {/* Header & Watchlist Switcher */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Activity className="w-4 h-4 text-amber-500 shrink-0" />
              <h1 className="font-display text-base font-bold text-slate-900 dark:text-white">
                X TSI Scanner — HTF TSI Cross Dashboard (2x TSI WaveTrend Pine v6)
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exact Pine Script sync: TSI(13, 25, Sig 13) zero-anchored to WT(7, 18) over 100 bars ·{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">5m → HTF 1H</span> ·{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">1H → HTF 1D</span> ·{' '}
              <span className="font-mono text-slate-700 dark:text-slate-300">1D → HTF 1W</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Watchlist Selector */}
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
              {(
                [
                  ['personal', 'Personal (143)'],
                  ['fno', 'Nifty F&O'],
                  ['nifty50', 'Nifty 50'],
                  ['nifty500', 'Nifty 500'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onWatchlistChange(id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    watchlist === id
                      ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fetchXtsi(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Rescan X TSI
            </button>
          </div>
        </div>

        {/* Scan Progress Strip */}
        {payload && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
              <span className="text-slate-600 dark:text-slate-300">
                Scanned <strong className="text-slate-900 dark:text-white">{payload.scannedCount}</strong> / {payload.totalSymbols}
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                Fresh X TSI: <strong>{stats.freshCount}</strong>
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                1H→1D Bull: <strong>{stats.bull1H}</strong>
              </span>
              <span className="text-rose-600 dark:text-rose-400">
                1H→1D Bear: <strong>{stats.bear1H}</strong>
              </span>
              <span className="text-sky-600 dark:text-sky-400">
                Bull &amp; OSC &lt; -25: <strong>{stats.deepBullOversold}</strong>
              </span>
              <span className="text-orange-600 dark:text-orange-400">
                Bear &amp; OSC &gt; 0: <strong>{stats.bearOverbought}</strong>
              </span>
            </div>

            {payload.scanning && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                <div className="w-24 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((payload.scannedCount / Math.max(1, payload.totalSymbols)) * 100))}%`,
                    }}
                  />
                </div>
                <span>Syncing candles...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* D4-TSI Filter Bar (Exact 9 Dropdown Options per Timeframe + Bar Count + Strength) */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 3 Per-Timeframe D4-TSI Dropdowns */}
          {TIMEFRAMES.map(({ tf, htf }) => (
            <div key={tf} className="space-y-1">
              <label
                htmlFor={`xtsi-filter-${tf}`}
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
              >
                {tf} Filter (HTF: {htf} X TSI)
              </label>
              <select
                id={`xtsi-filter-${tf}`}
                value={tfFilters[tf]}
                onChange={(e) =>
                  setTfFilters((prev) => ({
                    ...prev,
                    [tf]: e.target.value as XtsiFilterOption,
                  }))
                }
                className={`w-full px-2.5 py-1.5 text-xs rounded-md border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
                  tfFilters[tf] !== 'All'
                    ? 'border-emerald-500 dark:border-emerald-500 font-semibold'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                {XTSI_FILTER_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* Bar Count After X TSI Cross Filter */}
          <div className="space-y-1">
            <label
              htmlFor="xtsi-bar-filter"
              className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              Bars After X TSI Cross
            </label>
            <div className="flex gap-1.5">
              <select
                id="xtsi-bar-filter"
                value={barFilter}
                onChange={(e) => setBarFilter(e.target.value as BarCountFilter)}
                className={`flex-1 px-2 py-1.5 text-xs rounded-md border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
                  barFilter !== 'all'
                    ? 'border-amber-500 font-semibold'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <option value="all">All Bars</option>
                <option value="fresh">Fresh Cross (Current HTF Bar)</option>
                <option value="3">≤ 3 CTF Bars</option>
                <option value="5">≤ 5 CTF Bars</option>
                <option value="10">≤ 10 CTF Bars</option>
                <option value="25">≤ 25 CTF Bars</option>
              </select>
              <select
                aria-label="Bar count timeframe scope"
                value={barFilterTf}
                onChange={(e) => setBarFilterTf(e.target.value as 'any' | XtsiTimeframe)}
                className="w-16 px-1.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 cursor-pointer"
              >
                <option value="any">Any</option>
                <option value="5m">5m</option>
                <option value="1H">1H</option>
                <option value="1D">1D</option>
              </select>
            </div>
          </div>

          {/* TSI Composite Strength Filter */}
          <div className="space-y-1">
            <label
              htmlFor="xtsi-strength-filter"
              className="block text-[11px] font-medium text-slate-500 dark:text-slate-400"
            >
              TSI Composite Strength
            </label>
            <select
              id="xtsi-strength-filter"
              value={strengthFilter}
              onChange={(e) => setStrengthFilter(e.target.value as StrengthFilter)}
              className={`w-full px-2.5 py-1.5 text-xs rounded-md border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer ${
                strengthFilter !== 'All'
                  ? 'border-emerald-500 font-semibold'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <option value="All">All Regimes</option>
              <option value="All Bull">All Bull (Strong + Bull)</option>
              <option value="STRONG BULL">STRONG BULL</option>
              <option value="BULL">BULL</option>
              <option value="NEUTRAL">NEUTRAL</option>
              <option value="BEAR">BEAR</option>
              <option value="STRONG BEAR">STRONG BEAR</option>
              <option value="All Bear">All Bear (Strong + Bear)</option>
            </select>
          </div>
        </div>

        {/* Secondary Toolbar: Search, TF Column Sort Mode, Reset, CSV */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter symbol..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44"
              />
            </div>

            <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              <span className="px-2 text-[11px] text-slate-500 dark:text-slate-400">TF Sort:</span>
              <button
                type="button"
                onClick={() => setTfSortMode('bars')}
                className={`px-2 py-1 rounded-xs cursor-pointer ${
                  tfSortMode === 'bars'
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Bar Count
              </button>
              <button
                type="button"
                onClick={() => setTfSortMode('oscillator')}
                className={`px-2 py-1 rounded-xs cursor-pointer ${
                  tfSortMode === 'oscillator'
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                OSC Level
              </button>
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Filters
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Showing <strong className="text-slate-900 dark:text-white">{filteredRows.length}</strong> of {rows.length} symbols
            </span>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchXtsi(true)}
            className="px-3 py-1 rounded-md bg-rose-600 text-white font-medium cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* X TSI Multi-Timeframe Results Table */}
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="p-8 space-y-2.5 animate-pulse">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-11 rounded-md bg-slate-200/70 dark:bg-slate-800/60" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">
              No symbols match your active X TSI filter combination
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try loosening one of the timeframe OSC or bar-count filters to view all tracked symbols.
            </p>
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-2 px-3.5 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-2 text-left font-medium w-9">#</th>
                  <th className="py-2.5 px-2 text-left font-medium min-w-[210px]">
                    <button type="button" onClick={() => handleSort('symbol')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer">
                      Symbol &amp; TradingView <SortIcon f="symbol" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-right font-medium">
                    <button type="button" onClick={() => handleSort('perChange')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      LTP / 1D % <SortIcon f="perChange" />
                    </button>
                  </th>
                  <th className="py-2.5 px-2 text-center font-medium">
                    <button type="button" onClick={() => handleSort('tsiStrength')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      TSI Strength <SortIcon f="tsiStrength" />
                    </button>
                  </th>
                  {TIMEFRAMES.map(({ tf, htf }) => (
                    <th key={tf} className="py-2.5 px-3 text-left font-medium min-w-[205px]">
                      <button
                        type="button"
                        onClick={() => handleSort(tf)}
                        className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap"
                      >
                        {tf} (HTF: {htf} X TSI) <SortIcon f={tf} />
                      </button>
                    </th>
                  ))}
                  <th className="py-2.5 pl-2 pr-4 text-right font-medium">
                    <button type="button" onClick={() => handleSort('minCtfBars')} className="hover:text-slate-900 dark:hover:text-white cursor-pointer whitespace-nowrap">
                      Min Bars <SortIcon f="minCtfBars" />
                    </button>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {filteredRows.map((row, idx) => (
                  <tr
                    key={row.symbol}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-2 font-mono text-slate-400 dark:text-slate-500 tabular-nums">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-2">
                      <SymbolLink
                        symbol={row.symbol}
                        name={row.name}
                        isFnO={row.isFnO}
                        isNifty50={row.isNifty50}
                        onSelect={onSelectSymbolForStrength}
                      />
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {row.ltp > 0 ? formatINR(row.ltp) : '—'}
                      </div>
                      <div
                        className={`text-[11px] font-medium ${
                          row.perChange >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(row.perChange)}
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono font-semibold border rounded-xs ${strengthBadgeClass(
                          row.tsiStrengthLabel
                        )}`}
                      >
                        <span>{row.tsiStrengthLabel}</span>
                        <span className="opacity-75">({row.tsiStrength})</span>
                      </span>
                    </td>

                    {TIMEFRAMES.map(({ tf, tvInterval }) => (
                      <td key={tf} className="py-2 px-3">
                        <XtsiCell
                          symbol={row.symbol}
                          signal={row.timeframes[tf]}
                          tvInterval={tvInterval}
                        />
                      </td>
                    ))}

                    <td className="py-2.5 pl-2 pr-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {row.minCtfBars < 999 ? (
                        <span
                          className={`font-semibold ${
                            row.hasFreshXtsi
                              ? 'text-amber-600 dark:text-amber-400'
                              : row.minCtfBars <= 5
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {row.minCtfBars}B
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function XtsiCell({
  symbol,
  signal,
  tvInterval,
}: {
  symbol: string;
  signal: XtsiTimeframeSignal;
  tvInterval: '5' | '60' | 'D';
}) {
  if (!signal || signal.unavailable) {
    return <span className="text-[11px] font-mono text-slate-400 dark:text-slate-600">N/A</span>;
  }

  const bull = signal.isBull;
  const bear = signal.isBear;
  const tvUrl = getTradingViewUrl(symbol, tvInterval);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 text-[10px] font-mono font-bold border rounded-xs whitespace-nowrap ${
              bull
                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : bear
                  ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30'
                  : 'bg-slate-500/10 text-slate-500 border-slate-500/20'
            }`}
          >
            {bull ? 'X TSI BULL' : bear ? 'X TSI BEAR' : 'WAIT'}
          </span>

          {/* Bar Count after X TSI Cross */}
          <span
            title={`${signal.ctfBarsSinceCross} ${signal.ctf} bars (${signal.htfBarsSinceCross} ${signal.htf} bars) since X TSI cross`}
            className={`font-mono text-[11px] font-semibold tabular-nums whitespace-nowrap ${
              signal.freshCross
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {signal.ctfBarsSinceCross}B
          </span>

          {signal.freshCross && (
            <span className="px-1 py-0.5 text-[9px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/35 rounded-xs">
              FRESH
            </span>
          )}
        </div>

        {/* Direct timeframe-locked TradingView chart verify link */}
        <a
          href={tvUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Verify ${symbol} ${signal.ctf} chart (HTF ${signal.htf} X TSI) on TradingView`}
          className="text-[10px] font-mono text-slate-400 hover:text-sky-500 inline-flex items-center gap-0.5 shrink-0"
        >
          <span>{signal.ctf}</span>
          <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {/* Normalized Oscillator & HTF Bar Count Line */}
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
        <span>
          OSC{' '}
          <strong
            className={
              signal.scaledTsi <= -25
                ? 'text-emerald-600 dark:text-emerald-400'
                : signal.scaledTsi >= 25
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
            }
          >
            {signal.scaledTsi >= 0 ? '+' : ''}
            {signal.scaledTsi.toFixed(1)}
          </strong>
          <span className="opacity-70"> / {signal.scaledTsiSig.toFixed(1)}</span>
        </span>

        <span className="flex items-center gap-1">
          <span>
            {signal.htf}:{signal.htfBarsSinceCross}b
          </span>
          {signal.isTb && (
            <span className="px-1 bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold rounded-xs">
              TB
            </span>
          )}
          {signal.isTs && (
            <span className="px-1 bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold rounded-xs">
              TS
            </span>
          )}
          {signal.isPxt && (
            <span className="px-1 bg-sky-500/20 text-sky-700 dark:text-sky-300 font-bold rounded-xs">
              PXT
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
