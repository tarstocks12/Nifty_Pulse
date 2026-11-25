import { useMemo, useState } from 'react';
import { Compass } from 'lucide-react';
import type { SectorRotationItem, StockRecord } from '../types/market';
import { formatINR, formatNumber, formatSignedPct } from '../utils/format';
import { getRatingClasses, getTagColorClasses } from '../utils/screenerMeta';
import { SectorRotationChart, Sparkline } from './Charts';
import { SymbolLink } from './SymbolLink';

interface SectorRotationViewProps {
  sectors: SectorRotationItem[];
  stocks: StockRecord[];
  onInspectStock: (stock: StockRecord) => void;
}

function quadrantClasses(q: SectorRotationItem['quadrant']): string {
  switch (q) {
    case 'Leading':
      return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25';
    case 'Improving':
      return 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25';
    case 'Weakening':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25';
    default:
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25';
  }
}

export function SectorRotationView({
  sectors,
  stocks,
  onInspectStock,
}: SectorRotationViewProps) {
  const [selectedSector, setSelectedSector] = useState<string>(sectors[0]?.sector || 'Banking');

  const activeSectorObj = useMemo(
    () => sectors.find((s) => s.sector === selectedSector) || sectors[0],
    [sectors, selectedSector]
  );

  const sectorStocks = useMemo(() => {
    if (!activeSectorObj) return [];
    return stocks
      .filter((s) => s.sector === activeSectorObj.sector)
      .sort((a, b) => b.strength.overall - a.strength.overall);
  }, [stocks, activeSectorObj]);

  return (
    <div className="space-y-6">
      {/* Top 2-Column Split: Relative Rotation Quadrant Chart + Sector Matrix */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-5 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Compass className="w-4 h-4 text-emerald-500" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Sectoral Relative Rotation Map
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Live NSE sectoral indices plotted by 1-Month Relative Strength vs Nifty 50 (X) and 1-Week Momentum (Y). Click any sector node to drill into high-probability constituents.
            </p>
          </div>

          <SectorRotationChart
            sectors={sectors}
            selectedSector={activeSectorObj?.sector || ''}
            onSelectSector={setSelectedSector}
          />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 text-[11px]">
            <div>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">Leading</span>
              <p className="text-slate-500 dark:text-slate-400">Outperforming + rising</p>
            </div>
            <div>
              <span className="font-semibold text-sky-600 dark:text-sky-400">Improving</span>
              <p className="text-slate-500 dark:text-slate-400">Turning up from base</p>
            </div>
            <div>
              <span className="font-semibold text-amber-600 dark:text-amber-400">Weakening</span>
              <p className="text-slate-500 dark:text-slate-400">Losing short-term steam</p>
            </div>
            <div>
              <span className="font-semibold text-rose-600 dark:text-rose-400">Lagging</span>
              <p className="text-slate-500 dark:text-slate-400">Underperforming Nifty</p>
            </div>
          </div>
        </div>

        {/* Sector Performance Matrix */}
        <div className="xl:col-span-7 bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Live NSE Sectoral Rotation Matrix
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-timeframe returns from NSE CM Market Live &amp; Bhavcopy Index Movers
              </p>
            </div>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-2 text-left font-medium">Sector / NSE Index</th>
                  <th className="py-2.5 px-2 text-left font-medium">Phase</th>
                  <th className="py-2.5 px-2 text-right font-medium">1D %</th>
                  <th className="py-2.5 px-2 text-right font-medium">1W %</th>
                  <th className="py-2.5 px-2 text-right font-medium">1M %</th>
                  <th className="py-2.5 px-2 text-right font-medium">RS vs N50</th>
                  <th className="py-2.5 pl-2 pr-4 text-left font-medium">Top Leaders (TV)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sectors.map((sec) => {
                  const active = sec.sector === activeSectorObj?.sector;
                  return (
                    <tr
                      key={sec.sector}
                      onClick={() => setSelectedSector(sec.sector)}
                      className={`cursor-pointer transition-colors ${
                        active
                          ? 'bg-emerald-500/5 dark:bg-emerald-500/10'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-2">
                        <div className="font-semibold text-slate-900 dark:text-white">{sec.sector}</div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {sec.indexName} · {sec.last > 0 ? formatNumber(sec.last, 0) : '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-medium border rounded-xs whitespace-nowrap ${quadrantClasses(
                            sec.quadrant
                          )}`}
                        >
                          {sec.quadrant}
                        </span>
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums font-medium ${
                          sec.change1D >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(sec.change1D, 2)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums ${
                          sec.return1W >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(sec.return1W, 1)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                          sec.return1M >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(sec.return1M, 1)}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-mono tabular-nums ${
                          sec.relativeStrengthVsNifty >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {formatSignedPct(sec.relativeStrengthVsNifty, 1)}
                      </td>
                      <td className="py-2.5 pl-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          {sec.topSymbols.slice(0, 2).map((ts) => (
                            <SymbolLink
                              key={ts.symbol}
                              symbol={ts.symbol}
                              compact
                              onSelect={(sym) => {
                                const found = stocks.find((s) => s.symbol === sym);
                                if (found) onInspectStock(found);
                              }}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Selected Sector Constituent Opportunities */}
      {activeSectorObj && (
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                {activeSectorObj.sector} Constituents — Ranked by Composite Strength
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeSectorObj.indexName} · {activeSectorObj.advancingCount} advancing / {activeSectorObj.decliningCount} declining today · Phase: {activeSectorObj.quadrant}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-2 text-left font-medium">Symbol &amp; Chart</th>
                  <th className="py-2.5 px-2 text-right font-medium">LTP</th>
                  <th className="py-2.5 px-2 text-right font-medium">1D %</th>
                  <th className="py-2.5 px-2 text-right font-medium">30D %</th>
                  <th className="py-2.5 px-2 text-center font-medium">Trend</th>
                  <th className="py-2.5 px-2 text-right font-medium">Strength</th>
                  <th className="py-2.5 px-2 text-right font-medium">RSI(14)</th>
                  <th className="py-2.5 pl-2 pr-4 text-left font-medium">Signals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                {sectorStocks.map((stock) => (
                  <tr
                    key={stock.symbol}
                    onClick={() => onInspectStock(stock)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pl-4 pr-2">
                      <SymbolLink
                        symbol={stock.symbol}
                        name={stock.name}
                        isFnO={stock.isFnO}
                        isNifty50={stock.isNifty50}
                        onSelect={() => onInspectStock(stock)}
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums">
                      {formatINR(stock.ltp)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono font-semibold tabular-nums ${
                        stock.perChange >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatSignedPct(stock.perChange)}
                    </td>
                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums ${
                        stock.perChange30d >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {formatSignedPct(stock.perChange30d, 1)}
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex justify-center">
                        <Sparkline data={stock.sparkline} positive={stock.perChange >= 0} width={78} height={22} />
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono font-bold tabular-nums">
                      <span className={getRatingClasses(stock.strength.rating)}>
                        {stock.strength.overall}/100
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {stock.technicals.rsi14.toFixed(1)}
                    </td>
                    <td className="py-2.5 pl-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {stock.signals.slice(0, 3).map((sig) => (
                          <span
                            key={sig.id}
                            className={`px-1.5 py-0.5 text-[10px] font-medium border rounded-xs whitespace-nowrap ${getTagColorClasses(
                              sig.tone
                            )}`}
                          >
                            {sig.shortLabel}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
