import type {
  FundamentalMetrics,
  OhlcPoint,
  ScreenerTag,
  SectorBenchmark,
  StrengthBreakdown,
  StrengthPillar,
  TechnicalIndicators,
} from '../src/types/market.ts';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcSMA(values: number[], period: number): number {
  if (!values.length) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  const sum = slice.reduce((acc, v) => acc + v, 0);
  return sum / slice.length;
}

export function calcEMASeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let ema = values[0];
  out.push(ema);
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

export function calcRSISeries(closes: number[], period = 14): number[] {
  if (closes.length < 3) return [50];
  const p = Math.min(period, Math.max(2, closes.length - 1));
  const rsiOut: number[] = [];

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= p; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= p;
  avgLoss /= p;

  const firstRs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsiOut.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + firstRs));

  for (let i = p + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (p - 1) + gain) / p;
    avgLoss = (avgLoss * (p - 1) + loss) / p;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsiOut.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));
  }

  return rsiOut.length ? rsiOut : [50];
}

export function calcMACD(closes: number[]) {
  if (closes.length < 15) {
    return { macd: 0, signal: 0, histogram: 0, prevHistogram: 0 };
  }
  const ema12 = calcEMASeries(closes, 12);
  const ema26 = calcEMASeries(closes, 26);
  const macdLine = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalLine = calcEMASeries(macdLine, 9);
  const last = macdLine.length - 1;
  const prev = Math.max(0, last - 1);
  return {
    macd: macdLine[last],
    signal: signalLine[last],
    histogram: macdLine[last] - signalLine[last],
    prevHistogram: macdLine[prev] - signalLine[prev],
  };
}

