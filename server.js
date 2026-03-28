const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 300 });

// --- Middleware ---
app.use(cors());
app.use(helmet({ frameguard: false, contentSecurityPolicy: false }));
app.use(express.json());
app.use(express.static('public'));
app.set('trust proxy', 1);

const limiter = rateLimit({ windowMs: 60000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api/', limiter);

// --- Marketplace Fee Structures (real 2024-2025 rates) ---
const MARKETPLACE_FEES = {
  stockx: {
    name: 'StockX',
    sellerFee: 0.095,
    paymentProc: 0.03,
    shipping: 13.95
  },
  goat: {
    name: 'GOAT',
    commission: 0.095,
    cashoutFee: 0.029,
    shipping: 9.95
  },
  ebay: {
    name: 'eBay',
    finalValueFee: 0.129,
    perOrderFee: 0.30,
    shipping: 14.00
  }
};

// --- Browser-like headers for StockX SSR fetch ---
const STOCKX_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1'
};

// --- Search StockX via SSR (scrape __NEXT_DATA__) ---
async function searchStockX(query, limit = 20) {
  const cacheKey = `sx:${query}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const url = `https://stockx.com/search?s=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: STOCKX_HEADERS,
    redirect: 'follow'
  });

  if (!response.ok) throw new Error(`StockX SSR ${response.status}`);
  const html = await response.text();

  // Extract __NEXT_DATA__ JSON from SSR HTML
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No __NEXT_DATA__ found in StockX response');

  let nextData;
  try {
    nextData = JSON.parse(match[1]);
  } catch (e) {
    throw new Error('Failed to parse __NEXT_DATA__ JSON');
  }

  // Navigate to browse results - find the query that has browse data
  let edges = [];
  try {
    const queries = nextData.props.pageProps.req.appContext.states.query.value.queries;
    for (const q of queries) {
      const browse = q?.state?.data?.browse;
      if (browse && browse.results && browse.results.edges) {
        edges = browse.results.edges;
        break;
      }
    }
  } catch (e) {
    // Try alternative path structures
    try {
      const dehydratedState = nextData.props.pageProps.dehydratedState;
      if (dehydratedState && dehydratedState.queries) {
        for (const q of dehydratedState.queries) {
          const browse = q?.state?.data?.browse;
          if (browse && browse.results && browse.results.edges) {
            edges = browse.results.edges;
            break;
          }
        }
      }
    } catch (e2) {
      // ignore
    }
  }

  if (edges.length === 0) {
    // Last resort: try to find browse results anywhere in the JSON
    const jsonStr = match[1];
    const browseMatch = jsonStr.match(/"browse"\s*:\s*\{[^]*?"edges"\s*:\s*\[/);
    if (browseMatch) {
      // Fallback - return empty rather than crash
      console.warn('Found browse key but could not parse edges');
    }
    // Return empty results rather than throwing
    cache.set(cacheKey, []);
    return [];
  }

  const results = edges.slice(0, limit).map(edge => transformSSRNode(edge.node)).filter(s => s.name !== 'Unknown');
  cache.set(cacheKey, results);
  return results;
}

// --- Transform SSR Node to Clean Object ---
function transformSSRNode(node) {
  if (!node) return { name: 'Unknown' };

  // Market data
  const market = node.market || {};
  const state = market.state || {};
  const stats = market.statistics || {};

  const lowestAsk = state.lowestAsk ? state.lowestAsk.amount : null;
  const highestBid = state.highestBid ? state.highestBid.amount : null;
  const lastSale = stats.lastSale ? stats.lastSale.amount : null;
  const salesLast72h = stats.last72Hours ? stats.last72Hours.salesCount : 0;

  // Retail price from traits
  let retail = null;
  if (node.traits && Array.isArray(node.traits)) {
    const retailTrait = node.traits.find(t => t.name === 'Retail Price');
    if (retailTrait && retailTrait.value) {
      retail = parseFloat(retailTrait.value.replace(/[^0-9.]/g, ''));
    }
  }

  // Release date from traits
  let releaseDate = '';
  if (node.traits && Array.isArray(node.traits)) {
    const releaseTrait = node.traits.find(t => t.name === 'Release Date');
    if (releaseTrait) releaseDate = releaseTrait.value || '';
  }

  // Spread calculation
  let spread = null;
  let spreadPct = null;
  const marketPrice = lowestAsk || lastSale;
  if (marketPrice && retail && retail > 0) {
    spread = marketPrice - retail;
    spreadPct = Math.round((spread / retail) * 100);
  }

  // Media
  const media = node.media || {};

  return {
    id: node.id || node.urlKey || '',
    name: node.name || node.title || 'Unknown',
    brand: node.brand || '',
    colorway: node.colorway || '',
    styleID: node.styleId || node.sku || '',
    retail: retail,
    lowestAsk: lowestAsk,
    highestBid: highestBid,
    lastSale: lastSale,
    spread: spread,
    spreadPct: spreadPct,
    totalSales: stats.totalSales || 0,
    salesLast72h: salesLast72h,
    pricePremium: null,
    thumbnail: media.thumbUrl || media.smallImageUrl || '',
    image: media.imageUrl || media.thumbUrl || '',
    url: node.urlKey ? 'https://stockx.com/' + node.urlKey : '',
    releaseDate: releaseDate,
    category: node.productCategory || 'sneakers',
    source: 'stockx-live'
  };
}

// --- Calculate Profit for a Marketplace ---
function calculateProfit(sellPrice, buyPrice, marketplace) {
  const fees = MARKETPLACE_FEES[marketplace];
  if (!fees) return null;

  let totalFees = 0;
  let feeBreakdown = {};

  if (marketplace === 'stockx') {
    const sf = sellPrice * fees.sellerFee;
    const pp = sellPrice * fees.paymentProc;
    totalFees = sf + pp + fees.shipping;
    feeBreakdown = { sellerFee: r2(sf), paymentProcessing: r2(pp), shipping: fees.shipping };
  } else if (marketplace === 'goat') {
    const cm = sellPrice * fees.commission;
    const co = sellPrice * fees.cashoutFee;
    totalFees = cm + co + fees.shipping;
    feeBreakdown = { commission: r2(cm), cashoutFee: r2(co), shipping: fees.shipping };
  } else if (marketplace === 'ebay') {
    const fvf = sellPrice * fees.finalValueFee + fees.perOrderFee;
    totalFees = fvf + fees.shipping;
    feeBreakdown = { finalValueFee: r2(fvf), shipping: fees.shipping };
  }

  const payout = sellPrice - totalFees;
  const netProfit = payout - buyPrice;
  const roi = buyPrice > 0 ? (netProfit / buyPrice) * 100 : 0;

  return {
    marketplace: fees.name,
    sellPrice, buyPrice,
    totalFees: r2(totalFees),
    feeBreakdown,
    payout: r2(payout),
    netProfit: r2(netProfit),
    roi: r1(roi)
  };
}

function r2(n) { return Math.round(n * 100) / 100; }
function r1(n) { return Math.round(n * 10) / 10; }

// =====================
//     API ROUTES
// =====================

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), cacheStats: cache.getStats() });
});

