import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, RefreshCw, Search, Sun, X } from 'lucide-react';
import { QuickInspectorDrawer } from './components/QuickInspectorDrawer';
import { ScreenerView } from './components/ScreenerView';
import { SectorRotationView } from './components/SectorRotationView';
import { StrengthOverviewView } from './components/StrengthOverviewView';
import { SymbolLink } from './components/SymbolLink';
import type {
  DashboardPayload,
  ScreenerCategoryId,
  StockRecord,
  UniverseFilter,
} from './types/market';
import { SCREENER_BY_ID } from './utils/screenerMeta';

type MainTab = 'overview' | 'technical' | 'thematic' | 'sectors';

interface SearchResultItem {
  symbol: string;
  name: string;
  sector: string;
  isFnO: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<MainTab>('overview');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE');
  const [selectedStockDetail, setSelectedStockDetail] = useState<StockRecord | null>(null);
  const [loadingStock, setLoadingStock] = useState<boolean>(false);

  const [screenerCategory, setScreenerCategory] = useState<ScreenerCategoryId>('high_52w');
  const [thematicCategory, setThematicCategory] = useState<ScreenerCategoryId>('intraday_movers');
  const [universeFilter, setUniverseFilter] = useState<UniverseFilter>('all');
  const [inspectedStock, setInspectedStock] = useState<StockRecord | null>(null);

  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [darkMode, setDarkMode] = useState<boolean>(true);

