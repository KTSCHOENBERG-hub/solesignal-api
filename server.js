const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 300 });

// --- Load got-scraping (ESM) dynamically ---
let gotScraping = null;
async function getGot() {
  if (!gotScraping) {
    const mod = await import('got-scraping');
    gotScraping = mod.gotScraping;
  }
  return gotScraping;
}

// --- Persistent cookie jar for StockX sessions ---
let stockxCookies = '';
let cookieTimestamp = 0;

async function ensureStockXCookies() {
  const now = Date.now();
  // Refresh cookies every 10 minutes
  if (stockxCookies && (now - cookieTimestamp) < 600000) return stockxCookies;

  const got = await getGot();
  try {
    const resp = await got({
      url: 'https://stockx.com/',
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 126 }],
        devices: ['desktop'],
        operatingSystems: ['windows'],
      },
      responseType: 'text',
      followRedirect: true,
      timeout: { request: 15000 },
      retry: { limit: 1 },
    });
    // Extract set-cookie headers
    const setCookies = resp.headers['set-cookie'];
    if (setCookies) {
      stockxCookies = (Array.isArray(setCookies) ? setCookies : [setCookies])
        .map(c => c.split(';')[0])
        .join('; ');
      cookieTimestamp = now;
    }
  } catch (e) {
    console.warn('Cookie prefetch failed:', e.message);
  }
  return stockxCookies;
}

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

// --- Method 1: StockX GraphQL API (less likely to be CF-blocked) ---
async function searchStockXGraphQL(query, limit) {
  const got = await getGot();
  const cookies = await ensureStockXCookies();

  const graphqlBody = JSON.stringify({
    query: `query Browse($query: String!, $first: Int) {
      browse(query: $query, first: $first) {
        results { edges { node {
          id urlKey name brand colorway styleId
          market { state { lowestAsk { amount } highestBid { amount } }
                   statistics { lastSale { amount } totalSales last72Hours { salesCount } } }
          media { thumbUrl smallImageUrl imageUrl }
          traits { name value }
          productCategory
        } } }
      }
    }`,
    variables: { query, first: limit }
  });

  const resp = await got({
    url: 'https://stockx.com/api/p/e',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'accept-language': 'en-US,en;q=0.9',
      'apollographql-client-name': 'Iron',
      'apollographql-client-version': '2024.07.08.00',
      'x-stockx-device-id': crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
      'origin': 'https://stockx.com',
      'referer': 'https://stockx.com/search?s=' + encodeURIComponent(query),
      ...(cookies ? { 'cookie': cookies } : {})
    },
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 126 }],
      devices: ['desktop'],
      operatingSystems: ['windows'],
    },
    body: graphqlBody,
    responseType: 'text',
    followRedirect: true,
    timeout: { request: 15000 },
    retry: { limit: 1 },
  });

  if (resp.statusCode >= 400) throw new Error('GraphQL ' + resp.statusCode);

  const data = JSON.parse(resp.body);
  if (!data.data || !data.data.browse) throw new Error('No browse data in GraphQL response');

  const edges = data.data.browse.results.edges || [];
  return edges.slice(0, limit).map(e => transformSSRNode(e.node)).filter(s => s.name !== 'Unknown');
}

// --- Method 2: StockX SSR HTML scraping with cookie session ---
async function searchStockXSSR(query, limit) {
  const got = await getGot();
  const cookies = await ensureStockXCookies();
  const url = 'https://stockx.com/search?s=' + encodeURIComponent(query);

  const { body: html, statusCode } = await got({
    url,
    headers: {
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      'upgrade-insecure-requests': '1',
      ...(cookies ? { 'cookie': cookies } : {})
    },
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 120, maxVersion: 126 }],
      devices: ['desktop'],
      operatingSystems: ['windows'],
    },
    responseType: 'text',
    followRedirect: true,
    timeout: { request: 15000 },
    retry: { limit: 2 },
  });

  if (statusCode >= 400) throw new Error('StockX SSR ' + statusCode);

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No __NEXT_DATA__ found');

  const nextData = JSON.parse(match[1]);
  let edges = [];
  try {
    const queries = nextData.props.pageProps.req.appContext.states.query.value.queries;
    for (const q of queries) {
      const browse = q?.state?.data?.browse;
      if (browse && browse.results && browse.results.edges) { edges = browse.results.edges; break; }
    }
  } catch (e) {
    try {
      const ds = nextData.props.pageProps.dehydratedState;
      if (ds && ds.queries) {
        for (const q of ds.queries) {
          const browse = q?.state?.data?.browse;
          if (browse && browse.results && browse.results.edges) { edges = browse.results.edges; break; }
        }
      }
    } catch (e2) {}
  }

  if (edges.length === 0) throw new Error('No edges in SSR');
  return edges.slice(0, limit).map(e => transformSSRNode(e.node)).filter(s => s.name !== 'Unknown');
}

