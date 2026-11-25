import type { ScreenerCategoryId, ScreenerTag } from '../types/market.ts';

export function getTradingViewUrl(symbol: string): string {
  const clean = encodeURIComponent(symbol.trim().toUpperCase());
  return `https://www.tradingview.com/chart/?symbol=NSE:${clean}`;
}

export function formatINR(value: number): string {
  if (!Number.isFinite(value)) return '₹0.00';
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatIndexLevel(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—';
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPct(value: number, showPlus = true): string {
  if (!Number.isFinite(value)) return '0.00%';
  const prefix = showPlus && value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function formatIndianVolume(vol: number): string {
  if (!Number.isFinite(vol) || vol <= 0) return '0';
  if (vol >= 1e7) return `${(vol / 1e7).toFixed(2)} Cr`;
  if (vol >= 1e5) return `${(vol / 1e5).toFixed(2)} L`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)} K`;
  return String(Math.round(vol));
}

export function formatCr(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '—';
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)}L Cr`;
  return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
}

export function getTagToneClasses(tone: ScreenerTag['tone']): string {
  switch (tone) {
    case 'bullish':
      return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border-emerald-500/25';
    case 'bearish':
      return 'bg-rose-500/12 text-rose-700 dark:text-rose-400 border-rose-500/25';
    case 'momentum':
      return 'bg-sky-500/12 text-sky-700 dark:text-sky-400 border-sky-500/25';
    case 'value':
      return 'bg-amber-500/12 text-amber-700 dark:text-amber-400 border-amber-500/25';
    default:
      return 'bg-slate-500/12 text-slate-700 dark:text-slate-300 border-slate-500/25';
  }
}

export function getStrengthColor(score: number): {
  text: string;
  bar: string;
  ring: string;
  surface: string;
} {
  if (score >= 74) {
    return {
      text: 'text-emerald-600 dark:text-emerald-400',
      bar: 'bg-emerald-500',
      ring: '#10b981',
      surface: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (score >= 60) {
    return {
      text: 'text-teal-600 dark:text-teal-400',
      bar: 'bg-teal-500',
      ring: '#14b8a6',
      surface: 'bg-teal-500/10 text-teal-700 dark:text-teal-300',
    };
  }
  if (score >= 45) {
    return {
      text: 'text-amber-600 dark:text-amber-400',
      bar: 'bg-amber-500',
      ring: '#f59e0b',
      surface: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    };
  }
  if (score >= 32) {
    return {
      text: 'text-orange-600 dark:text-orange-400',
      bar: 'bg-orange-500',
      ring: '#f97316',
      surface: 'bg-orange-500/10 text-orange-700 dark:text-orange-300',
    };
  }
  return {
    text: 'text-rose-600 dark:text-rose-400',
    bar: 'bg-rose-500',
    ring: '#ef4444',
    surface: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  };
}

export interface ScreenerCategoryMeta {
  id: ScreenerCategoryId;
  label: string;
  shortLabel: string;
  group: 'all' | 'technical' | 'thematic';
  description: string;
  ruleSummary: string;
  accent: 'emerald' | 'rose' | 'sky' | 'amber' | 'slate';
}

export const SCREENER_CATEGORIES: ScreenerCategoryMeta[] = [
  {
    id: 'all',
    label: 'All Screened Stocks',
    shortLabel: 'All Signals',
    group: 'all',
    description: 'Complete live Nifty F&O and Nifty 500 universe ranked by weighted overall strength.',
    ruleSummary: 'Full live NSE MCP universe',
    accent: 'slate',
  },
  // Technical Screeners (10)
  {
    id: 'high_52w',
    label: '52-Week High Breakouts',
    shortLabel: '52W High Breakouts',
    group: 'technical',
    description: 'Stocks trading at or within 3% of their 1-year peak with active upward price momentum.',
    ruleSummary: 'Within 3% of 52W High · Positive trend',
    accent: 'emerald',
  },
  {
    id: 'ath',
    label: 'All-Time High (ATH) Stocks',
    shortLabel: 'ATH Territory',
    group: 'technical',
    description: 'Companies pushing into uncharted multi-year price territory above 50 & 200-DMA with minimal overhead supply.',
    ruleSummary: 'Near multi-year peak · Above 50 & 200 SMA',
    accent: 'emerald',
  },
  {
    id: 'volume_shockers',
    label: 'Volume Shockers',
    shortLabel: 'Volume Shockers',
    group: 'technical',
    description: 'Equities experiencing abnormal volume surges compared to 10-day and 30-day average turnover.',
    ruleSummary: 'Volume ≥ 1.65x 10D avg or ≥ 1.8x 30D avg',
    accent: 'sky',
  },
  {
    id: 'golden_cross',
    label: 'Golden Crossover',
    shortLabel: 'Golden Cross',
    group: 'technical',
    description: 'Bullish trend-reversal and alignment setups where the 50-day SMA trades above the 200-day SMA.',
    ruleSummary: '50-DMA > 200-DMA · Bullish alignment',
    accent: 'emerald',
  },
  {
    id: 'death_cross',
    label: 'Death Crossover',
    shortLabel: 'Death Cross',
    group: 'technical',
    description: 'Bearish technical structures where the 50-day SMA crosses below the 200-day SMA for risk management or shorts.',
    ruleSummary: '50-DMA < 200-DMA · Bearish structure',
    accent: 'rose',
  },
  {
    id: 'rsi_oversold',
    label: 'RSI Oversold Rebound',
    shortLabel: 'RSI Oversold',
    group: 'technical',
    description: 'Stocks with 14-day RSI in oversold territory showing early mean-reversion bounce signals.',
    ruleSummary: 'RSI(14) ≤ 34 · Turning upward',
    accent: 'amber',
  },
  {
    id: 'rsi_overbought',
    label: 'RSI Overbought Momentum',
    shortLabel: 'RSI Overbought',
    group: 'technical',
    description: 'Strong trend leaders sustaining elevated RSI above 66–70 during institutional accumulation phases.',
    ruleSummary: 'RSI(14) ≥ 66 · Trading above 50-DMA',
    accent: 'sky',
  },
  {
    id: 'macd_bullish',
    label: 'MACD Bullish Crossover',
    shortLabel: 'MACD Bullish',
    group: 'technical',
    description: 'Fresh upward momentum where the MACD (12,26) line crosses above its 9-day signal line with rising histogram.',
    ruleSummary: 'MACD > Signal · Expanding positive histogram',
    accent: 'emerald',
  },
  {
    id: 'bollinger_squeeze',
    label: 'Bollinger Squeeze / Breakout',
    shortLabel: 'Bollinger Squeeze',
    group: 'technical',
    description: 'Low-volatility consolidation coils breaking above the middle or upper Bollinger Band on expanding participation.',
    ruleSummary: 'Tight 20D BB bandwidth or Upper Band breakout',
    accent: 'sky',
  },
  {
    id: 'dma200_bounce',
    label: '200-DMA Support Bounce',
    shortLabel: '200-DMA Bounce',
    group: 'technical',
    description: 'Fundamentally sound equities pulling back near their 200-day moving average and rebounding cleanly.',
    ruleSummary: 'Within -2.5% to +4.5% of 200-DMA · Positive rebound · ROE ≥ 10%',
    accent: 'amber',
  },
  // Thematic & Horizon-Based Screeners (4)
  {
    id: 'intraday_movers',
    label: 'Intraday Movers',
    shortLabel: 'Intraday Movers',
    group: 'thematic',
    description: 'High-beta, liquid F&O and Nifty 500 names with wide intraday ranges and high turnover for same-day trading.',
    ruleSummary: 'F&O / ₹40Cr+ turnover · Intraday range ≥ 2.6% or |1D| ≥ 2%',
    accent: 'sky',
  },
  {
    id: 'swing_picks',
    label: 'Short-Term Swing Picks',
    shortLabel: 'Swing Picks (1–4W)',
    group: 'thematic',
    description: 'Momentum leaders positioned for 1-to-4-week directional continuation above key moving averages.',
    ruleSummary: '30D Return ≥ 3.5% · Above 50-DMA · RSI 48–74',
    accent: 'emerald',
  },
  {
    id: 'penny_fundamentals',
    label: 'Penny Stocks with Strong Fundamentals',
    shortLabel: 'Sub-₹100 Fundamentals',
    group: 'thematic',
    description: 'Sub-₹50 and sub-₹100 NSE equities backed by positive return on equity, healthy margins, and controlled leverage.',
    ruleSummary: 'Price ≤ ₹100 · ROE ≥ 8.5% · Margin ≥ 5% · Controlled D/E',
    accent: 'amber',
  },
  {
    id: 'multibagger',
    label: 'Multibagger Potential',
    shortLabel: 'Multibagger Potential',
    group: 'thematic',
    description: 'Small- and mid-cap growth compounders delivering 16%+ 3Y revenue CAGR, expanding profit margins, and strong ROE.',
    ruleSummary: 'Mid/Small Cap · 3Y Rev CAGR ≥ 16% · OPM ≥ 9% · ROE ≥ 13%',
    accent: 'emerald',
  },
];