  // Global live NSE search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searching, setSearching] = useState<boolean>(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  const fetchDashboard = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      const res = await fetch(`/api/dashboard${force ? '?refresh=1' : ''}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: DashboardPayload = await res.json();
      setDashboard(data);
      setError(null);
      return data;
    } catch (err: any) {
      setError(err?.message || 'Unable to load live NSE data.');
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchStockDetail = useCallback(async (symbol: string) => {
    setLoadingStock(true);
    try {
      const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}`);
      if (!res.ok) return;
      const detail: StockRecord = await res.json();
      setSelectedStockDetail(detail);
    } catch {
      // Fall back to dashboard record if detail fetch transiently fails
    } finally {
      setLoadingStock(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchDashboard(false);
  }, [fetchDashboard]);

  // If background Bhavcopy enrichment is still populating on initial load, poll once shortly after
  useEffect(() => {
    if (!dashboard || dashboard.enrichmentComplete) return;
    const timer = setTimeout(() => {
      fetchDashboard(false);
    }, 4500);
    return () => clearTimeout(timer);
  }, [dashboard, fetchDashboard]);

  // Real-time 60s auto-refresh matching CM Market Live cadence
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchDashboard(true);
      if (selectedSymbol) {
        fetchStockDetail(selectedSymbol);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchDashboard, fetchStockDetail, selectedSymbol]);

  // Load deep history & ratios whenever selectedSymbol changes
  useEffect(() => {
    if (!selectedSymbol) return;
    const cachedFromDash = dashboard?.stocks.find((s) => s.symbol === selectedSymbol);
    if (cachedFromDash && (!selectedStockDetail || selectedStockDetail.symbol !== selectedSymbol)) {
      setSelectedStockDetail(cachedFromDash);
    }
    fetchStockDetail(selectedSymbol);
  }, [selectedSymbol, fetchStockDetail]);

  // Global search debounce
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close search dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const handleSelectSymbolForDashboard = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    setActiveTab('overview');
    setSearchOpen(false);
    setSearchQuery('');
  }, []);

  const handleJumpToScreener = useCallback((categoryId: string) => {
    const def = SCREENER_BY_ID.get(categoryId as ScreenerCategoryId);
    if (def?.group === 'thematic') {
      setThematicCategory(def.id);
      setActiveTab('thematic');
    } else if (def) {
      setScreenerCategory(def.id);
      setActiveTab('technical');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleManualRefresh = () => {
    fetchDashboard(true);
    if (selectedSymbol) fetchStockDetail(selectedSymbol);
  };

  const activeSelectedStock: StockRecord | null =
    selectedStockDetail?.symbol === selectedSymbol
      ? selectedStockDetail
      : dashboard?.stocks.find((s) => s.symbol === selectedSymbol) ||
        dashboard?.stocks[0] ||
        null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-[#0B111B] dark:text-slate-100">
      {/* STRICT 3-ZONE TOP BAR CONTRACT */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0B111B]/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xs"
          >
            NiftyPulse
          </button>

          {/* Zone 2: 4 concise single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['overview', 'Strength & Movers'],
                ['technical', 'Technical Screener'],
                ['thematic', 'Thematic & Horizon'],
                ['sectors', 'Sector Rotation'],
              ] as const
            ).map(([id, label]) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-emerald-500 text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Syncing' : 'Refresh Live'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Strip (visible below md) */}
      <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 py-2 flex items-center gap-1.5 overflow-x-auto">
        {(
          [
            ['overview', 'Strength & Movers'],
            ['technical', 'Technical'],
            ['thematic', 'Thematic'],
            ['sectors', 'Sectors'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === id
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* WORKSPACE UTILITY TOOLBAR (Search 3,500+ NSE stocks, Universe Filter, Theme Switch) */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]/70">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Global Search across all 3,500+ NSE Equities */}
          <div ref={searchBoxRef} className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              placeholder="Search any NSE symbol (RELIANCE, HAL, SUZLON, 3,500+ stocks)..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 dark:bg-[#111827] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {searchOpen && searchQuery.trim().length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {searching ? (
                  <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
                    Searching NSE Bhavcopy &amp; F&amp;O directory...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 dark:text-slate-400">
                    No NSE symbol found for &ldquo;{searchQuery}&rdquo;.
                  </div>
                ) : (
                  searchResults.map((item) => (
                    <div
                      key={item.symbol}
                      onClick={() => handleSelectSymbolForDashboard(item.symbol)}
                      className="px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 cursor-pointer flex items-center justify-between gap-2"
                    >
                      <SymbolLink
                        symbol={item.symbol}
                        name={item.name}
                        isFnO={item.isFnO}
                        onSelect={handleSelectSymbolForDashboard}
                      />
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                        {item.sector}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Universe Filter */}
            <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800/90 rounded-md">
              {(
                [
                  ['all', 'All NSE'],
                  ['fno', 'Nifty F&O'],
                  ['nifty50', 'Nifty 50'],
                  ['nifty500', 'Nifty 500'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setUniverseFilter(id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    universeFilter === id
                      ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Auto-Refresh 60s Toggle */}
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                autoRefresh
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
              }`}
              title="Toggle automatic 60-second CM Market Live polling"
            >
              Auto-Sync: {autoRefresh ? 'On (60s)' : 'Off'}
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
              className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-5 p-4 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300 flex items-center justify-between gap-4 text-xs">
            <span>{error}</span>
            <button
              type="button"
              onClick={handleManualRefresh}
              className="px-3 py-1.5 rounded-md bg-rose-600 text-white font-medium hover:bg-rose-700 cursor-pointer shrink-0"
            >
              Retry Feed
            </button>
          </div>
        )}

        {loading || !dashboard ? (
          <LoadingSkeleton />
        ) : (
          <>
            {/* Quiet Feed Metadata Line */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span>NSE Feed: {dashboard.nseTimestamp}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {dashboard.totalUniverse} Nifty F&amp;O &amp; 500 stocks tracked ({dashboard.enrichedCount} with 3M Bhavcopy technicals)
                </span>
              </div>
              <span>Click any TV link next to a symbol for TradingView charts</span>
            </div>

            {activeTab === 'overview' && (
              <StrengthOverviewView
                dashboard={dashboard}
                selectedStock={activeSelectedStock}
                loadingStock={loadingStock}
                onSelectSymbol={(sym) => setSelectedSymbol(sym)}
                onJumpToScreener={handleJumpToScreener}
              />
            )}

            {activeTab === 'technical' && (
              <ScreenerView
                mode="technical"
                stocks={dashboard.stocks}
                categoryCounts={dashboard.categoryCounts}
                activeCategory={screenerCategory}
                onCategoryChange={setScreenerCategory}
                universeFilter={universeFilter}
                onInspectStock={(s) => setInspectedStock(s)}
              />
            )}

            {activeTab === 'thematic' && (
              <ScreenerView
                mode="thematic"
                stocks={dashboard.stocks}
                categoryCounts={dashboard.categoryCounts}
                activeCategory={thematicCategory}
                onCategoryChange={setThematicCategory}
                universeFilter={universeFilter}
                onInspectStock={(s) => setInspectedStock(s)}
              />
            )}

            {activeTab === 'sectors' && (
              <SectorRotationView
                sectors={dashboard.sectors}
                stocks={dashboard.stocks}
                onInspectStock={(s) => setInspectedStock(s)}
              />
            )}
          </>
        )}
      </main>

      {/* Slide-Over Quick Strength Inspector for Screener & Sector tables */}
      <QuickInspectorDrawer
        stock={inspectedStock}
        onClose={() => setInspectedStock(null)}
        onOpenFullDashboard={handleSelectSymbolForDashboard}
      />

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 mt-10 py-5 px-4 sm:px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            Data powered by official NSE Bhavcopy EOD &amp; CM Market Live feeds · Charts via TradingView.
          </div>
          <div>
            For educational and market research purposes only. Not investment advice.
          </div>
        </div>
      </footer>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-200/70 dark:bg-slate-800/60" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 h-[440px] rounded-lg bg-slate-200/70 dark:bg-slate-800/60" />
        <div className="lg:col-span-7 h-[440px] rounded-lg bg-slate-200/70 dark:bg-slate-800/60" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-slate-200/70 dark:bg-slate-800/60" />
        ))}
      </div>
    </div>
  );
}
