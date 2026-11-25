import type {
  DashboardPayload,
  IndexQuote,
  MarketBreadth,
  OhlcPoint,
  ScreenerCategoryId,
  SectorRotationItem,
  StockRecord,
} from '../src/types/market.ts';
import { nseMcp, sanitizeSymbol } from './nseMcp.ts';
import {
  computeTechnicalIndicators,
  computeWeightedStrength,
  evaluateScreenerSignals,
} from './technicals.ts';
import {
  FNO_WATCHLIST_SET,
  PERSONAL_WATCHLIST_143,
  PERSONAL_WATCHLIST_SET,
} from '../src/data/watchlists.ts';
import {
  DEFAULT_BENCHMARK,
  SECTOR_BENCHMARKS,
  UNIVERSE,
  UNIVERSE_BY_SYMBOL,
  getSectorBenchmark,
} from './universe.ts';
import {
  fetchYahooNseIndices,
  fetchYahooNseStock,
} from './yahooFallback.ts';

interface CachedHistory {
  history: OhlcPoint[];
  sma200: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  multiYearHigh: number;
  avgVolume30d: number;
  fetchedAt: number;
}

interface LiveQuoteSnapshot {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  perChange: number;
  perChange30d: number;
  volume: number;
  turnoverCr: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  latestTimestamp: string;
  corporateAction?: string;
}

const HISTORY_TTL_MS = 20 * 60 * 1000; // 20 minutes (Bhavcopy EOD updates daily)
const LIVE_TTL_MS = 55 * 1000; // 55 seconds (CMMKT refreshes every 1 min)

const historyCache = new Map<string, CachedHistory>();
const lastKnownSnapshots = new Map<string, LiveQuoteSnapshot>();
let lastDashboard: DashboardPayload | null = null;
let lastLiveFetchAt = 0;
let liveRefreshPromise: Promise<DashboardPayload> | null = null;
let enrichmentRunning = false;
let enrichmentCompletedOnce = false;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function parseCrValue(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/,/g, '').replace(/Cr/i, '').trim();
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseTradeQty(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const s = val.replace(/,/g, '').trim().toUpperCase();
    const num = parseFloat(s);
    if (!Number.isFinite(num)) return 0;
    if (s.endsWith('L')) return Math.round(num * 100000);
    if (s.endsWith('CR')) return Math.round(num * 10000000);
    if (s.endsWith('K')) return Math.round(num * 1000);
    return Math.round(num);
  }
  return 0;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const current = items[idx++];
      try {
        await worker(current);
      } catch {
        // Ignore individual symbol fetch failures so batch finishes cleanly
      }
    }
  });
  await Promise.all(runners);
}

async function fetchSymbolHistory(symbol: string): Promise<CachedHistory | null> {
  const existing = historyCache.get(symbol);
  if (existing && Date.now() - existing.fetchedAt < HISTORY_TTL_MS) {
    return existing;
  }

  try {
    const [histRes, ma200Res, hi52Res] = await Promise.all([
      nseMcp.getStockHistory(symbol, 3, 'today').catch(() => null),
      nseMcp.getMovingAverage(symbol, 200).catch(() => null),
      nseMcp.get52WeekHighLow(symbol).catch(() => null),
    ]);

    const rawData = Array.isArray(histRes?.data) ? histRes.data : [];
    const history: OhlcPoint[] = rawData
      .map((row: any, i: number) => ({
        date: String(row.date || row.tradeDate || row.timestamp || `D-${rawData.length - i}`),
        open: parseNumber(row.open),
        high: parseNumber(row.high),
        low: parseNumber(row.low),
        close: parseNumber(row.close || row.ltp),
        volume: parseNumber(row.volume),
      }))
      .filter((p) => p.close > 0);

    let sma200 = 0;
    if (typeof ma200Res === 'number') {
      sma200 = ma200Res;
    } else if (ma200Res && typeof ma200Res === 'object') {
      sma200 = parseNumber((ma200Res as any).moving_average ?? (ma200Res as any).value ?? (ma200Res as any).sma);
    }

    const periodHigh = parseNumber(histRes?.summary?.period_high);
    const fiftyTwoWeekHigh = parseNumber(hi52Res?.['52w_high'], periodHigh);
    const fiftyTwoWeekLow = parseNumber(hi52Res?.['52w_low'], parseNumber(histRes?.summary?.period_low));
    const avgVolume30d = parseNumber(histRes?.summary?.avg_daily_vol);

    if (history.length >= 5) {
      const entry: CachedHistory = {
        history,
        sma200,
        fiftyTwoWeekHigh,
        fiftyTwoWeekLow,
        multiYearHigh: Math.max(fiftyTwoWeekHigh, periodHigh),
        avgVolume30d,
        fetchedAt: Date.now(),
      };
      historyCache.set(symbol, entry);
      return entry;
    }

    // Fallback to Yahoo Finance 1-year daily OHLCV if NSE Bhavcopy MCP returned 403/empty
    const yf = await fetchYahooNseStock(symbol).catch(() => null);
    if (yf && yf.history.length >= 5) {
      const entry: CachedHistory = {
        history: yf.history,
        sma200: yf.sma200,
        fiftyTwoWeekHigh: yf.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: yf.fiftyTwoWeekLow,
        multiYearHigh: yf.fiftyTwoWeekHigh,
        avgVolume30d: yf.avgVolume30d,
        fetchedAt: Date.now(),
      };
      historyCache.set(symbol, entry);
      return entry;
    }
    return null;
  } catch {
    return null;
  }
}

