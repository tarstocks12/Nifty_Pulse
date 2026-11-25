import {
  FNO_WATCHLIST,
  FNO_WATCHLIST_SET,
  NIFTY50_WATCHLIST,
  PERSONAL_WATCHLIST_143,
  PERSONAL_WATCHLIST_SET,
} from '../src/data/watchlists.ts';
import type {
  UniverseFilter,
  XtsiDashboardPayload,
  XtsiHtf,
  XtsiSymbolRow,
  XtsiTimeframe,
  XtsiTimeframeSignal,
} from '../src/types/market.ts';
import { UNIVERSE, UNIVERSE_BY_SYMBOL } from './universe.ts';

interface Candle {
  time: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type FetchTf = '5m' | '1H' | '1D' | '1W';

const INDEX_SCALE_MAP: Record<string, number> = {
  NIFTY: 100,
  BANKNIFTY: 100,
  CNXFINANCE: 1000,
  FINNIFTY: 1000,
  NIFTY_MID_SELECT: 100,
  MIDCPNIFTY: 100,
  NIFTYNXT50: 100,
};

function getYahooTicker(symbol: string): string {
  let clean = symbol.replace(/1!$/, '').trim().toUpperCase();
  if (clean === 'NIFTY') return 'NIFTYBEES.NS';
  if (clean === 'BANKNIFTY') return 'BANKBEES.NS';
  if (clean === 'CNXFINANCE' || clean === 'FINNIFTY') return 'BFSI.NS';
  if (clean === 'NIFTY_MID_SELECT' || clean === 'MIDCPNIFTY') return 'MID150BEES.NS';
  if (clean === 'NIFTYNXT50') return 'JUNIORBEES.NS';
  clean = clean.replace(/_/g, '-');
  return `${clean}.NS`;
}

function getScaleFactor(symbol: string): number {
  const clean = symbol.replace(/1!$/, '').trim().toUpperCase();
  return INDEX_SCALE_MAP[clean] || 1;
}

// =========================================================================
// STRICT PINE SCRIPT v6 MATH (2x TSI WaveTrend)
// =========================================================================

function calcEMA(src: number[], len: number): number[] {
  const n = src.length;
  if (n === 0) return [];
  const k = 2 / (len + 1);
  const out = new Array<number>(n);
  out[0] = src[0] ?? 0;
  for (let i = 1; i < n; i++) {
    out[i] = (src[i] ?? 0) * k + out[i - 1] * (1 - k);
  }
  return out;
}

function calcSMA(src: number[], len: number): number[] {
  const n = src.length;
  const out = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += src[i] ?? 0;
    if (i >= len) {
      sum -= src[i - len] ?? 0;
      out[i] = sum / len;
    } else {
      out[i] = sum / (i + 1);
    }
  }
  return out;
}

/**
 * Exact Pine Script v6 wt_calc(chanLen=7, avgLen=18, sType="EMA"):
 *   ap = hlc3
 *   esa = ta.ema(ap, chanLen)
 *   d = ta.ema(math.abs(ap - esa), chanLen)
 *   ci = (ap - esa) / (0.015 * d)
 *   wt1 = ta.ema(ci, avgLen)
 *   wt2 = ta.sma(wt1, 4)
 */
function calcWaveTrendPine(candles: Candle[], chanLen = 7, avgLen = 18) {
  const n = candles.length;
  const ap = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    ap[i] = (candles[i].high + candles[i].low + candles[i].close) / 3;
  }
  const esa = calcEMA(ap, chanLen);
  const absDiff = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    absDiff[i] = Math.abs(ap[i] - esa[i]);
  }
  const d = calcEMA(absDiff, chanLen);
  const ci = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const denom = 0.015 * d[i];
    ci[i] = denom === 0 ? 0 : (ap[i] - esa[i]) / denom;
  }
  const wt1 = calcEMA(ci, avgLen);
  const wt2 = calcSMA(wt1, 4);
  return { wt1, wt2, esa, d };
}

