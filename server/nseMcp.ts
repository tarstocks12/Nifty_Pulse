const CMMKT_URL = 'https://mcp.nseindia.in/cmmkt/mcp';
const BHAVCOPY_URL = 'https://mcp.nseindia.in/bhavcopy/cm/mcp';

const SYMBOL_REGEX = /^[A-Z0-9&-]{1,24}$/;

export function sanitizeSymbol(raw: string): string | null {
  const cleaned = String(raw || '').trim().toUpperCase();
  if (!SYMBOL_REGEX.test(cleaned)) {
    return null;
  }
  return cleaned;
}

interface McpSessionState {
  sessionId: string | null;
  initPromise: Promise<string | null> | null;
  reqId: number;
}

const sessions: Record<string, McpSessionState> = {
  [CMMKT_URL]: { sessionId: null, initPromise: null, reqId: 1 },
  [BHAVCOPY_URL]: { sessionId: null, initPromise: null, reqId: 1 },
};

async function parseMcpHttpResponse(res: Response): Promise<any> {
  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  if (!text) {
    throw new Error(`Empty MCP response (HTTP ${res.status})`);
  }

  if (contentType.includes('text/event-stream') || text.startsWith('event:')) {
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const payload = line.slice(5).trim();
        if (payload) {
          return JSON.parse(payload);
        }
      }
    }
    const idx = text.indexOf('data:');
    if (idx !== -1) {
      return JSON.parse(text.slice(idx + 5).trim());
    }
  }

  return JSON.parse(text);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ensureSession(url: string, forceNew = false): Promise<string | null> {
  const state = sessions[url];
  if (!state) throw new Error('Disallowed MCP endpoint');

  if (!forceNew && state.sessionId) {
    return state.sessionId;
  }

  if (!forceNew && state.initPromise) {
    return state.initPromise;
  }

  state.initPromise = (async () => {
    try {
      const id = state.reqId++;
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'nifty-pulse-screener', version: '1.0.0' },
          },
        }),
      });
      const sid = res.headers.get('mcp-session-id');
      await res.text();
      state.sessionId = sid;
      return sid;
    } finally {
      state.initPromise = null;
    }
  })();

  return state.initPromise;
}

async function callMcpTool<T = any>(
  url: typeof CMMKT_URL | typeof BHAVCOPY_URL,
  toolName: string,
  args: Record<string, unknown>,
  retry = true
): Promise<T> {
  const state = sessions[url];
  const sessionId = await ensureSession(url, false);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: state.reqId++,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });

  if ((res.status === 400 || res.status === 404 || res.status === 410) && retry) {
    state.sessionId = null;
    await ensureSession(url, true);
    return callMcpTool<T>(url, toolName, args, false);
  }

  const parsed = await parseMcpHttpResponse(res);
  if (parsed?.error) {
    if (retry && /session/i.test(String(parsed.error.message || ''))) {
      state.sessionId = null;
      await ensureSession(url, true);
      return callMcpTool<T>(url, toolName, args, false);
    }
    throw new Error(`NSE MCP ${toolName} error: ${parsed.error.message || 'Unknown error'}`);
  }

  const textContent = parsed?.result?.content?.[0]?.text;
  if (typeof textContent !== 'string') {
    return parsed?.result as T;
  }

  try {
    return JSON.parse(textContent) as T;
  } catch {
    // Some tools like moving_average return a plain numeric string
    const asNum = Number(textContent.trim());
    if (!Number.isNaN(asNum)) {
      return asNum as unknown as T;
    }
    return textContent as unknown as T;
  }
}

