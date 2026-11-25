import type { IndexQuote, OhlcPoint } from '../src/types/market.ts';

export interface YahooDailySnapshot {
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
  sma200: number;
  avgVolume30d: number;
  history: OhlcPoint[];
  latestTimestamp: string;
}

export interface YahooIndexSnapshot {
  quote: IndexQuote;
  return1W: number;
  return1M: number;
  return3M: number;
}

const YAHOO_INDEX_TICKERS: Array<{ nseName: string; yahoo: string; group: string }> = [
  { nseName: 'NIFTY 50', yahoo: '^NSEI', group: 'broad' },
  { nseName: 'NIFTY BANK', yahoo: '^NSEBANK', group: 'sectoral' },
  { nseName: 'NIFTY 500', yahoo: '^CRSLDX', group: 'broad' },
  { nseName: 'NIFTY MIDCAP 100', yahoo: '^NSEMDCP50', group: 'broad' },
  { nseName: 'INDIA VIX', yahoo: '^INDIAVIX', group: 'broad' },
  { nseName: 'NIFTY FINANCIAL SERVICES', yahoo: '^CNXFIN', group: 'sectoral' },
  { nseName: 'NIFTY IT', yahoo: '^CNXIT', group: 'sectoral' },
  { nseName: 'NIFTY PHARMA', yahoo: '^CNXPHARMA', group: 'sectoral' },
  { nseName: 'NIFTY AUTO', yahoo: '^CNXAUTO', group: 'sectoral' },
  { nseName: 'NIFTY FMCG', yahoo: '^CNXFMCG', group: 'sectoral' },
  { nseName: 'NIFTY ENERGY', yahoo: '^CNXENERGY', group: 'sectoral' },
  { nseName: 'NIFTY METAL', yahoo: '^CNXMETAL', group: 'sectoral' },
  { nseName: 'NIFTY REALTY', yahoo: '^CNXREALTY', group: 'sectoral' },
  { nseName: 'NIFTY INDIA DEFENCE', yahoo: '^CNXINFRA', group: 'sectoral' },
  { nseName: 'NIFTY INDIA DIGITAL', yahoo: '^CNXIT', group: 'sectoral' },
  { nseName: 'NIFTY COMMODITIES', yahoo: '^CNXCMDT', group: 'sectoral' },
  { nseName: 'NIFTY PSE', yahoo: '^CNXPSE', group: 'sectoral' },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchYahooChart(yahooTicker: string, range: '3mo' | '1y'): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooTicker
    )}?interval=1d&range=${range}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.chart?.result?.[0] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchYahooNseStock(symbol: string): Promise<YahooDailySnapshot | null> {
  const clean = symbol.trim().toUpperCase();
  if (!clean || clean.endsWith('1!')) return null;
  const yahooTicker = `${clean.replace(/_/g, '-')}.NS`;

  const result = await fetchYahooChart(yahooTicker, '1y');
  if (!result) return null;

  const ts: number[] = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const meta = result.meta || {};

  const bars: OhlcPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) continue;
    const open = typeof q.open?.[i] === 'number' && Number.isFinite(q.open[i]) ? q.open[i] : close;
    const high = typeof q.high?.[i] === 'number' && Number.isFinite(q.high[i]) ? q.high[i] : close;
    const low = typeof q.low?.[i] === 'number' && Number.isFinite(q.low[i]) ? q.low[i] : close;
    const volume = typeof q.volume?.[i] === 'number' && Number.isFinite(q.volume[i]) ? q.volume[i] : 0;
    const date = new Date((ts[i] + 19800) * 1000).toISOString().slice(0, 10);
    bars.push({ date, open, high, low, close, volume });
  }

  if (bars.length < 2) return null;

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];

  // If meta.regularMarketPrice reflects a newer intraday bar not yet in daily closes, stitch it
  const metaPrice = typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
    ? meta.regularMarketPrice
    : last.close;
  const metaDate = typeof meta.regularMarketTime === 'number'
    ? new Date((meta.regularMarketTime + 19800) * 1000).toISOString().slice(0, 10)
    : last.date;

  let ltp = last.close;
  let prevClose = prev.close;
  let open = last.open;
  let high = last.high;
  let low = last.low;
  let volume = last.volume;

  if (metaDate > last.date && metaPrice > 0) {
    prevClose = last.close;
    ltp = metaPrice;
    open = typeof meta.regularMarketDayHigh === 'number' ? Math.min(metaPrice, meta.regularMarketDayHigh) : prevClose;
    high = typeof meta.regularMarketDayHigh === 'number' && meta.regularMarketDayHigh > 0 ? meta.regularMarketDayHigh : Math.max(ltp, prevClose);
    low = typeof meta.regularMarketDayLow === 'number' && meta.regularMarketDayLow > 0 ? meta.regularMarketDayLow : Math.min(ltp, prevClose);
    volume = typeof meta.regularMarketVolume === 'number' && meta.regularMarketVolume > 0 ? meta.regularMarketVolume : last.volume;
    bars.push({ date: metaDate, open, high, low, close: ltp, volume });
  }

  const change = round2(ltp - prevClose);
  const perChange = prevClose > 0 ? round2(((ltp - prevClose) / prevClose) * 100) : 0;

  const ref30Idx = Math.max(0, bars.length - 23);
  const ref30Close = bars[ref30Idx]?.close || prevClose;
  const perChange30d = ref30Close > 0 ? round2(((ltp - ref30Close) / ref30Close) * 100) : 0;

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const fiftyTwoWeekHigh = Math.max(...highs, meta.fiftyTwoWeekHigh || 0, ltp);
  const validLows = lows.filter((v) => v > 0);
  const fiftyTwoWeekLow = Math.min(
    ...(validLows.length ? validLows : [ltp]),
    meta.fiftyTwoWeekLow > 0 ? meta.fiftyTwoWeekLow : ltp
  );

  const sma200Slice = closes.slice(-Math.min(200, closes.length));
  const sma200 = sma200Slice.reduce((a, b) => a + b, 0) / sma200Slice.length;

  const vol30Slice = bars.slice(-Math.min(31, bars.length), -1).map((b) => b.volume).filter((v) => v > 0);
  const avgVolume30d = vol30Slice.length
    ? vol30Slice.reduce((a, b) => a + b, 0) / vol30Slice.length
    : Math.max(volume, 1);

  return {
    symbol: clean,
    ltp: round2(ltp),
    open: round2(open),
    high: round2(high),
    low: round2(low),
    prevClose: round2(prevClose),
    change,
    perChange,
    perChange30d,
    volume: Math.round(volume),
    turnoverCr: round2((volume * ltp) / 1e7),
    fiftyTwoWeekHigh: round2(fiftyTwoWeekHigh),
    fiftyTwoWeekLow: round2(fiftyTwoWeekLow),
    sma200: round2(sma200),
    avgVolume30d: Math.round(avgVolume30d),
    history: bars.slice(-65),
    latestTimestamp: metaDate,
  };
}