/**
 * Exact Pine Script v6 ta.tsi(close, tsiShort=13, tsiLong=25) * 100
 * + ta.ema(raw_tsi, tsiSigLen=13)
 * + Zero-anchored dynamic scaling to WaveTrend over tsiNormLen=100 bars.
 */
function calcNormalizedTsiPine(candles: Candle[], tsiShort = 13, tsiLong = 25, tsiSigLen = 13, tsiNormLen = 100) {
  const n = candles.length;
  const pc = new Array<number>(n);
  const apc = new Array<number>(n);
  pc[0] = 0;
  apc[0] = 0;
  for (let i = 1; i < n; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    pc[i] = diff;
    apc[i] = Math.abs(diff);
  }

  // Pine Script ta.tsi(src, short=13, long=25): double_smooth(pc, long=25, short=13)
  const pcDouble = calcEMA(calcEMA(pc, tsiLong), tsiShort);
  const apcDouble = calcEMA(calcEMA(apc, tsiLong), tsiShort);

  const rawTsi = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const denom = apcDouble[i];
    rawTsi[i] = denom === 0 ? 0 : (pcDouble[i] / denom) * 100;
  }
  const rawTsiSig = calcEMA(rawTsi, tsiSigLen);

  const wt = calcWaveTrendPine(candles, 7, 18);
  const scaledTsi = new Array<number>(n);
  const scaledTsiSig = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - tsiNormLen + 1);
    let tMax = -Infinity;
    let tMin = Infinity;
    let wMax = -Infinity;
    let wMin = Infinity;
    for (let j = start; j <= i; j++) {
      const rt = rawTsi[j];
      const w1 = wt.wt1[j];
      if (rt > tMax) tMax = rt;
      if (rt < tMin) tMin = rt;
      if (w1 > wMax) wMax = w1;
      if (w1 < wMin) wMin = w1;
    }
    const tRange = tMax - tMin === 0 ? 1 : tMax - tMin;
    const wRange = wMax - wMin === 0 ? 1 : wMax - wMin;
    const scaleRatio = wRange / tRange;
    scaledTsi[i] = rawTsi[i] * scaleRatio;
    scaledTsiSig[i] = rawTsiSig[i] * scaleRatio;
  }

  return { rawTsi, rawTsiSig, scaledTsi, scaledTsiSig, wt };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function countCtfBarsSince(ctfCandles: Candle[], crossTimestamp: number): number {
  const n = ctfCandles.length;
  if (n === 0 || crossTimestamp <= 0) return 0;
  for (let i = 0; i < n; i++) {
    if (ctfCandles[i].time >= crossTimestamp) {
      return n - i;
    }
  }
  return 1;
}

/**
 * Evaluates X TSI (HTF TSI Cross) strictly matching the pasted Pine script:
 * - 5m chart -> HTF is 1H
 * - 1H chart -> HTF is 1D
 * - 1D chart -> HTF is 1W
 */