function triggerBackgroundEnrichment(symbols: string[]) {
  if (enrichmentRunning) return;
  const stale = symbols.filter((s) => {
    const c = historyCache.get(s);
    return !c || Date.now() - c.fetchedAt >= HISTORY_TTL_MS;
  });
  if (!stale.length) {
    enrichmentCompletedOnce = true;
    return;
  }

  enrichmentRunning = true;
  runWithConcurrency(stale, 10, async (sym) => {
    await fetchSymbolHistory(sym);
  })
    .then(() => {
      enrichmentCompletedOnce = true;
      // Force next read to rebuild with freshly enriched histories
      lastLiveFetchAt = 0;
    })
    .finally(() => {
      enrichmentRunning = false;
    });
}

function buildStockRecord(
  symbol: string,
  live: LiveQuoteSnapshot,
  hist: CachedHistory | null,
  sectorReturns: Map<string, { d1: number; m1: number }>
): StockRecord {
  const meta = UNIVERSE_BY_SYMBOL.get(symbol);
  const sector = meta?.sector || 'Broad Market';
  const benchmark = meta ? getSectorBenchmark(sector) : DEFAULT_BENCHMARK;
  const fundamentals = meta?.fundamentals || {
    pe: benchmark.pe,
    pb: benchmark.pb,
    roe: benchmark.roe,
    debtToEquity: benchmark.debtToEquity,
    revenueGrowth3Y: benchmark.revenueGrowth3Y,
    profitMargin: benchmark.profitMargin,
    divYield: benchmark.divYield,
    marketCapCr: Math.max(500, Math.round(live.turnoverCr * 120)),
  };

  const fiftyTwoWeekHigh = Math.max(
    live.fiftyTwoWeekHigh,
    hist?.fiftyTwoWeekHigh || 0,
    live.high,
    live.ltp
  );
  const lowCandidates = [live.fiftyTwoWeekLow, hist?.fiftyTwoWeekLow || 0, live.low, live.ltp].filter(
    (v) => v > 0
  );
  const fiftyTwoWeekLow = lowCandidates.length ? Math.min(...lowCandidates) : live.ltp;
  const multiYearHigh = Math.max(fiftyTwoWeekHigh, hist?.multiYearHigh || 0);

  const history = hist?.history || [];
  let perChange30d = live.perChange30d;
  if (perChange30d === 0 && history.length >= 20) {
    const refClose = history[Math.max(0, history.length - 22)].close;
    if (refClose > 0) {
      perChange30d = round2(((live.ltp - refClose) / refClose) * 100);
    }
  }

  const technicals = computeTechnicalIndicators({
    ltp: live.ltp,
    open: live.open,
    high: live.high,
    low: live.low,
    prevClose: live.prevClose,
    volume: live.volume,
    perChange30d,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    history,
    sma200External: hist?.sma200,
    avgVolume30dExternal: hist?.avgVolume30d,
  });

  const secRet = sectorReturns.get(benchmark.nseIndexName.toUpperCase()) || { d1: 0, m1: 0 };

  const signals = evaluateScreenerSignals({
    ltp: live.ltp,
    perChange: live.perChange,
    perChange30d,
    turnoverCr: live.turnoverCr,
    multiYearHigh,
    capTier: meta?.capTier || (live.ltp <= 100 ? 'Small Cap' : 'Mid Cap'),
    isFnO: meta?.isFnO || false,
    technicals,
    fundamentals,
  });

  const strength = computeWeightedStrength({
    ltp: live.ltp,
    perChange: live.perChange,
    perChange30d,
    technicals,
    fundamentals,
    benchmark,
    sectorReturn1D: secRet.d1,
    sectorReturn1M: secRet.m1,
    signals,
  });

  // CoinGecko-style 20-point sparkline from Bhavcopy history + live LTP
  const sparkRaw = history.slice(-20).map((p) => p.close);
  if (live.ltp > 0) {
    if (!sparkRaw.length) {
      sparkRaw.push(live.prevClose || live.open || live.ltp, live.low || live.ltp, live.high || live.ltp, live.ltp);
    } else {
      sparkRaw.push(live.ltp);
    }
  }

  return {
    symbol,
    name: meta?.name || symbol,
    sector,
    capTier: meta?.capTier || (fundamentals.marketCapCr >= 75000 ? 'Large Cap' : fundamentals.marketCapCr >= 18000 ? 'Mid Cap' : 'Small Cap'),
    isFnO: Boolean(meta?.isFnO) || FNO_WATCHLIST_SET.has(symbol),
    isPersonal: PERSONAL_WATCHLIST_SET.has(symbol),
    isNifty50: meta?.isNifty50 || false,
    isNifty500: meta?.isNifty500 ?? true,
    ltp: round2(live.ltp),
    open: round2(live.open),
    high: round2(live.high),
    low: round2(live.low),
    prevClose: round2(live.prevClose),
    change: round2(live.change),
    perChange: round2(live.perChange),
    perChange30d: round2(perChange30d),
    volume: Math.round(live.volume),
    turnoverCr: round2(live.turnoverCr),
    fiftyTwoWeekHigh: round2(fiftyTwoWeekHigh),
    fiftyTwoWeekLow: round2(fiftyTwoWeekLow),
    multiYearHigh: round2(multiYearHigh),
    latestTimestamp: live.latestTimestamp,
    technicals,
    fundamentals,
    benchmark,
    signals,
    strength,
    sparkline: sparkRaw,
    sectorReturn1D: round2(secRet.d1),
    sectorReturn1M: round2(secRet.m1),
    corporateAction: live.corporateAction,
  };
}

