import type { ScreenerCategoryId, ScreenerTag } from '../types/market';

export interface ScreenerDefinition {
  id: ScreenerCategoryId;
  label: string;
  shortLabel: string;
  group: 'all' | 'technical' | 'thematic';
  description: string;
  criteria: string;
  accentClass: string;
}

export const SCREENER_DEFINITIONS: ScreenerDefinition[] = [
  {
    id: 'all',
    label: 'All Screened Stocks',
    shortLabel: 'All Stocks',
    group: 'all',
    description: 'Complete live Nifty F&O and Nifty 500 equity universe ranked by composite technical & fundamental strength.',
    criteria: 'Live CM Market + Bhavcopy EOD technicals',
    accentClass: 'text-slate-600 dark:text-slate-300',
  },
  // Technical Screeners (10)
  {
    id: 'high_52w',
    label: '52-Week High Breakouts',
    shortLabel: '52W High Breakout',
    group: 'technical',
    description: 'Stocks trading within 3% of or breaking above their 1-year peak with sustained upward momentum.',
    criteria: 'Within 3% of 52W High · Positive 1D or 30D momentum',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'ath',
    label: 'All-Time High (ATH) Stocks',
    shortLabel: 'ATH Territory',
    group: 'technical',
    description: 'Companies entering uncharted price territory with minimal overhead supply and bullish moving-average alignment.',
    criteria: 'Within 2.5% of multi-year peak · Above 50 & 200 SMA',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'volume_shockers',
    label: 'Volume Shockers',
    shortLabel: 'Volume Shockers',
    group: 'technical',
    description: 'Unusual surge in traded volume compared to 10-day and 30-day averages, flagging institutional accumulation or distribution.',
    criteria: 'Volume ≥ 1.65× 10D avg or ≥ 1.8× 30D avg',
    accentClass: 'text-sky-600 dark:text-sky-400',
  },
  {
    id: 'golden_cross',
    label: 'Golden Crossover',
    shortLabel: 'Golden Cross',
    group: 'technical',
    description: 'Bullish trend-reversal and continuation setups where the 50-day SMA trades above the 200-day SMA.',
    criteria: '50-DMA > 200-DMA · Price holding near or above 50-DMA',
    accentClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'death_cross',
    label: 'Death Crossover',
    shortLabel: 'Death Cross',
    group: 'technical',
    description: 'Bearish structural setups where the 50-day SMA sits below the 200-day SMA, useful for hedging, shorting, or exit discipline.',
    criteria: '50-DMA < 200-DMA · Price below 200-DMA',
    accentClass: 'text-rose-600 dark:text-rose-400',
  },
  {
    id: 'rsi_oversold',
    label: 'RSI Oversold Rebound',
    shortLabel: 'RSI Oversold',
    group: 'technical',
    description: 'Stocks emerging from oversold RSI conditions showing early mean-reversion or bounce-back momentum.',
    criteria: 'RSI(14) ≤ 34 or prior RSI ≤ 32 · Rebound turn',
    accentClass: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    id: 'rsi_overbought',
    label: 'RSI Overbought Momentum',
    shortLabel: 'RSI Overbought',
    group: 'technical',
    description: 'High-momentum leaders sustaining elevated RSI readings during strong institutional uptrends.',
    criteria: 'RSI(14) ≥ 66 · Trading above 50-DMA',
    accentClass: 'text-sky-600 dark:text-sky-400',
  },
  {
    id: 'macd_bullish',
    label: 'MACD Bullish Crossover',
    shortLabel: 'MACD Bullish',
    group: 'technical',
    description: 'Fresh upward momentum triggers where the MACD line crosses above the 9-day signal line with expanding histogram.',
    criteria: 'MACD > Signal · Rising positive histogram',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'bollinger_squeeze',
    label: 'Bollinger Squeeze / Breakout',
    shortLabel: 'BB Squeeze',
    group: 'technical',
    description: 'Low-volatility consolidation coils breaking out of tight Bollinger Band ranges with volume expansion.',
    criteria: 'Low 20D bandwidth rank or Upper BB breakout',
    accentClass: 'text-violet-600 dark:text-violet-400',
  },
  {
    id: 'dma200_bounce',
    label: '200-DMA Support Bounce',
    shortLabel: '200-DMA Bounce',
    group: 'technical',
    description: 'Fundamentally sound equities pulling back to and rebounding off their long-term 200-day moving average support.',
    criteria: 'Within -2.5% to +4.5% of 200-DMA · Positive day · ROE ≥ 10%',
    accentClass: 'text-teal-600 dark:text-teal-400',
  },
  // Thematic & Horizon Screeners (4)
  {
    id: 'intraday_movers',
    label: 'Intraday Movers',
    shortLabel: 'Intraday Movers',
    group: 'thematic',
    description: 'High-beta, liquid Nifty F&O and Nifty 500 stocks with active intraday range and deep turnover suited for same-day trading.',
    criteria: 'F&O or ≥ ₹40 Cr turnover · Range ≥ 2.6% or |1D %| ≥ 2%',
    accentClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    id: 'swing_picks',
    label: 'Short-Term Swing Picks',
    shortLabel: 'Swing Picks (1–4W)',
    group: 'thematic',
    description: 'Stocks positioned for 1-to-4-week directional momentum moves with healthy RSI headroom and trend support.',
    criteria: '30D Return ≥ 3.5% · Above 50-DMA · RSI 48–74 · Positive MACD',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    id: 'penny_fundamentals',
    label: 'Penny Stocks with Strong Fundamentals',
    shortLabel: 'Sub-₹100 Fundamentals',
    group: 'thematic',
    description: 'Sub-₹50 and sub-₹100 NSE equities backed by positive profitability, healthy ROE, and manageable leverage.',
    criteria: 'LTP ≤ ₹105 · ROE ≥ 8.5% · Profit Margin ≥ 5% · D/E ≤ 1.8',
    accentClass: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    id: 'multibagger',
    label: 'Multibagger Potential',
    shortLabel: 'Multibagger Potential',
    group: 'thematic',
    description: 'Small- and mid-cap companies exhibiting high 3-year revenue compounding, strong profit margins, and capital efficiency.',
    criteria: 'Mid/Small Cap · 3Y Rev CAGR ≥ 16% · Margin ≥ 9% · ROE ≥ 13%',
    accentClass: 'text-emerald-600 dark:text-emerald-400',
  },
];

export const SCREENER_BY_ID = new Map<ScreenerCategoryId, ScreenerDefinition>(
  SCREENER_DEFINITIONS.map((d) => [d.id, d])
);

export function getTagColorClasses(tone: ScreenerTag['tone']): string {
  switch (tone) {
    case 'bullish':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
    case 'bearish':
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25';
    case 'momentum':
      return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25';
    case 'value':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25';
    default:
      return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/25';
  }
}

export function getRatingClasses(rating: string): string {
  switch (rating) {
    case 'Strong Bullish':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'Bullish':
      return 'text-teal-600 dark:text-teal-400';
    case 'Bearish':
      return 'text-orange-600 dark:text-orange-400';
    case 'Strong Bearish':
      return 'text-rose-600 dark:text-rose-400';
    default:
      return 'text-amber-600 dark:text-amber-400';
  }
}