function evaluateXtsiPair(
  ctf: XtsiTimeframe,
  htf: XtsiHtf,
  ctfCandles: Candle[],
  htfCandles: Candle[]
): XtsiTimeframeSignal {
  if (htfCandles.length < 20) {
    return {
      ctf,
      htf,
      regime: 'NEUTRAL',
      isBull: false,
      isBear: false,
      freshCross: false,
      ctfBarsSinceCross: 0,
      htfBarsSinceCross: 0,
      crossTimestamp: 0,
      scaledTsi: 0,
      scaledTsiSig: 0,
      rawTsi: 0,
      rawTsiSig: 0,
      ctfWt1: 0,
      ctfWt2: 0,
      isTb: false,
      isTs: false,
      isPxt: false,
      unavailable: true,
    };
  }

  const htfCalc = calcNormalizedTsiPine(htfCandles, 13, 25, 13, 100);
  const nHtf = htfCandles.length;
  const lastIdx = nHtf - 1;

  const curScaledTsi = htfCalc.scaledTsi[lastIdx];
  const curScaledSig = htfCalc.scaledTsiSig[lastIdx];
  const curRawTsi = htfCalc.rawTsi[lastIdx];
  const curRawSig = htfCalc.rawTsiSig[lastIdx];

  // Pine script: htf1_tsi_cross_up = ta.crossover(htf_scaled_tsi, htf_scaled_tsi_sig)
  //              htf1_tsi_cross_dn = ta.crossunder(htf_scaled_tsi, htf_scaled_tsi_sig)
  const isBull = curScaledTsi > curScaledSig;
  const isBear = curScaledTsi < curScaledSig;
  const regime: 'BULL' | 'BEAR' | 'NEUTRAL' = isBull ? 'BULL' : isBear ? 'BEAR' : 'NEUTRAL';

  let crossIdx = -1;
  if (isBull) {
    for (let k = lastIdx; k >= 1; k--) {
      if (htfCalc.scaledTsi[k] > htfCalc.scaledTsiSig[k] && htfCalc.scaledTsi[k - 1] <= htfCalc.scaledTsiSig[k - 1]) {
        crossIdx = k;
        break;
      }
    }
  } else if (isBear) {
    for (let k = lastIdx; k >= 1; k--) {
      if (htfCalc.scaledTsi[k] < htfCalc.scaledTsiSig[k] && htfCalc.scaledTsi[k - 1] >= htfCalc.scaledTsiSig[k - 1]) {
        crossIdx = k;
        break;
      }
    }
  }

  const htfBarsSinceCross = crossIdx !== -1 ? lastIdx - crossIdx + 1 : 0;
  const crossTimestamp = crossIdx !== -1 ? htfCandles[crossIdx].time : 0;
  const ctfBarsSinceCross =
    crossTimestamp > 0 && ctfCandles.length > 0
      ? countCtfBarsSince(ctfCandles, crossTimestamp)
      : htfBarsSinceCross;

  // Compute CTF WaveTrend for TB/TS & PXT confluence (matching Pine script exactly)
  let ctfWt1 = 0;
  let ctfWt2 = 0;
  let isTb = false;
  let isTs = false;
  let isPxt = false;

  if (ctfCandles.length >= 10) {
    const ctfWt = calcWaveTrendPine(ctfCandles, 7, 18);
    const cLast = ctfCandles.length - 1;
    const cPrev = cLast - 1;
    ctfWt1 = ctfWt.wt1[cLast];
    ctfWt2 = ctfWt.wt2[cLast];
    const crossBull = ctfWt.wt1[cLast] > ctfWt.wt2[cLast] && ctfWt.wt1[cPrev] <= ctfWt.wt2[cPrev];
    const crossBear = ctfWt.wt1[cLast] < ctfWt.wt2[cLast] && ctfWt.wt1[cPrev] >= ctfWt.wt2[cPrev];
    // Pine: is_tb = htf_tsi_bull and cross_bull and (wt1 < -25)
    //       is_ts = htf_tsi_bear and cross_bear and (wt1 > 25)
    isTb = isBull && crossBull && ctfWt1 < -25;
    isTs = isBear && crossBear && ctfWt1 > 25;

    // Pine PXT: project_bg(htf_raw_tsi_bg * htf_s_ratio_bg, htf_esa_bg, htf_d_bg)
    const htfOverlayNow = htfCalc.wt.esa[lastIdx] + curScaledTsi * 0.015 * htfCalc.wt.d[lastIdx];
    const prevHtfIdx = Math.max(0, lastIdx - 1);
    const htfOverlayPrev =
      htfCalc.wt.esa[prevHtfIdx] + htfCalc.scaledTsi[prevHtfIdx] * 0.015 * htfCalc.wt.d[prevHtfIdx];
    const closeNow = ctfCandles[cLast].close;
    const closePrev = ctfCandles[cPrev].close;
    isPxt =
      (closeNow > htfOverlayNow && closePrev <= htfOverlayPrev) ||
      (closeNow < htfOverlayNow && closePrev >= htfOverlayPrev);
  }

  return {
    ctf,
    htf,
    regime,
    isBull,
    isBear,
    freshCross: htfBarsSinceCross === 1,
    ctfBarsSinceCross,
    htfBarsSinceCross,
    crossTimestamp,
    scaledTsi: round2(curScaledTsi),
    scaledTsiSig: round2(curScaledSig),
    rawTsi: round2(curRawTsi),
    rawTsiSig: round2(curRawSig),
    ctfWt1: round2(ctfWt1),
    ctfWt2: round2(ctfWt2),
    isTb,
    isTs,
    isPxt,
  };
}