function extractGainersLosersMap(payload: any): Map<string, LiveQuoteSnapshot> {
  const map = new Map<string, LiveQuoteSnapshot>();
  const dataObj = payload?.data;
  if (!dataObj || typeof dataObj !== 'object') return map;
  const groups = ['NIFTY', 'FOSec', 'NIFTYNEXT50', 'BANKNIFTY', 'allSec', 'SecGtr20'];
  for (const g of groups) {
    const arr = dataObj?.[g]?.data;
    if (!Array.isArray(arr)) continue;
    for (const item of arr) {
      const sym = sanitizeSymbol(item?.symbol);
      if (!sym || map.has(sym)) continue;
      const ltp = parseNumber(item.ltp);
      const prev = parseNumber(item.prev_price, ltp);
      const perChange = parseNumber(item.perChange, prev > 0 ? ((ltp - prev) / prev) * 100 : 0);
      const nearWkh = parseNumber(item.nearWKH, 10);
      const nearWkl = parseNumber(item.nearWKL, -10);
      const est52H = nearWkh < 99 ? ltp / (1 - nearWkh / 100) : ltp;
      const est52L = nearWkl > -99 ? ltp / (1 - nearWkl / 100) : ltp;
      map.set(sym, {
        symbol: sym,
        ltp,
        open: parseNumber(item.open_price, ltp),
        high: parseNumber(item.high_price, ltp),
        low: parseNumber(item.low_price, ltp),
        prevClose: prev,
        change: round2(ltp - prev),
        perChange: round2(perChange),
        perChange30d: 0,
        volume: parseTradeQty(item.trade_quantity),
        turnoverCr: parseCrValue(item.turnover),
        fiftyTwoWeekHigh: round2(Math.max(est52H, ltp)),
        fiftyTwoWeekLow: round2(Math.min(est52L > 0 ? est52L : ltp, ltp)),
        latestTimestamp: payload?.updatedAt || new Date().toISOString(),
        corporateAction: item.ca_purpose && item.ca_purpose !== '-' ? String(item.ca_purpose) : undefined,
      });
    }
  }
  return map;
}

