export type ScreenerCategoryId =
  | 'all'
  | 'high_52w'
  | 'ath'
  | 'volume_shockers'
  | 'golden_cross'
  | 'death_cross'
  | 'rsi_oversold'
  | 'rsi_overbought'
  | 'macd_bullish'
  | 'bollinger_squeeze'
  | 'dma200_bounce'
  | 'intraday_movers'
  | 'swing_picks'
  | 'penny_fundamentals'
  | 'multibagger';

export type UniverseFilter = 'all' | 'fno' | 'nifty50' | 'nifty500';

export type CapTier = 'Large Cap' | 'Mid Cap' | 'Small Cap';

export interface ScreenerTag {
  id: Exclude<ScreenerCategoryId, 'all'>;
  label: string;
  shortLabel: string;
  tone: 'bullish' | 'bearish' | 'momentum' | 'value' | 'neutral';
  group: 'technical' | 'thematic';
}

export interface FundamentalMetrics {
  pe: number;
  pb: number;
  roe: number; // %
  debtToEquity: number;
  revenueGrowth3Y: number; // % CAGR
  profitMargin: number; // %
  divYield: number; // %
  marketCapCr: number;
}

export interface SectorBenchmark {
  sector: string;
  nseIndexName: string;
  pe: number;
  pb: number;
  roe: number;
  debtToEquity: number;
  revenueGrowth3Y: number;
  profitMargin: number;
  divYield: number;
}

export interface TechnicalIndicators {
  sma20: number;
  sma50: number;
  sma200: number;
  rsi14: number;
  prevRsi14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  prevMacdHistogram: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbBandwidthPct: number;
  bbSqueezeRank: number; // 0-100 (lower = tighter squeeze)
  avgVolume10d: number;
  avgVolume30d: number;
  volumeRatio10d: number;
  volumeRatio30d: number;
  intradayRangePct: number;
  from52wHighPct: number;
  from52wLowPct: number;
  isAboveSma50: boolean;
  isAboveSma200: boolean;
  sma50Vs200Pct: number;
}

export interface StrengthPillar {
  key: 'trend' | 'momentum' | 'breakout' | 'volume' | 'sector' | 'fundamentals';
  label: string;
  weight: number; // percentage, sums to 100
  score: number; // 0-100
  weightedContribution: number;
  summary: string;
}

export interface StrengthBreakdown {
  overall: number; // 0-100
  rating: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Strong Bearish';
  pillars: StrengthPillar[];
}

export interface OhlcPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockRecord {
  symbol: string;
  name: string;
  sector: string;
  capTier: CapTier;
  isFnO: boolean;
  isNifty50: boolean;
  isNifty500: boolean;
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
  multiYearHigh: number;
  latestTimestamp: string;
  technicals: TechnicalIndicators;
  fundamentals: FundamentalMetrics;
  benchmark: SectorBenchmark;
  signals: ScreenerTag[];
  strength: StrengthBreakdown;
  sparkline: number[];
  history?: OhlcPoint[];
  sectorReturn1D: number;
  sectorReturn1M: number;
  corporateAction?: string;
}

export interface IndexQuote {
  indexName: string;
  group: string;
  last: number;
  previousClose: number;
  change: number;
  percChange: number;
  open: number;
  high: number;
  low: number;
  timeVal: string;
}

export interface SectorRotationItem {
  sector: string;
  indexName: string;
  last: number;
  change1D: number;
  return1W: number;
  return1M: number;
  return3M: number;
  relativeStrengthVsNifty: number;
  quadrant: 'Leading' | 'Improving' | 'Weakening' | 'Lagging';
  advancingCount: number;
  decliningCount: number;
  topSymbols: { symbol: string; perChange: number; strength: number }[];
}

export interface MarketBreadth {
  date: string;
  totalStocks: number;
  advances: number;
  declines: number;
  unchanged: number;
  adRatio: number;
  totalVolume: number;
}

export interface DashboardPayload {
  updatedAt: string;
  nseTimestamp: string;
  enrichmentComplete: boolean;
  enrichedCount: number;
  totalUniverse: number;
  indices: {
    nifty50: IndexQuote | null;
    niftyBank: IndexQuote | null;
    nifty500: IndexQuote | null;
    niftyMidcap: IndexQuote | null;
    indiaVix: IndexQuote | null;
  };
  breadth: MarketBreadth | null;
  topBullish: StockRecord[];
  topBearish: StockRecord[];
  stocks: StockRecord[];
  sectors: SectorRotationItem[];
  categoryCounts: Record<ScreenerCategoryId, number>;
}