// =========================================================================
// YAHOO FINANCE MULTI-TIMEFRAME CANDLE FETCHER + IN-MEMORY CACHE
// =========================================================================

interface CandleCacheEntry {
  candles: Candle[];
  fetchedAt: number;
}

const candleCache = new Map<string, CandleCacheEntry>();
const symbolRowCache = new Map<string, { row: XtsiSymbolRow; fetchedAt: number }>();

const CANDLE_TTL: Record<FetchTf, number> = {
  '5m': 3 * 60 * 1000,
  '1H': 4 * 60 * 1000,
  '1D': 10 * 60 * 1000,
  '1W': 15 * 60 * 1000,
};

const ROW_TTL_MS = 3 * 60 * 1000;

async function fetchYahooCandles(symbol: string, tf: FetchTf): Promise<Candle[]> {
  const ticker = getYahooTicker(symbol);
  const key = `${ticker}_${tf}`;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CANDLE_TTL[tf]) {
    return cached.candles;
  }

  const params: Record<FetchTf, { interval: string; range: string }> = {
    '5m': { interval: '5m', range: '1mo' },
    '1H': { interval: '60m', range: '60d' },
    '1D': { interval: '1d', range: '2y' },
    '1W': { interval: '1wk', range: '5y' },
  };
  const { interval, range } = params[tf];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      return cached?.candles || [];
    }
    const json: any = await res.json();
    const result = json?.chart?.result?.[0];
    const ts: number[] = result?.timestamp || [];
    const quote = result?.indicators?.quote?.[0] || {};
    const scale = getScaleFactor(symbol);

    const out: Candle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = quote.close?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const o = quote.open?.[i];
      if (c == null || h == null || l == null || o == null) continue;
      if (!Number.isFinite(c) || c <= 0) continue;
      out.push({
        time: ts[i],
        open: o * scale,
        high: h * scale,
        low: l * scale,
        close: c * scale,
        volume: Number(quote.volume?.[i] || 0),
      });
    }

    if (out.length >= 5) {
      candleCache.set(key, { candles: out, fetchedAt: Date.now() });
      return out;
    }
    return cached?.candles || [];
  } catch {
    return cached?.candles || [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ensures the 1D candle array includes the latest trading session if Yahoo's 1d
 * endpoint lags behind the live 1H intraday bars (so 1H -> HTF 1D X TSI stays live).
 */
function stitchLatestDailyBar(dailyCandles: Candle[], hourlyCandles: Candle[]): Candle[] {
  if (!dailyCandles.length || !hourlyCandles.length) return dailyCandles;
  const lastDailyDate = new Date(dailyCandles[dailyCandles.length - 1].time * 1000)
    .toISOString()
    .slice(0, 10);

  // Group hourly candles after lastDailyDate by IST trading day (UTC+5:30)
  const byDay = new Map<string, Candle[]>();
  for (const h of hourlyCandles) {
    const istDate = new Date((h.time + 19800) * 1000).toISOString().slice(0, 10);
    if (istDate > lastDailyDate) {
      const arr = byDay.get(istDate) || [];
      arr.push(h);
      byDay.set(istDate, arr);
    }
  }

  if (byDay.size === 0) return dailyCandles;

  const stitched = [...dailyCandles];
  const sortedDays = Array.from(byDay.keys()).sort();
  for (const day of sortedDays) {
    const bars = byDay.get(day)!;
    if (!bars.length) continue;
    stitched.push({
      time: bars[0].time,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((a, b) => a + b.volume, 0),
    });
  }
  return stitched;
}

async function computeSymbolXtsi(symbol: string, force = false): Promise<XtsiSymbolRow | null> {
  const cached = symbolRowCache.get(symbol);
  if (!force && cached && Date.now() - cached.fetchedAt < ROW_TTL_MS) {
    return cached.row;
  }

  const [c5m, c1H, c1DRaw, c1W] = await Promise.all([
    fetchYahooCandles(symbol, '5m'),
    fetchYahooCandles(symbol, '1H'),
    fetchYahooCandles(symbol, '1D'),
    fetchYahooCandles(symbol, '1W'),
  ]);

  const c1D = stitchLatestDailyBar(c1DRaw, c1H);

  // Strictly match Pine Script get_htf():
  // 5m -> 1H | 1H -> 1D | 1D -> 1W
  const tf5m = evaluateXtsiPair('5m', '1H', c5m, c1H);
  const tf1H = evaluateXtsiPair('1H', '1D', c1H, c1D);
  const tf1D = evaluateXtsiPair('1D', '1W', c1D, c1W);

  // Weighted TSI strength matching D4-TSI weights (5m: 1, 1H: 2, 1D: 5)
  const weights: Record<XtsiTimeframe, number> = { '5m': 1, '1H': 2, '1D': 5 };
  let netScore = 0;
  let totalWeight = 0;
  for (const [tf, sig] of [
    ['5m', tf5m],
    ['1H', tf1H],
    ['1D', tf1D],
  ] as const) {
    if (!sig.unavailable) {
      const w = weights[tf];
      totalWeight += w;
      if (sig.isBull) netScore += w;
      else if (sig.isBear) netScore -= w;
    }
  }

  const tsiStrength =
    totalWeight > 0 ? Math.round(((netScore + totalWeight) / (2 * totalWeight)) * 100) : 50;
  let tsiStrengthLabel: XtsiSymbolRow['tsiStrengthLabel'] = 'NEUTRAL';
  if (tsiStrength >= 80) tsiStrengthLabel = 'STRONG BULL';
  else if (tsiStrength >= 60) tsiStrengthLabel = 'BULL';
  else if (tsiStrength > 40) tsiStrengthLabel = 'NEUTRAL';
  else if (tsiStrength >= 20) tsiStrengthLabel = 'BEAR';
  else tsiStrengthLabel = 'STRONG BEAR';

  // Live LTP & 1D % change from stitched daily candles
  const lastD = c1D[c1D.length - 1];
  const prevD = c1D[c1D.length - 2];
  const ltp = lastD?.close || c1H[c1H.length - 1]?.close || 0;
  const prevClose = prevD?.close || lastD?.open || ltp;
  const perChange = prevClose > 0 ? round2(((ltp - prevClose) / prevClose) * 100) : 0;

  const lookupSym = symbol === 'BAJAJ_AUTO' ? 'BAJAJ-AUTO' : symbol;
  const meta = UNIVERSE_BY_SYMBOL.get(lookupSym) || UNIVERSE_BY_SYMBOL.get(symbol);

  const barCounts = [tf5m, tf1H, tf1D]
    .filter((t) => !t.unavailable && t.ctfBarsSinceCross > 0)
    .map((t) => t.ctfBarsSinceCross);
  const minCtfBars = barCounts.length ? Math.min(...barCounts) : 999;

  const row: XtsiSymbolRow = {
    symbol,
    name: meta?.name || symbol,
    sector: meta?.sector || (INDEX_SCALE_MAP[symbol.replace(/1!$/, '')] ? 'Index / Derivatives' : 'NSE Equity'),
    ltp: round2(ltp),
    perChange,
    isPersonal: PERSONAL_WATCHLIST_SET.has(symbol),
    isFnO: FNO_WATCHLIST_SET.has(symbol) || Boolean(meta?.isFnO),
    isNifty50: NIFTY50_WATCHLIST.includes(symbol) || Boolean(meta?.isNifty50),
    isNifty500: true,
    tsiStrength,
    tsiStrengthLabel,
    hasFreshXtsi: tf5m.freshCross || tf1H.freshCross || tf1D.freshCross,
    minCtfBars,
    timeframes: {
      '5m': tf5m,
      '1H': tf1H,
      '1D': tf1D,
    },
  };

  symbolRowCache.set(symbol, { row, fetchedAt: Date.now() });
  return row;
}

function getWatchlistSymbols(watchlist: UniverseFilter): string[] {
  switch (watchlist) {
    case 'personal':
      return PERSONAL_WATCHLIST_143;
    case 'nifty50':
      return NIFTY50_WATCHLIST;
    case 'fno':
      return FNO_WATCHLIST;
    case 'nifty500':
    case 'all':
    default: {
      const merged = new Set<string>([
        ...PERSONAL_WATCHLIST_143,
        ...FNO_WATCHLIST,
        ...UNIVERSE.map((u) => (u.symbol === 'BAJAJ-AUTO' ? 'BAJAJ_AUTO' : u.symbol)),
      ]);
      return Array.from(merged);
    }
  }
}

const activeScans = new Map<string, Promise<void>>();

function startBackgroundScan(watchlist: UniverseFilter, symbols: string[], force: boolean) {
  const key = watchlist;
  if (activeScans.has(key)) return;

  const toFetch = symbols.filter((s) => {
    if (force) return true;
    const c = symbolRowCache.get(s);
    return !c || Date.now() - c.fetchedAt >= ROW_TTL_MS;
  });

  if (toFetch.length === 0) return;

  const job = (async () => {
    let idx = 0;
    const concurrency = 8;
    const workers = Array.from({ length: Math.min(concurrency, toFetch.length) }, async () => {
      while (idx < toFetch.length) {
        const sym = toFetch[idx++];
        await computeSymbolXtsi(sym, force).catch(() => null);
      }
    });
    await Promise.all(workers);
  })().finally(() => {
    activeScans.delete(key);
  });

  activeScans.set(key, job);
}

export async function getXtsiDashboardData(
  watchlist: UniverseFilter = 'personal',
  force = false
): Promise<XtsiDashboardPayload> {
  const symbols = getWatchlistSymbols(watchlist);

  // Warm the first 24 symbols synchronously if cache is cold so UI renders immediately
  const uncachedCount = symbols.filter((s) => !symbolRowCache.has(s)).length;
  if (uncachedCount === symbols.length) {
    const initialBatch = symbols.slice(0, 24);
    let idx = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (idx < initialBatch.length) {
          const sym = initialBatch[idx++];
          await computeSymbolXtsi(sym, false).catch(() => null);
        }
      })
    );
  }

  // Trigger non-blocking background scan for remaining symbols in the selected watchlist
  startBackgroundScan(watchlist, symbols, force);

  const rows: XtsiSymbolRow[] = [];
  for (const sym of symbols) {
    const c = symbolRowCache.get(sym);
    if (c) rows.push(c.row);
  }

  // Default order: freshest X TSI crosses first, then lowest bar count, then strongest TSI
  rows.sort((a, b) => {
    if (a.hasFreshXtsi !== b.hasFreshXtsi) return a.hasFreshXtsi ? -1 : 1;
    if (a.minCtfBars !== b.minCtfBars) return a.minCtfBars - b.minCtfBars;
    return b.tsiStrength - a.tsiStrength;
  });

  return {
    watchlist,
    updatedAt: new Date().toISOString(),
    totalSymbols: symbols.length,
    scannedCount: rows.length,
    scanning: activeScans.has(watchlist) || rows.length < symbols.length,
    rows,
  };
}