export async function fetchYahooNseIndices(): Promise<Map<string, YahooIndexSnapshot>> {
  const map = new Map<string, YahooIndexSnapshot>();
  const uniqueYahoo = Array.from(new Set(YAHOO_INDEX_TICKERS.map((t) => t.yahoo)));
  const rawByTicker = new Map<string, any>();

  await Promise.all(
    uniqueYahoo.map(async (yt) => {
      const res = await fetchYahooChart(yt, '3mo');
      if (res) rawByTicker.set(yt, res);
    })
  );

  for (const cfg of YAHOO_INDEX_TICKERS) {
    const res = rawByTicker.get(cfg.yahoo);
    if (!res) continue;
    const ts: number[] = res.timestamp || [];
    const q = res.indicators?.quote?.[0] || {};
    const meta = res.meta || {};

    const closes: number[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = q.close?.[i];
      if (typeof c === 'number' && Number.isFinite(c) && c > 0) closes.push(c);
    }
    if (closes.length < 2) continue;

    const last = typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
      ? meta.regularMarketPrice
      : closes[closes.length - 1];
    // If regularMarketPrice differs from last daily close by >0.01%, last daily close is prevClose
    const lastDaily = closes[closes.length - 1];
    const prevClose =
      Math.abs(last - lastDaily) / Math.max(1, lastDaily) > 0.0005
        ? lastDaily
        : closes[closes.length - 2];

    const change = round2(last - prevClose);
    const percChange = prevClose > 0 ? round2(((last - prevClose) / prevClose) * 100) : 0;

    const ref1W = closes[Math.max(0, closes.length - 6)];
    const ref1M = closes[Math.max(0, closes.length - 22)];
    const ref3M = closes[0];

    const timeVal = typeof meta.regularMarketTime === 'number'
      ? new Date((meta.regularMarketTime + 19800) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' IST'
      : '';

    map.set(cfg.nseName.toUpperCase(), {
      quote: {
        indexName: cfg.nseName,
        group: cfg.group,
        last: round2(last),
        previousClose: round2(prevClose),
        change,
        percChange,
        open: round2(q.open?.[ts.length - 1] || last),
        high: round2(meta.regularMarketDayHigh || q.high?.[ts.length - 1] || last),
        low: round2(meta.regularMarketDayLow || q.low?.[ts.length - 1] || last),
        timeVal,
      },
      return1W: ref1W > 0 ? round2(((last - ref1W) / ref1W) * 100) : 0,
      return1M: ref1M > 0 ? round2(((last - ref1M) / ref1M) * 100) : 0,
      return3M: ref3M > 0 ? round2(((last - ref3M) / ref3M) * 100) : 0,
    });
  }

  return map;
}