export async function getDashboardData(forceRefresh = false): Promise<DashboardPayload> {
  if (!forceRefresh && lastDashboard && Date.now() - lastLiveFetchAt < LIVE_TTL_MS) {
    return lastDashboard;
  }

  if (liveRefreshPromise) {
    return liveRefreshPromise;
  }

  liveRefreshPromise = (async () => {
    const personalEquities = PERSONAL_WATCHLIST_143.map((s) =>
      s === 'BAJAJ_AUTO' ? 'BAJAJ-AUTO' : s === 'NAM_INDIA' ? 'NAM-INDIA' : s
    ).filter((s) => !s.endsWith('1!') && !['NIFTY', 'BANKNIFTY', 'CNXFINANCE', 'NIFTY_MID_SELECT'].includes(s));
    const allUniverseSymbols = Array.from(
      new Set<string>([...UNIVERSE.map((u) => u.symbol), ...personalEquities])
    );

    // Chunk universe into 50-symbol groups for get_bulk_quote
    const chunks: string[][] = [];
    for (let i = 0; i < allUniverseSymbols.length; i += 50) {
      chunks.push(allUniverseSymbols.slice(i, i + 50));
    }

    const [
      liveIndicesRes,
      breadthRes,
      gainersRes,
      losersRes,
      eq500Res,
      idx1WRes,
      idx1MRes,
      idx3MRes,
      ...bulkResults
    ] = await Promise.all([
      nseMcp.getLiveIndices().catch(() => null),
      nseMcp.getMarketBreadth('today').catch(() => null),
      nseMcp.getLiveMarketData('gainers').catch(() => null),
      nseMcp.getLiveMarketData('loosers').catch(() => null),
      nseMcp.getEquityStocks(500, '').catch(() => null),
      nseMcp.getIndexMovers('1W', 50).catch(() => null),
      nseMcp.getIndexMovers('1M', 50).catch(() => null),
      nseMcp.getIndexMovers('3M', 50).catch(() => null),
      ...chunks.map((c) => nseMcp.getBulkQuote(c).catch(() => null)),
    ]);

    // 1. Parse all live indices
    const indexMap = new Map<string, IndexQuote>();
    const rawGroups = liveIndicesRes?.indices || {};
    for (const [group, arr] of Object.entries(rawGroups)) {
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const key = String(item.indexName || '').toUpperCase().trim();
        if (!key) continue;
        indexMap.set(key, {
          indexName: item.indexName,
          group,
          last: parseNumber(item.last),
          previousClose: parseNumber(item.previousClose),
          change: parseNumber(item.change),
          percChange: parseNumber(item.percChange),
          open: parseNumber(item.open),
          high: parseNumber(item.high),
          low: parseNumber(item.low),
          timeVal: item.timeVal || '',
        });
      }
    }

    // Parse 1W, 1M, 3M index movers
    const extractReturnMap = (res: any) => {
      const m = new Map<string, number>();
      for (const list of [res?.gainers, res?.losers]) {
        if (!Array.isArray(list)) continue;
        for (const row of list) {
          const k = String(row.index || '').toUpperCase().trim();
          if (k) m.set(k, parseNumber(row.return_pct));
        }
      }
      return m;
    };
    const ret1W = extractReturnMap(idx1WRes);
    const ret1M = extractReturnMap(idx1MRes);
    const ret3M = extractReturnMap(idx3MRes);

    // Seamless hybrid fallback: if NSE MCP indices returned 403/empty, hydrate live NSE indices from Yahoo Finance v8
    if (indexMap.size < 5) {
      const yfIndices = await fetchYahooNseIndices().catch(() => new Map());
      for (const [k, snap] of yfIndices.entries()) {
        if (!indexMap.has(k)) indexMap.set(k, snap.quote);
        if (!ret1W.has(k)) ret1W.set(k, snap.return1W);
        if (!ret1M.has(k)) ret1M.set(k, snap.return1M);
        if (!ret3M.has(k)) ret3M.set(k, snap.return3M);
      }
    }

    const sectorReturns = new Map<string, { d1: number; m1: number }>();
    for (const [key, q] of indexMap.entries()) {
      sectorReturns.set(key, {
        d1: q.percChange,
        m1: ret1M.get(key) ?? q.percChange * 3,
      });
    }

    // 2. Merge live stock quotes from CMMKT equity watch + gainers/losers + Bhavcopy bulk quotes
    // Seed from lastKnownSnapshots so transient MCP hiccups NEVER cause symbols to vanish
    const liveSnapshots = new Map<string, LiveQuoteSnapshot>(lastKnownSnapshots);

    // First populate from bulk quotes (covers our entire 155-symbol Nifty F&O + Nifty 500 universe!)
    for (const bRes of bulkResults) {
      const quotes = bRes?.quotes;
      if (!Array.isArray(quotes)) continue;
      for (const q of quotes) {
        const sym = sanitizeSymbol(q.symbol);
        if (!sym) continue;
        const ltp = parseNumber(q.close);
        const prev = parseNumber(q.prev_close, ltp);
        const vol = parseNumber(q.volume);
        liveSnapshots.set(sym, {
          symbol: sym,
          ltp,
          open: parseNumber(q.open, ltp),
          high: parseNumber(q.high, ltp),
          low: parseNumber(q.low, ltp),
          prevClose: prev,
          change: round2(ltp - prev),
          perChange: round2(parseNumber(q.pct_change, prev > 0 ? ((ltp - prev) / prev) * 100 : 0)),
          perChange30d: 0,
          volume: vol,
          turnoverCr: round2((vol * ltp) / 1e7),
          fiftyTwoWeekHigh: ltp,
          fiftyTwoWeekLow: ltp,
          latestTimestamp: q.date || '',
        });
      }
    }

    // Overlay fresher intraday CMMKT equity stocks (includes 52W High/Low + 30D % change!)
    if (Array.isArray(eq500Res?.stocks)) {
      for (const s of eq500Res.stocks) {
        const sym = sanitizeSymbol(s.symbol);
        if (!sym) continue;
        if (UNIVERSE_BY_SYMBOL.has(sym) || liveSnapshots.has(sym)) {
          liveSnapshots.set(sym, {
            symbol: sym,
            ltp: parseNumber(s.lastTradedPrice),
            open: parseNumber(s.openPrice),
            high: parseNumber(s.highPrice),
            low: parseNumber(s.lowPrice),
            prevClose: parseNumber(s.preClosePrice),
            change: parseNumber(s.change),
            perChange: parseNumber(s.perChange),
            perChange30d: parseNumber(s.perChange30d),
            volume: parseNumber(s.volume),
            turnoverCr: parseNumber(s.value),
            fiftyTwoWeekHigh: parseNumber(s.fiftyTwoWeekHigh),
            fiftyTwoWeekLow: parseNumber(s.fiftyTwoWeekLow),
            latestTimestamp: s.latestTimestamp || '',
          });
        }
      }
    }

    // Overlay live gainers & losers (ensures intraday top movers have freshest prices & CA notes)
    const liveGainersMap = extractGainersLosersMap(gainersRes);
    const liveLosersMap = extractGainersLosersMap(losersRes);
    for (const [sym, snap] of [...liveGainersMap.entries(), ...liveLosersMap.entries()]) {
      const existing = liveSnapshots.get(sym);
      if (existing) {
        liveSnapshots.set(sym, {
          ...existing,
          ltp: snap.ltp || existing.ltp,
          open: snap.open || existing.open,
          high: Math.max(snap.high, existing.high),
          low: existing.low > 0 ? Math.min(snap.low || existing.low, existing.low) : snap.low,
          prevClose: snap.prevClose || existing.prevClose,
          change: snap.change,
          perChange: snap.perChange,
          volume: Math.max(snap.volume, existing.volume),
          turnoverCr: Math.max(snap.turnoverCr, existing.turnoverCr),
          fiftyTwoWeekHigh: Math.max(snap.fiftyTwoWeekHigh, existing.fiftyTwoWeekHigh),
          fiftyTwoWeekLow:
            existing.fiftyTwoWeekLow > 0 && snap.fiftyTwoWeekLow > 0
              ? Math.min(snap.fiftyTwoWeekLow, existing.fiftyTwoWeekLow)
              : snap.fiftyTwoWeekLow || existing.fiftyTwoWeekLow,
          corporateAction: snap.corporateAction || existing.corporateAction,
        });
      } else if (UNIVERSE_BY_SYMBOL.has(sym) || snap.turnoverCr >= 25) {
        liveSnapshots.set(sym, snap);
      }
    }

    // Seamless hybrid fallback: if NSE MCP returned 403/empty for universe symbols, hydrate directly from Yahoo Finance v8
    const missingUniverse = allUniverseSymbols.filter((sym) => !liveSnapshots.has(sym));
    if (missingUniverse.length > 0) {
      await runWithConcurrency(missingUniverse, 12, async (sym) => {
        const yf = await fetchYahooNseStock(sym).catch(() => null);
        if (!yf) return;
        liveSnapshots.set(sym, {
          symbol: sym,
          ltp: yf.ltp,
          open: yf.open,
          high: yf.high,
          low: yf.low,
          prevClose: yf.prevClose,
          change: yf.change,
          perChange: yf.perChange,
          perChange30d: yf.perChange30d,
          volume: yf.volume,
          turnoverCr: yf.turnoverCr,
          fiftyTwoWeekHigh: yf.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: yf.fiftyTwoWeekLow,
          latestTimestamp: yf.latestTimestamp,
        });
        historyCache.set(sym, {
          history: yf.history,
          sma200: yf.sma200,
          fiftyTwoWeekHigh: yf.fiftyTwoWeekHigh,
          fiftyTwoWeekLow: yf.fiftyTwoWeekLow,
          multiYearHigh: yf.fiftyTwoWeekHigh,
          avgVolume30d: yf.avgVolume30d,
          fetchedAt: Date.now(),
        });
      });
    }

    // 3. Kick off background historical Bhavcopy enrichment (non-blocking if first run, instant once cached)
    const activeSymbols = Array.from(liveSnapshots.keys());
    triggerBackgroundEnrichment(activeSymbols);

    // If very first request and zero histories cached yet, eagerly warm the top 30 flagship symbols
    if (historyCache.size < 15) {
      const priority = activeSymbols.slice(0, 30);
      await runWithConcurrency(priority, 8, async (sym) => {
        await fetchSymbolHistory(sym);
      });
    }

    // Persist all valid snapshots into lastKnownSnapshots
    for (const [sym, snap] of liveSnapshots.entries()) {
      if (snap.ltp > 0) {
        lastKnownSnapshots.set(sym, snap);
      }
    }

    // 4. Compute full StockRecords with technicals, signals, and weighted strength
    const stocks: StockRecord[] = [];
    for (const [sym, snap] of liveSnapshots.entries()) {
      if (snap.ltp <= 0) continue;
      const hist = historyCache.get(sym) || null;
      stocks.push(buildStockRecord(sym, snap, hist, sectorReturns));
    }

    // Guard: never overwrite a populated dashboard with an empty or severely degraded transient response
    if (lastDashboard && stocks.length < Math.max(20, Math.floor(lastDashboard.stocks.length * 0.5))) {
      console.warn(
        `[MarketService] Skipped degraded refresh (${stocks.length} stocks vs ${lastDashboard.stocks.length} cached)`
      );
      return lastDashboard;
    }

    // Sort main screener list by weighted strength descending
    stocks.sort((a, b) => b.strength.overall - a.strength.overall || b.perChange - a.perChange);

    // Top 20 Bullish & Top 20 Bearish for the current trading day
    const topBullish = [...stocks]
      .sort((a, b) => {
        // Blend live intraday gain momentum + weighted overall strength
        const scoreA = a.perChange * 8 + a.strength.overall * 0.45;
        const scoreB = b.perChange * 8 + b.strength.overall * 0.45;
        return scoreB - scoreA;
      })
      .slice(0, 20);

    const topBearish = [...stocks]
      .sort((a, b) => {
        // Blend live intraday decline + weighted weakness
        const scoreA = a.perChange * 8 - (100 - a.strength.overall) * 0.45;
        const scoreB = b.perChange * 8 - (100 - b.strength.overall) * 0.45;
        return scoreA - scoreB;
      })
      .slice(0, 20);

    // 5. Build Sectoral Rotation matrix
    const nifty50Quote = indexMap.get('NIFTY 50') || null;
    const nifty1M = ret1M.get('NIFTY 50') ?? 0;

    const sectors: SectorRotationItem[] = Object.values(SECTOR_BENCHMARKS).map((bm) => {
      const idxKey = bm.nseIndexName.toUpperCase();
      const q = indexMap.get(idxKey);
      const r1D = q?.percChange ?? 0;
      const r1W = ret1W.get(idxKey) ?? round2(r1D * 1.8);
      const r1M = ret1M.get(idxKey) ?? round2(r1D * 3.2);
      const r3M = ret3M.get(idxKey) ?? round2(r1M * 1.6);
      const rsVsNifty = round2(r1M - nifty1M);

      let quadrant: SectorRotationItem['quadrant'] = 'Lagging';
      if (rsVsNifty >= 0 && r1W >= 0) quadrant = 'Leading';
      else if (rsVsNifty < 0 && r1W >= 0) quadrant = 'Improving';
      else if (rsVsNifty >= 0 && r1W < 0) quadrant = 'Weakening';
      else quadrant = 'Lagging';

      const sectorStocks = stocks.filter((s) => s.sector === bm.sector);
      const advancingCount = sectorStocks.filter((s) => s.perChange > 0).length;
      const decliningCount = sectorStocks.filter((s) => s.perChange < 0).length;
      const topSymbols = [...sectorStocks]
        .sort((a, b) => b.strength.overall - a.strength.overall)
        .slice(0, 4)
        .map((s) => ({ symbol: s.symbol, perChange: s.perChange, strength: s.strength.overall }));

      return {
        sector: bm.sector,
        indexName: bm.nseIndexName,
        last: q?.last ?? 0,
        change1D: round2(r1D),
        return1W: round2(r1W),
        return1M: round2(r1M),
        return3M: round2(r3M),
        relativeStrengthVsNifty: rsVsNifty,
        quadrant,
        advancingCount,
        decliningCount,
        topSymbols,
      };
    });

    sectors.sort((a, b) => b.return1M - a.return1M);

    // 6. Category counts
    const categoryCounts: Record<ScreenerCategoryId, number> = {
      all: stocks.length,
      high_52w: 0,
      ath: 0,
      volume_shockers: 0,
      golden_cross: 0,
      death_cross: 0,
      rsi_oversold: 0,
      rsi_overbought: 0,
      macd_bullish: 0,
      bollinger_squeeze: 0,
      dma200_bounce: 0,
      intraday_movers: 0,
      swing_picks: 0,
      penny_fundamentals: 0,
      multibagger: 0,
    };

    for (const s of stocks) {
      for (const sig of s.signals) {
        categoryCounts[sig.id] = (categoryCounts[sig.id] || 0) + 1;
      }
    }

    const advCount = stocks.filter((s) => s.perChange > 0).length;
    const decCount = stocks.filter((s) => s.perChange < 0).length;
    const unchCount = Math.max(0, stocks.length - advCount - decCount);
    const totalVol = stocks.reduce((acc, s) => acc + s.volume, 0);

    const breadth: MarketBreadth | null = breadthRes
      ? {
          date: breadthRes.date,
          totalStocks: parseNumber(breadthRes.total_stocks),
          advances: parseNumber(breadthRes.advances),
          declines: parseNumber(breadthRes.declines),
          unchanged: parseNumber(breadthRes.unchanged),
          adRatio: parseNumber(breadthRes.ad_ratio),
          totalVolume: parseNumber(breadthRes.total_volume),
        }
      : stocks.length > 0
        ? {
            date: stocks[0]?.latestTimestamp || new Date().toISOString().slice(0, 10),
            totalStocks: stocks.length,
            advances: advCount,
            declines: decCount,
            unchanged: unchCount,
            adRatio: decCount > 0 ? round2(advCount / decCount) : advCount,
            totalVolume: totalVol,
          }
        : null;

    const enrichedCount = stocks.filter((s) => historyCache.has(s.symbol)).length;
    const niftyTime = indexMap.get('NIFTY 50')?.timeVal;

    const payload: DashboardPayload = {
      updatedAt: new Date().toISOString(),
      nseTimestamp: liveIndicesRes?.nseTimestamp || niftyTime || breadthRes?.date || new Date().toISOString().slice(0, 10),
      enrichmentComplete: enrichmentCompletedOnce && enrichedCount >= Math.min(stocks.length, 80),
      enrichedCount,
      totalUniverse: stocks.length,
      indices: {
        nifty50: nifty50Quote,
        niftyBank: indexMap.get('NIFTY BANK') || null,
        nifty500: indexMap.get('NIFTY 500') || null,
        niftyMidcap: indexMap.get('NIFTY MIDCAP 100') || indexMap.get('NIFTY MIDCAP 50') || null,
        indiaVix: indexMap.get('INDIA VIX') || null,
      },
      breadth,
      topBullish,
      topBearish,
      stocks,
      sectors,
      categoryCounts,
    };

    if (stocks.length > 0) {
      lastDashboard = payload;
      lastLiveFetchAt = Date.now();
    }
    return payload;
  })().finally(() => {
    liveRefreshPromise = null;
  });

  return liveRefreshPromise;
}