export const nseMcp = {
  // CM Market Live (https://mcp.nseindia.in/cmmkt/mcp)
  getLiveIndices: () =>
    callMcpTool<{
      nseTimestamp?: string;
      updatedAt?: string;
      returned?: number;
      indices?: Record<string, Array<{
        indexName: string;
        last: number;
        previousClose: number;
        change: number;
        percChange: number;
        open: number;
        high: number;
        low: number;
        timeVal: string;
      }>>;
    }>(CMMKT_URL, 'cm_get_live_indices', {}),

  getLiveMarketData: (index: 'gainers' | 'loosers') =>
    callMcpTool<any>(CMMKT_URL, 'cm_get_live_market_data', { index }),

  getEquityStocks: (limit = 500, symbolFilter = '') =>
    callMcpTool<{
      updatedAt?: string;
      returned?: number;
      stocks?: Array<{
        symbol: string;
        series: string;
        openPrice: number;
        highPrice: number;
        lowPrice: number;
        preClosePrice: number;
        lastTradedPrice: number;
        change: number;
        perChange: number;
        volume: number;
        value: number;
        fiftyTwoWeekHigh: number;
        fiftyTwoWeekLow: number;
        perChange30d: number;
        latestTimestamp: string;
      }>;
    }>(CMMKT_URL, 'cm_get_equity_stocks', { limit, symbolFilter }),

  getLiveStockQuote: (symbol: string) =>
    callMcpTool<{
      updatedAt?: string;
      stock?: {
        symbol: string;
        series: string;
        openPrice: number;
        highPrice: number;
        lowPrice: number;
        preClosePrice: number;
        lastTradedPrice: number;
        change: number;
        perChange: number;
        volume: number;
        value: number;
        fiftyTwoWeekHigh: number;
        fiftyTwoWeekLow: number;
        perChange30d: number;
        latestTimestamp: string;
      };
    }>(CMMKT_URL, 'cm_get_stock_quote', { symbol }),

  // NSE Bhavcopy EOD (https://mcp.nseindia.in/bhavcopy/cm/mcp)
  getMarketBreadth: (date = 'today') =>
    callMcpTool<{
      date: string;
      total_stocks: number;
      advances: number;
      declines: number;
      unchanged: number;
      ad_ratio: number;
      total_volume: number;
    }>(BHAVCOPY_URL, 'get_market_breadth', { date }),

  getBulkQuote: (symbols: string[]) =>
    callMcpTool<{
      quotes?: Array<{
        symbol: string;
        close: number;
        open: number;
        high: number;
        low: number;
        prev_close: number;
        pct_change: number;
        volume: number;
        date: string;
      }>;
    }>(BHAVCOPY_URL, 'get_bulk_quote', { symbols: symbols.slice(0, 50) }),

  getStockHistory: (symbol: string, months = 3, endDate = 'today') =>
    callMcpTool<{
      symbol: string;
      from_date?: string;
      to_date?: string;
      trading_days?: number;
      summary?: {
        first_close: number;
        last_close: number;
        avg_daily_vol: number;
        period_high: number;
        period_low: number;
        return_pct: number;
      };
      data?: Array<{
        symbol: string;
        open: number;
        high: number;
        low: number;
        close: number;
        prevClose: number;
        volume: number;
        totalTradedValue?: number;
        date?: string;
        tradeDate?: string;
        timestamp?: string;
      }>;
    }>(BHAVCOPY_URL, 'get_stock_history', { symbol, months, endDate }),

  getMovingAverage: (symbol: string, days: number) =>
    callMcpTool<number | { moving_average?: number; value?: number; sma?: number }>(
      BHAVCOPY_URL,
      'moving_average',
      { symbol, days }
    ),

  get52WeekHighLow: (symbol: string) =>
    callMcpTool<{
      symbol: string;
      last_close: number;
      '52w_high': number;
      '52w_low': number;
      from_52w_high_pct: number;
      from_52w_low_pct: number;
      position_in_range_pct: number;
    }>(BHAVCOPY_URL, 'get_52_week_high_low', { symbol }),

  getVolumeAnalysis: (symbol: string, days = 30) =>
    callMcpTool<{
      symbol: string;
      avg_volume: number;
      last_volume: number;
      last_vs_avg_pct: number;
      volume_spike_days: number;
    }>(BHAVCOPY_URL, 'get_volume_analysis', { symbol, days }),

  getIndexMovers: (period: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y', n = 50) =>
    callMcpTool<{
      date: string;
      period: string;
      gainers?: Array<{ index: string; close: number; return_pct: number; base_close: number }>;
      losers?: Array<{ index: string; close: number; return_pct: number; base_close: number }>;
    }>(BHAVCOPY_URL, 'get_index_movers', { date: 'today', period, n, scope: 'equity' }),

  lookupSymbol: (query: string) =>
    callMcpTool<any>(BHAVCOPY_URL, 'nse_lookup_symbol', { query }),
};