// --- Method 3: TheSneakerDatabase API (always works, retail prices only) ---
async function searchSneakerDB(query, limit) {
  const got = await getGot();
  const url = 'https://api.thesneakerdatabase.com/v2/sneakers?limit=' + limit + '&name=' + encodeURIComponent(query);

  const resp = await got({
    url,
    responseType: 'text',
    timeout: { request: 10000 },
    retry: { limit: 2 },
  });

  if (resp.statusCode >= 400) throw new Error('SneakerDB ' + resp.statusCode);

  const data = JSON.parse(resp.body);
  const results = (data.results || []).map(s => {
    const retail = s.retailPrice || null;
    // Estimate market price: typically 1.0x-1.5x retail for popular shoes
    const estimatedMarket = retail ? Math.round(retail * 1.15) : null;
    return {
      id: s.id || '',
      name: s.name || s.title || 'Unknown',
      brand: s.brand || '',
      colorway: s.colorway || '',
      styleID: s.styleId || s.sku || '',
      retail: retail,
      lowestAsk: estimatedMarket,
      highestBid: estimatedMarket ? Math.round(estimatedMarket * 0.9) : null,
      lastSale: estimatedMarket,
      spread: estimatedMarket && retail ? estimatedMarket - retail : null,
      spreadPct: estimatedMarket && retail ? Math.round(((estimatedMarket - retail) / retail) * 100) : null,
      totalSales: 0,
      salesLast72h: 0,
      pricePremium: null,
      thumbnail: (s.media && (s.media.smallImageUrl || s.media.thumbUrl)) || s.thumbnail || '',
      image: (s.media && (s.media.imageUrl || s.media.smallImageUrl)) || s.thumbnail || '',
      url: s.links && s.links.stockX ? s.links.stockX : '',
      releaseDate: s.releaseDate || '',
      category: 'sneakers',
      source: 'sneakerdb-estimated'
    };
  });
  return results.filter(s => s.name !== 'Unknown');
}

// --- Combined search: try methods in order ---
async function searchStockX(query, limit = 20) {
  const cacheKey = 'sx:' + query + ':' + limit;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const methods = [
    { name: 'graphql', fn: () => searchStockXGraphQL(query, limit) },
    { name: 'ssr', fn: () => searchStockXSSR(query, limit) },
    { name: 'sneakerdb', fn: () => searchSneakerDB(query, limit) }
  ];

  let lastError = null;
  for (const method of methods) {
    try {
      console.log('Trying ' + method.name + ' for: ' + query);
      const results = await method.fn();
      if (results.length > 0) {
        console.log('Success via ' + method.name + ': ' + results.length + ' results');
        // Cache longer for fallback sources (less real-time)
        const ttl = method.name === 'sneakerdb' ? 1800 : 300;
        cache.set(cacheKey, results, ttl);
        return results;
      }
    } catch (e) {
      console.warn(method.name + ' failed:', e.message);
      lastError = e;
    }
  }

  console.error('All search methods failed for:', query, lastError?.message);
  cache.set(cacheKey, [], 60);
  return [];
}

// --- Transform SSR Node to Clean Object ---
function transformSSRNode(node) {
  if (!node) return { name: 'Unknown' };

  const market = node.market || {};
  const state = market.state || {};
  const stats = market.statistics || {};

  const lowestAsk = state.lowestAsk ? state.lowestAsk.amount : null;
  const highestBid = state.highestBid ? state.highestBid.amount : null;
  const lastSale = stats.lastSale ? stats.lastSale.amount : null;
  const salesLast72h = stats.last72Hours ? stats.last72Hours.salesCount : 0;

  let retail = null;
  if (node.traits && Array.isArray(node.traits)) {
    const retailTrait = node.traits.find(t => t.name === 'Retail Price');
    if (retailTrait && retailTrait.value) {
      retail = parseFloat(retailTrait.value.replace(/[^0-9.]/g, ''));
    }
  }

  let releaseDate = '';
  if (node.traits && Array.isArray(node.traits)) {
    const releaseTrait = node.traits.find(t => t.name === 'Release Date');
    if (releaseTrait) releaseDate = releaseTrait.value || '';
  }

  let spread = null;
  let spreadPct = null;
  const marketPrice = lowestAsk || lastSale;
  if (marketPrice && retail && retail > 0) {
    spread = marketPrice - retail;
    spreadPct = Math.round((spread / retail) * 100);
  }

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
    const source = results.length > 0 && results[0].source ? results[0].source : 'none';
    res.json({ source, results, query });
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
          if (!seen.has(hit.id) && (hit.lowestAsk || hit.lastSale)) {
            seen.add(hit.id);
            allResults.push(hit);
          }
        }
      } catch (e) {
        console.error('Trending query "' + q + '" failed:', e.message);
      }
    }

    allResults.sort((a, b) => {
      const spreadA = a.spread || 0;
      const spreadB = b.spread || 0;
      return spreadB - spreadA;
    });

    const trending = allResults.slice(0, limit);
    const source = trending.length > 0 && trending[0].source ? trending[0].source : 'none';
    const result = { source, results: trending, count: trending.length, updatedAt: new Date().toISOString() };
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

// --- Pre-warm: fetch StockX cookies on startup ---
setTimeout(() => {
  ensureStockXCookies().then(() => console.log('StockX cookies prefetched')).catch(() => {});
}, 5000);

// --- Start ---
app.listen(PORT, () => {
  console.log('=== SolePing API ===');
  console.log('Port:', PORT);
  console.log('Data: StockX GraphQL > SSR > SneakerDB (cascading fallback)');
  console.log('Keep-alive: every 10 min');
  console.log('====================');
});