export async function getStockDeepDetail(rawSymbol: string): Promise<StockRecord | null> {
  const symbol = sanitizeSymbol(rawSymbol);
  if (!symbol) return null;

  const dashboard = await getDashboardData(false);
  const sectorReturns = new Map<string, { d1: number; m1: number }>();
  for (const sec of dashboard.sectors) {
    sectorReturns.set(sec.indexName.toUpperCase(), { d1: sec.change1D, m1: sec.return1M });
  }

  // Fetch fresh live quote + full 3M history + 200 DMA + 52W range + 30D vol analysis in parallel
  const [liveQuoteRes, hist, volRes] = await Promise.all([
    nseMcp.getLiveStockQuote(symbol).catch(() => null),
    fetchSymbolHistory(symbol),
    nseMcp.getVolumeAnalysis(symbol, 30).catch(() => null),
  ]);

  const existing = dashboard.stocks.find((s) => s.symbol === symbol);
  const s = liveQuoteRes?.stock;

  // Seamless Yahoo Finance fallback for any of the 3,500+ NSE stocks if NSE MCP returned 403
  let yfFallback = null;
  if (!s && !existing && (!hist || !hist.history.length)) {
    yfFallback = await fetchYahooNseStock(symbol).catch(() => null);
    if (!yfFallback) return null;
  }

  const effectiveHist: CachedHistory | null =
    hist && hist.history.length > 0
      ? hist
      : yfFallback
        ? {
            history: yfFallback.history,
            sma200: yfFallback.sma200,
            fiftyTwoWeekHigh: yfFallback.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: yfFallback.fiftyTwoWeekLow,
            multiYearHigh: yfFallback.fiftyTwoWeekHigh,
            avgVolume30d: yfFallback.avgVolume30d,
            fetchedAt: Date.now(),
          }
        : null;

  const lastBar = effectiveHist?.history[effectiveHist.history.length - 1];
  const prevBar = effectiveHist?.history[Math.max(0, (effectiveHist?.history.length || 1) - 2)];

  const ltp = parseNumber(s?.lastTradedPrice, existing?.ltp || yfFallback?.ltp || lastBar?.close || 0);
  const prevClose = parseNumber(s?.preClosePrice, existing?.prevClose || yfFallback?.prevClose || prevBar?.close || ltp);
  const open = parseNumber(s?.openPrice, existing?.open || yfFallback?.open || lastBar?.open || ltp);
  const high = parseNumber(s?.highPrice, existing?.high || yfFallback?.high || lastBar?.high || ltp);
  const low = parseNumber(s?.lowPrice, existing?.low || yfFallback?.low || lastBar?.low || ltp);
  const volume = parseNumber(s?.volume, existing?.volume || yfFallback?.volume || lastBar?.volume || 0);
  const change = parseNumber(s?.change, round2(ltp - prevClose));
  const perChange = parseNumber(s?.perChange, prevClose > 0 ? round2(((ltp - prevClose) / prevClose) * 100) : 0);

  const liveSnap: LiveQuoteSnapshot = {
    symbol,
    ltp,
    open,
    high,
    low,
    prevClose,
    change,
    perChange,
    perChange30d: parseNumber(s?.perChange30d, existing?.perChange30d || yfFallback?.perChange30d || 0),
    volume,
    turnoverCr: parseNumber(s?.value, existing?.turnoverCr || yfFallback?.turnoverCr || round2((volume * ltp) / 1e7)),
    fiftyTwoWeekHigh: parseNumber(s?.fiftyTwoWeekHigh, Math.max(effectiveHist?.fiftyTwoWeekHigh || 0, existing?.fiftyTwoWeekHigh || 0, ltp)),
    fiftyTwoWeekLow: parseNumber(s?.fiftyTwoWeekLow, effectiveHist?.fiftyTwoWeekLow || existing?.fiftyTwoWeekLow || ltp),
    latestTimestamp: s?.latestTimestamp || existing?.latestTimestamp || yfFallback?.latestTimestamp || new Date().toISOString().slice(0, 10),
    corporateAction: existing?.corporateAction,
  };

  const enrichedHist: CachedHistory | null = effectiveHist
    ? {
        ...effectiveHist,
        avgVolume30d: parseNumber(volRes?.avg_volume, effectiveHist.avgVolume30d),
      }
    : null;

  const record = buildStockRecord(symbol, liveSnap, enrichedHist, sectorReturns);
  record.history = enrichedHist?.history || [];
  return record;
}

