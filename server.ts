import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  getDashboardData,
  getStockDeepDetail,
  searchNseSymbols,
} from './server/marketService.ts';
import { sanitizeSymbol } from './server/nseMcp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '64kb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Main live dashboard payload (indices, breadth, top 20 bullish/bearish, full universe screener, sectoral rotation)
  app.get('/api/dashboard', async (req, res) => {
    try {
      const force = req.query.refresh === '1' || req.query.refresh === 'true';
      const data = await getDashboardData(force);
      res.setHeader('Cache-Control', 'no-store');
      res.json(data);
    } catch (err: any) {
      console.error('[API /dashboard] Error:', err?.message || err);
      res.status(502).json({
        error: 'Unable to fetch live NSE market feeds. Please retry in a moment.',
      });
    }
  });

  // Deep single-symbol strength & technical analysis (supports all 3,500+ NSE stocks)
  app.get('/api/stock/:symbol', async (req, res) => {
    const cleanSymbol = sanitizeSymbol(req.params.symbol);
    if (!cleanSymbol) {
      res.status(400).json({ error: 'Invalid NSE stock symbol format.' });
      return;
    }
    try {
      const detail = await getStockDeepDetail(cleanSymbol);
      if (!detail) {
        res.status(404).json({ error: `No NSE data found for symbol ${cleanSymbol}.` });
        return;
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json(detail);
    } catch (err: any) {
      console.error(`[API /stock/${cleanSymbol}] Error:`, err?.message || err);
      res.status(502).json({ error: `Failed to fetch live NSE data for ${cleanSymbol}.` });
    }
  });

  // Live NSE symbol search across curated universe + 3,500+ Bhavcopy equities
  app.get('/api/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q || q.length > 30) {
      res.json({ results: [] });
      return;
    }
    try {
      const results = await searchNseSymbols(q);
      res.json({ results });
    } catch (err: any) {
      console.error('[API /search] Error:', err?.message || err);
      res.status(502).json({ results: [], error: 'Search temporarily unavailable.' });
    }
  });

  // Warm cache right after startup in background
  getDashboardData(false).catch((err) => {
    console.warn('[Warmup] Initial NSE MCP fetch deferred:', err?.message || err);
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NiftyPulse NSE Screener running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
