export function formatINR(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatSignedPct(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0.00%';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatVolume(vol: number): string {
  if (!Number.isFinite(vol) || vol <= 0) return '—';
  if (vol >= 1e7) return `${(vol / 1e7).toFixed(2)} Cr`;
  if (vol >= 1e5) return `${(vol / 1e5).toFixed(2)} L`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)} K`;
  return String(Math.round(vol));
}

export function formatTurnoverCr(cr: number): string {
  if (!Number.isFinite(cr) || cr <= 0) return '—';
  if (cr >= 1000) return `₹${(cr / 1000).toFixed(2)}k Cr`;
  return `₹${cr.toFixed(1)} Cr`;
}

export function getTradingViewUrl(symbol: string): string {
  const clean = encodeURIComponent(symbol.trim().toUpperCase());
  return `https://www.tradingview.com/chart/?symbol=NSE%3A${clean}`;
}