export async function searchNseSymbols(rawQuery: string): Promise<Array<{ symbol: string; name: string; sector: string; isFnO: boolean }>> {
  const q = String(rawQuery || '').trim().toUpperCase();
  if (!q || q.length > 30) return [];

  // Instant matches from our universe
  const localMatches = UNIVERSE.filter(
    (u) => u.symbol.includes(q) || u.name.toUpperCase().includes(q) || u.sector.toUpperCase().includes(q)
  )
    .slice(0, 12)
    .map((u) => ({
      symbol: u.symbol,
      name: u.name,
      sector: u.sector,
      isFnO: u.isFnO,
    }));

  const seen = new Set(localMatches.map((m) => m.symbol));

  // Supplement with live NSE Bhavcopy lookup across all 3,500+ NSE stocks
  if (q.length >= 2) {
    try {
      const remote = await nseMcp.lookupSymbol(q);
      const list: string[] = Array.isArray(remote)
        ? remote
        : Array.isArray(remote?.symbols)
          ? remote.symbols
          : Array.isArray(remote?.matches)
            ? remote.matches
            : [];

      for (const item of list.slice(0, 15)) {
        const sym = sanitizeSymbol(typeof item === 'string' ? item : (item as any)?.symbol);
        if (!sym || seen.has(sym)) continue;
        seen.add(sym);
        const meta = UNIVERSE_BY_SYMBOL.get(sym);
        localMatches.push({
          symbol: sym,
          name: meta?.name || `${sym} (NSE Equity)`,
          sector: meta?.sector || 'Broad Market',
          isFnO: meta?.isFnO || false,
        });
      }
    } catch {
      // Return local matches cleanly if lookup times out
    }
  }

  return localMatches.slice(0, 18);
}