export function calcBollinger(closes: number[], period = 20, mult = 2) {
  if (closes.length < 5) {
    const p = closes[closes.length - 1] || 0;
    return { upper: p, middle: p, lower: p, bandwidthPct: 8, squeezeRank: 50 };
  }
  const len = closes.length;
  const computeAt = (endIdx: number) => {
    const start = Math.max(0, endIdx - period + 1);
    const slice = closes.slice(start, endIdx + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    const std = Math.sqrt(variance);
    const upper = mean + mult * std;
    const lower = mean - mult * std;
    const bw = mean > 0 ? ((upper - lower) / mean) * 100 : 0;
    return { upper, middle: mean, lower, bw };
  };

  const current = computeAt(len - 1);
  const lookback = Math.min(35, len - 5);
  const bwHistory: number[] = [];
  for (let i = Math.max(4, len - lookback); i < len; i++) {
    bwHistory.push(computeAt(i).bw);
  }
  const minBw = Math.min(...bwHistory, current.bw);
  const maxBw = Math.max(...bwHistory, current.bw);
  const squeezeRank =
    maxBw - minBw > 0.001
      ? clamp(((current.bw - minBw) / (maxBw - minBw)) * 100, 0, 100)
      : 50;

  return {
    upper: current.upper,
    middle: current.middle,
    lower: current.lower,
    bandwidthPct: current.bw,
    squeezeRank,
  };
}

export function computeTechnicalIndicators(params: {
  ltp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  perChange30d: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  history: OhlcPoint[];
  sma200External?: number;
  avgVolume30dExternal?: number;
}): TechnicalIndicators {
  const {
    ltp,
    open,
    high,
    low,
    volume,
    perChange30d,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    history,
    sma200External,
    avgVolume30dExternal,
  } = params;

  // Append live LTP as latest close if not already matching last bar
  const closes = history.map((h) => h.close).filter((c) => c > 0);
  if (ltp > 0) {
    if (!closes.length || Math.abs(closes[closes.length - 1] - ltp) / ltp > 0.0005) {
      closes.push(ltp);
    } else {
      closes[closes.length - 1] = ltp;
    }
  }

  const volumes = history.map((h) => h.volume).filter((v) => v > 0);

  const sma20 = closes.length >= 5 ? calcSMA(closes, 20) : ltp;
  const sma50 = closes.length >= 10 ? calcSMA(closes, 50) : ltp / (1 + perChange30d / 200);
  const sma200 =
    sma200External && sma200External > 0
      ? sma200External
      : closes.length >= 20
        ? calcSMA(closes, closes.length)
        : (fiftyTwoWeekHigh + fiftyTwoWeekLow) / 2 || ltp;

  const rsiSeries = calcRSISeries(closes, 14);
  const rsi14 = rsiSeries[rsiSeries.length - 1] ?? 50;
  const prevRsi14 = rsiSeries.length >= 2 ? rsiSeries[rsiSeries.length - 2] : rsi14;

  const macdObj = calcMACD(closes);
  const bb = calcBollinger(closes, 20, 2);

  const avgVolume10d = volumes.length >= 3 ? calcSMA(volumes, 10) : Math.max(volume, 1);
  const avgVolume30d =
    avgVolume30dExternal && avgVolume30dExternal > 0
      ? avgVolume30dExternal
      : volumes.length >= 5
        ? calcSMA(volumes, 30)
        : avgVolume10d;

  const volumeRatio10d = avgVolume10d > 0 ? volume / avgVolume10d : 1;
  const volumeRatio30d = avgVolume30d > 0 ? volume / avgVolume30d : 1;

  const intradayRangePct = open > 0 ? ((high - low) / open) * 100 : 0;
  const from52wHighPct =
    fiftyTwoWeekHigh > 0 ? ((ltp - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100 : 0;
  const from52wLowPct =
    fiftyTwoWeekLow > 0 ? ((ltp - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100 : 0;
  const sma50Vs200Pct = sma200 > 0 ? ((sma50 - sma200) / sma200) * 100 : 0;

  return {
    sma20: round2(sma20),
    sma50: round2(sma50),
    sma200: round2(sma200),
    rsi14: round2(rsi14),
    prevRsi14: round2(prevRsi14),
    macd: round2(macdObj.macd),
    macdSignal: round2(macdObj.signal),
    macdHistogram: round2(macdObj.histogram),
    prevMacdHistogram: round2(macdObj.prevHistogram),
    bbUpper: round2(bb.upper),
    bbMiddle: round2(bb.middle),
    bbLower: round2(bb.lower),
    bbBandwidthPct: round2(bb.bandwidthPct),
    bbSqueezeRank: round2(bb.squeezeRank),
    avgVolume10d: Math.round(avgVolume10d),
    avgVolume30d: Math.round(avgVolume30d),
    volumeRatio10d: round2(volumeRatio10d),
    volumeRatio30d: round2(volumeRatio30d),
    intradayRangePct: round2(intradayRangePct),
    from52wHighPct: round2(from52wHighPct),
    from52wLowPct: round2(from52wLowPct),
    isAboveSma50: ltp >= sma50,
    isAboveSma200: ltp >= sma200,
    sma50Vs200Pct: round2(sma50Vs200Pct),
  };
}

export function evaluateScreenerSignals(params: {
  ltp: number;
  perChange: number;
  perChange30d: number;
  turnoverCr: number;
  multiYearHigh: number;
  capTier: 'Large Cap' | 'Mid Cap' | 'Small Cap';
  isFnO: boolean;
  technicals: TechnicalIndicators;
  fundamentals: FundamentalMetrics;
}): ScreenerTag[] {
  const {
    ltp,
    perChange,
    perChange30d,
    turnoverCr,
    multiYearHigh,
    capTier,
    isFnO,
    technicals: t,
    fundamentals: f,
  } = params;

  const tags: ScreenerTag[] = [];

  // 1. 52-Week High Breakouts
  if (t.from52wHighPct >= -3.0 && (perChange > 0 || perChange30d > 4)) {
    tags.push({
      id: 'high_52w',
      label: '52-Week High Breakout',
      shortLabel: '52W High',
      tone: 'bullish',
      group: 'technical',
    });
  }

  // 2. All-Time High (ATH) Stocks
  const athRef = Math.max(multiYearHigh, ltp);
  const fromAthPct = athRef > 0 ? ((ltp - athRef) / athRef) * 100 : -100;
  if (fromAthPct >= -2.5 && t.from52wHighPct >= -2.5 && t.isAboveSma50 && t.isAboveSma200) {
    tags.push({
      id: 'ath',
      label: 'All-Time High Territory',
      shortLabel: 'ATH Zone',
      tone: 'bullish',
      group: 'technical',
    });
  }

  // 3. Volume Shockers
  if (t.volumeRatio10d >= 1.65 || t.volumeRatio30d >= 1.8) {
    tags.push({
      id: 'volume_shockers',
      label: 'Volume Shocker',
      shortLabel: `${Math.max(t.volumeRatio10d, t.volumeRatio30d).toFixed(1)}x Vol`,
      tone: 'momentum',
      group: 'technical',
    });
  }

  // 4. Golden Crossover (50 SMA > 200 SMA)
  if (t.sma50 > t.sma200 && t.sma50Vs200Pct >= 0.1 && t.sma50Vs200Pct <= 14 && ltp >= t.sma50 * 0.97) {
    tags.push({
      id: 'golden_cross',
      label: 'Golden Crossover',
      shortLabel: 'Golden Cross',
      tone: 'bullish',
      group: 'technical',
    });
  }

  // 5. Death Crossover (50 SMA < 200 SMA)
  if (t.sma50 < t.sma200 && t.sma50Vs200Pct <= -0.15 && ltp <= t.sma200 * 1.01) {
    tags.push({
      id: 'death_cross',
      label: 'Death Crossover',
      shortLabel: 'Death Cross',
      tone: 'bearish',
      group: 'technical',
    });
  }

  // 6. RSI Oversold Rebound
  if ((t.rsi14 <= 34 || t.prevRsi14 <= 32) && (perChange > -0.3 || t.rsi14 > t.prevRsi14)) {
    tags.push({
      id: 'rsi_oversold',
      label: 'RSI Oversold Rebound',
      shortLabel: 'RSI Oversold',
      tone: 'value',
      group: 'technical',
    });
  }

  // 7. RSI Overbought Momentum
  if (t.rsi14 >= 66 && t.isAboveSma50) {
    tags.push({
      id: 'rsi_overbought',
      label: 'RSI Overbought Momentum',
      shortLabel: 'RSI > 66',
      tone: 'momentum',
      group: 'technical',
    });
  }

  // 8. MACD Bullish Crossover
  if (
    (t.macdHistogram > 0 && t.prevMacdHistogram <= 0.35) ||
    (t.macd > t.macdSignal && t.macdHistogram > t.prevMacdHistogram && perChange > 0)
  ) {
    tags.push({
      id: 'macd_bullish',
      label: 'MACD Bullish Crossover',
      shortLabel: 'MACD Bull',
      tone: 'bullish',
      group: 'technical',
    });
  }

  // 9. Bollinger Band Squeeze / Breakout
  if (
    (t.bbSqueezeRank <= 32 && ltp >= t.bbMiddle) ||
    (ltp >= t.bbUpper * 0.992 && t.volumeRatio10d >= 1.15)
  ) {
    tags.push({
      id: 'bollinger_squeeze',
      label: 'Bollinger Squeeze / Breakout',
      shortLabel: 'BB Breakout',
      tone: 'momentum',
      group: 'technical',
    });
  }

  // 10. 200-DMA Support Bounce
  const dist200Pct = t.sma200 > 0 ? ((ltp - t.sma200) / t.sma200) * 100 : 100;
  if (dist200Pct >= -2.5 && dist200Pct <= 4.5 && perChange >= 0 && f.roe >= 10) {
    tags.push({
      id: 'dma200_bounce',
      label: '200-DMA Support Bounce',
      shortLabel: '200-DMA Bounce',
      tone: 'value',
      group: 'technical',
    });
  }

  // 11. Intraday Movers (High-beta, liquid stocks with strong range/turnover)
  if ((isFnO || turnoverCr >= 40) && (t.intradayRangePct >= 2.6 || Math.abs(perChange) >= 2.0)) {
    tags.push({
      id: 'intraday_movers',
      label: 'Intraday Mover',
      shortLabel: 'Intraday',
      tone: perChange >= 0 ? 'momentum' : 'bearish',
      group: 'thematic',
    });
  }

  // 12. Short-Term Swing Picks (1-4 week momentum setup)
  if (perChange30d >= 3.5 && t.isAboveSma50 && t.rsi14 >= 48 && t.rsi14 <= 74 && t.macdHistogram >= -0.2) {
    tags.push({
      id: 'swing_picks',
      label: 'Short-Term Swing Pick',
      shortLabel: 'Swing Pick',
      tone: 'bullish',
      group: 'thematic',
    });
  }

  // 13. Penny Stocks with Strong Fundamentals (Sub-₹100 / Sub-₹50 with healthy ROE & debt)
  if (ltp > 0 && ltp <= 105 && f.roe >= 8.5 && f.profitMargin >= 5 && f.debtToEquity <= 1.8) {
    tags.push({
      id: 'penny_fundamentals',
      label: ltp <= 50 ? 'Sub-₹50 Strong Fundamentals' : 'Sub-₹100 Strong Fundamentals',
      shortLabel: ltp <= 50 ? 'Sub-₹50 Value' : 'Sub-₹100 Value',
      tone: 'value',
      group: 'thematic',
    });
  }

  // 14. Multibagger Potential (Small/Mid cap with high revenue compounding + margin/ROE quality)
  if (
    (capTier === 'Mid Cap' || capTier === 'Small Cap') &&
    f.revenueGrowth3Y >= 16 &&
    f.profitMargin >= 9 &&
    f.roe >= 13
  ) {
    tags.push({
      id: 'multibagger',
      label: 'Multibagger Potential',
      shortLabel: 'Multibagger',
      tone: 'bullish',
      group: 'thematic',
    });
  }

  return tags;
}

export function computeWeightedStrength(params: {
  ltp: number;
  perChange: number;
  perChange30d: number;
  technicals: TechnicalIndicators;
  fundamentals: FundamentalMetrics;
  benchmark: SectorBenchmark;
  sectorReturn1D: number;
  sectorReturn1M: number;
  signals: ScreenerTag[];
}): StrengthBreakdown {
  const {
    ltp,
    perChange,
    perChange30d,
    technicals: t,
    fundamentals: f,
    benchmark: b,
    sectorReturn1D,
    sectorReturn1M,
    signals,
  } = params;

  const hasSignal = (id: ScreenerTag['id']) => signals.some((s) => s.id === id);

  // Pillar 1: Trend & Moving Averages (Weight 25%)
  let trendScore = 50;
  if (ltp > t.sma20) trendScore += 10;
  else trendScore -= 8;
  if (t.isAboveSma50) trendScore += 15;
  else trendScore -= 14;
  if (t.isAboveSma200) trendScore += 15;
  else trendScore -= 16;
  if (t.sma50 > t.sma200) trendScore += 12;
  else trendScore -= 12;
  if (hasSignal('dma200_bounce')) trendScore += 6;
  trendScore = clamp(Math.round(trendScore), 5, 100);

  // Pillar 2: Momentum Oscillators — RSI & MACD (Weight 20%)
  let momScore = 50;
  if (t.rsi14 >= 55 && t.rsi14 <= 74) momScore += 22;
  else if (t.rsi14 > 74) momScore += 14;
  else if (t.rsi14 >= 45 && t.rsi14 < 55) momScore += 5;
  else if (t.rsi14 <= 32 && perChange > 0) momScore += 8; // oversold bounce
  else if (t.rsi14 < 38) momScore -= 22;
  else momScore -= 10;

  if (t.macd > t.macdSignal) momScore += 14;
  else momScore -= 12;
  if (t.macdHistogram > t.prevMacdHistogram) momScore += 10;
  else momScore -= 8;
  momScore += clamp(perChange * 2.5, -10, 12);
  momScore = clamp(Math.round(momScore), 5, 100);

  // Pillar 3: Breakout & Price Structure (Weight 15%)
  let breakoutScore = 50;
  if (t.from52wHighPct >= -3) breakoutScore += 28;
  else if (t.from52wHighPct >= -10) breakoutScore += 16;
  else if (t.from52wHighPct >= -20) breakoutScore += 4;
  else breakoutScore -= 18;

  if (hasSignal('ath')) breakoutScore += 14;
  if (hasSignal('bollinger_squeeze')) breakoutScore += 12;
  if (perChange30d > 8) breakoutScore += 8;
  else if (perChange30d < -8) breakoutScore -= 12;
  breakoutScore = clamp(Math.round(breakoutScore), 5, 100);

  // Pillar 4: Volume & Institutional Flow (Weight 15%)
  let volScore = 48;
  const maxVolRatio = Math.max(t.volumeRatio10d, t.volumeRatio30d);
  if (maxVolRatio >= 2.2) volScore += perChange >= 0 ? 36 : -22;
  else if (maxVolRatio >= 1.5) volScore += perChange >= 0 ? 24 : -14;
  else if (maxVolRatio >= 1.1) volScore += perChange >= 0 ? 12 : -5;
  else volScore -= 6;
  if (perChange >= 2) volScore += 10;
  else if (perChange <= -2) volScore -= 12;
  volScore = clamp(Math.round(volScore), 5, 100);

  // Pillar 5: Sector Rotation Tailwind (Weight 10%)
  let sectorScore = 50 + sectorReturn1D * 9 + sectorReturn1M * 2.2;
  sectorScore = clamp(Math.round(sectorScore), 10, 100);

  // Pillar 6: Fundamental Quality vs Industry Benchmark (Weight 15%)
  let fundScore = 50;
  if (f.roe >= b.roe) fundScore += 16;
  else if (f.roe >= b.roe * 0.75) fundScore += 4;
  else fundScore -= 14;

  if (f.pe > 0 && f.pe <= b.pe * 1.1) fundScore += 12;
  else if (f.pe > b.pe * 1.8) fundScore -= 10;

  if (f.revenueGrowth3Y >= b.revenueGrowth3Y) fundScore += 12;
  else fundScore -= 6;

  if (f.profitMargin >= b.profitMargin) fundScore += 10;
  else fundScore -= 6;

  if (f.debtToEquity <= b.debtToEquity * 1.15) fundScore += 6;
  else fundScore -= 8;
  fundScore = clamp(Math.round(fundScore), 10, 100);

  const pillars: StrengthPillar[] = [
    {
      key: 'trend',
      label: 'Trend & Moving Averages',
      weight: 25,
      score: trendScore,
      weightedContribution: round2(trendScore * 0.25),
      summary:
        t.sma50 > t.sma200
          ? `Golden alignment (50D ${t.sma50Vs200Pct >= 0 ? '+' : ''}${t.sma50Vs200Pct}% vs 200D)`
          : `Bearish MA alignment (50D ${t.sma50Vs200Pct}% vs 200D)`,
    },
    {
      key: 'momentum',
      label: 'Momentum (RSI & MACD)',
      weight: 20,
      score: momScore,
      weightedContribution: round2(momScore * 0.2),
      summary: `RSI(14) ${t.rsi14} · MACD hist ${t.macdHistogram >= 0 ? '+' : ''}${t.macdHistogram}`,
    },
    {
      key: 'breakout',
      label: 'Breakout & Price Structure',
      weight: 15,
      score: breakoutScore,
      weightedContribution: round2(breakoutScore * 0.15),
      summary: `${t.from52wHighPct >= 0 ? 'At' : `${t.from52wHighPct}% from`} 52W high · BB width ${t.bbBandwidthPct}%`,
    },
    {
      key: 'volume',
      label: 'Volume & Institutional Flow',
      weight: 15,
      score: volScore,
      weightedContribution: round2(volScore * 0.15),
      summary: `${t.volumeRatio10d}x 10D avg · ${t.volumeRatio30d}x 30D avg`,
    },
    {
      key: 'sector',
      label: 'Sector Rotation Tailwind',
      weight: 10,
      score: sectorScore,
      weightedContribution: round2(sectorScore * 0.1),
      summary: `${b.nseIndexName} ${sectorReturn1D >= 0 ? '+' : ''}${round2(sectorReturn1D)}% (1D) · ${sectorReturn1M >= 0 ? '+' : ''}${round2(sectorReturn1M)}% (1M)`,
    },
    {
      key: 'fundamentals',
      label: 'Fundamentals vs Benchmark',
      weight: 15,
      score: fundScore,
      weightedContribution: round2(fundScore * 0.15),
      summary: `P/E ${f.pe}x vs ${b.pe}x · ROE ${f.roe}% vs ${b.roe}%`,
    },
  ];

  const overall = Math.round(pillars.reduce((acc, p) => acc + p.weightedContribution, 0));

  let rating: StrengthBreakdown['rating'] = 'Neutral';
  if (overall >= 74) rating = 'Strong Bullish';
  else if (overall >= 60) rating = 'Bullish';
  else if (overall >= 45) rating = 'Neutral';
  else if (overall >= 32) rating = 'Bearish';
  else rating = 'Strong Bearish';

  return {
    overall,
    rating,
    pillars,
  };
}