// Search
app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.json({ source: 'stockx-live', results: [], query: '' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 40);
    const results = await searchStockX(query, limit);
    res.json({ source: 'stockx-live', results, query });
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed', message: err.message });
  }
});

// Trending
app.get('/api/trending', async (req, res) => {
  const cacheKey = 'trending-v2';
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 50);
    const queries = ['Jordan 1', 'Yeezy', 'Dunk Low', 'Travis Scott', 'New Balance'];
    const allResults = [];
    const seen = new Set();

    for (const q of queries) {
      try {
        const hits = await searchStockX(q, 12);
        for (const hit of hits) {
          if (!seen.has(hit.id) && hit.lowestAsk) {
            seen.add(hit.id);
            allResults.push(hit);
          }
        }
      } catch (e) {
        console.error(`Trending query "${q}" failed:`, e.message);
      }
    }

    // Sort by spread (highest profit potential first)
    allResults.sort((a, b) => {
      const spreadA = a.spread || 0;
      const spreadB = b.spread || 0;
      return spreadB - spreadA;
    });

    const trending = allResults.slice(0, limit);
    const result = { source: 'stockx-live', results: trending, count: trending.length, updatedAt: new Date().toISOString() };
    cache.set(cacheKey, result, 600);
    res.json(result);
  } catch (err) {
    console.error('Trending error:', err.message);
    res.status(500).json({ error: 'Failed to load trending' });
  }
});

// Profit Calculator
app.get('/api/profit', (req, res) => {
  const sell = parseFloat(req.query.sell);
  const buy = parseFloat(req.query.buy);
  if (isNaN(sell) || isNaN(buy)) return res.status(400).json({ error: 'sell and buy params required (numbers)' });

  const all = {};
  for (const mp of Object.keys(MARKETPLACE_FEES)) {
    all[mp] = calculateProfit(sell, buy, mp);
  }
  res.json({ allMarketplaces: all });
});

// Fee structures (for frontend display)
app.get('/api/fees', (req, res) => {
  res.json(MARKETPLACE_FEES);
});

// --- Keep-Alive Self-Ping (prevents Render free tier sleep) ---
const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://soleping-api.onrender.com';
setInterval(() => {
  fetch(SELF_URL + '/api/health').catch(() => {});
}, 10 * 60 * 1000);

// --- Start ---
app.listen(PORT, () => {
  console.log('=== SolePing API ===');
  console.log('Port:', PORT);
  console.log('Data: StockX SSR (LIVE pricing)');
  console.log('Keep-alive: every 10 min');
  console.log('=======================');
});
