const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 300 });

// Middleware
app.set('trust proxy', 1);
app.use(helmet({ frameguard: false, contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// StockX Algolia Configuration
const ALGOLIA_APP_ID = 'XW7SBCT9V6';
const ALGOLIA_API_KEY = '6b5e76b49705eb9f51a06571571c4a94';
const ALGOLIA_INDEX = 'products';
const ALGOLIA_HOST = 'xw7sbct9v6-dsn.algolia.net';

// Demo data - 20 realistic sneakers
const DEMO_DATA = [
  {
    shoeName: 'Air Jordan 1 Retro High OG Chicago',
    brand: 'Jordan',
    styleID: 'AJ1-CHICAGO-1985',
    colorway: 'Red/Black/White',
    retailPrice: 125,
    thumbnail: 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Product.jpg',
    lowestResellPrice: {
      stockX: 2500,
      goat: 2450,
      flightClub: 2550,
      stadiumGoods: 2600,
    },
    resellLinks: {
      stockX: 'https://stockx.com/air-jordan-1-retro-high-og-chicago',
      goat: 'https://www.goat.com/sneakers/air-jordan-1-retro-high-og-chicago',
      flightClub: 'https://www.flightclub.com/air-jordan-1-retro-high-og-chicago',
      stadiumGoods: 'https://www.stadiumgoods.com/air-jordan-1-retro-high-og-chicago',
    },
  },
  {
    shoeName: 'Yeezy Boost 350 V2 Zebra',
    brand: 'Yeezy',
    styleID: 'YEEZY-350-V2-ZEBRA',
    colorway: 'Black/White/Red',
    retailPrice: 220,
    thumbnail: 'https://images.stockx.com/images/Yeezy-Boost-350-V2-Zebra-Product.jpg',
    lowestResellPrice: {
      stockX: 450,
      goat: 440,
      flightClub: 460,
      stadiumGoods: 480,
    },
    resellLinks: {
      stockX: 'https://stockx.com/yeezy-boost-350-v2-zebra',
      goat: 'https://www.goat.com/sneakers/yeezy-boost-350-v2-zebra',
      flightClub: 'https://www.flightclub.com/yeezy-boost-350-v2-zebra',
      stadiumGoods: 'https://www.stadiumgoods.com/yeezy-boost-350-v2-zebra',
    },
  },
  {
    shoeName: 'Nike Dunk Low Panda',
    brand: 'Nike',
    styleID: 'NIKE-DUNK-LOW-PANDA',
    colorway: 'Black/White',
    retailPrice: 115,
    thumbnail: 'https://images.stockx.com/images/Nike-Dunk-Low-Panda-Product.jpg',
    lowestResellPrice: {
      stockX: 180,
      goat: 175,
      flightClub: 185,
      stadiumGoods: 190,
    },
    resellLinks: {
      stockX: 'https://stockx.com/nike-dunk-low-panda',
      goat: 'https://www.goat.com/sneakers/nike-dunk-low-panda',
      flightClub: 'https://www.flightclub.com/nike-dunk-low-panda',
      stadiumGoods: 'https://www.stadiumgoods.com/nike-dunk-low-panda',
    },
  },
  {
    shoeName: 'Travis Scott x Air Jordan 1 Low OG SP Reverse Mocha',
    brand: 'Jordan',
    styleID: 'TRAVIS-SCOTT-AJ1-LOW-REVERSE',
    colorway: 'Mocha/Cream/Brown',
    retailPrice: 145,
    thumbnail: 'https://images.stockx.com/images/Travis-Scott-AJ1-Low-OG-SP-Reverse-Mocha.jpg',
    lowestResellPrice: {
      stockX: 1100,
      goat: 1050,
      flightClub: 1150,
      stadiumGoods: 1200,
    },
    resellLinks: {
      stockX: 'https://stockx.com/travis-scott-air-jordan-1-low-og-sp-reverse-mocha',
      goat: 'https://www.goat.com/sneakers/travis-scott-air-jordan-1-low-og-sp-reverse-mocha',
      flightClub: 'https://www.flightclub.com/travis-scott-air-jordan-1-low-og-sp-reverse-mocha',
      stadiumGoods: 'https://www.stadiumgoods.com/travis-scott-air-jordan-1-low-og-sp-reverse-mocha',
    },
  },
  {
    shoeName: 'Dunk Low Next Nature Pack Black',
    brand: 'Nike',
    styleID: 'DUNK-LOW-NEXT-NATURE-BLACK',
    colorway: 'Black/Grey/Green',
    retailPrice: 115,
    thumbnail: 'https://images.stockx.com/images/Dunk-Low-Next-Nature-Black.jpg',
    lowestResellPrice: {
      stockX: 145,
      goat: 140,
      flightClub: 150,
      stadiumGoods: 155,
    },
    resellLinks: {
      stockX: 'https://stockx.com/dunk-low-next-nature-pack-black',
      goat: 'https://www.goat.com/sneakers/dunk-low-next-nature-pack-black',
      flightClub: 'https://www.flightclub.com/dunk-low-next-nature-pack-black',
      stadiumGoods: 'https://www.stadiumgoods.com/dunk-low-next-nature-pack-black',
    },
  },
  {
    shoeName: 'Adidas Yeezy Foam Runner MXT Moon Gray',
    brand: 'Yeezy',
    styleID: 'YEEZY-FOAM-RUNNER-MXT-MOON',
    colorway: 'Moon Gray',
    retailPrice: 200,
    thumbnail: 'https://images.stockx.com/images/Adidas-Yeezy-Foam-Runner-MXT-Moon-Gray.jpg',
    lowestResellPrice: {
      stockX: 280,
      goat: 270,
      flightClub: 290,
      stadiumGoods: 310,
    },
    resellLinks: {
      stockX: 'https://stockx.com/yeezy-foam-runner-mxt-moon-gray',
      goat: 'https://www.goat.com/sneakers/yeezy-foam-runner-mxt-moon-gray',
      flightClub: 'https://www.flightclub.com/yeezy-foam-runner-mxt-moon-gray',
      stadiumGoods: 'https://www.stadiumgoods.com/yeezy-foam-runner-mxt-moon-gray',
    },
  },
  {
    shoeName: 'Air Jordan 11 Retro Space Jam',
    brand: 'Jordan',
    styleID: 'AJ11-SPACE-JAM-2009',
    colorway: 'Black/Varsity Red/White',
    retailPrice: 175,
    thumbnail: 'https://images.stockx.com/images/Air-Jordan-11-Retro-Space-Jam.jpg',
    lowestResellPrice: {
      stockX: 650,
      goat: 620,
      flightClub: 680,
      stadiumGoods: 720,
    },
    resellLinks: {
      stockX: 'https://stockx.com/air-jordan-11-retro-space-jam',
      goat: 'https://www.goat.com/sneakers/air-jordan-11-retro-space-jam',
      flightClub: 'https://www.flightclub.com/air-jordan-11-retro-space-jam',
      stadiumGoods: 'https://www.stadiumgoods.com/air-jordan-11-retro-space-jam',
    },
  },
  {
    shoeName: 'Nike SB Dunk Low Instant Skateboards',
    brand: 'Nike',
    styleID: 'SB-DUNK-LOW-INSTANT',
    colorway: 'Black/White/Blue',
    retailPrice: 105,
    thumbnail: 'https://images.stockx.com/images/Nike-SB-Dunk-Low-Instant-Skateboards.jpg',
    lowestResellPrice: {
      stockX: 320,
      goat: 310,
      flightClub: 330,
      stadiumGoods: 350,
    },
    resellLinks: {
      stockX: 'https://stockx.com/nike-sb-dunk-low-instant-skateboards',
      goat: 'https://www.goat.com/sneakers/nike-sb-dunk-low-instant-skateboards',
      flightClub: 'https://www.flightclub.com/nike-sb-dunk-low-instant-skateboards',
      stadiumGoods: 'https://www.stadiumgoods.com/nike-sb-dunk-low-instant-skateboards',
    },
  },
  {
    shoeName: 'Adidas Ultraboost 1.0 Core Black',
    brand: 'Adidas',
    styleID: 'ULTRABOOST-1.0-CORE-BLACK',
    colorway: 'Core Black/White',
    retailPrice: 180,
    thumbnail: 'https://images.stockx.com/images/Adidas-Ultraboost-1.0-Core-Black.jpg',
    lowestResellPrice: {
      stockX: 420,
      goat: 400,
      flightClub: 440,
      stadiumGoods: 460,
    },
    resellLinks: {
      stockX: 'https://stockx.com/adidas-ultraboost-1.0-core-black',
      goat: 'https://www.goat.com/sneakers/adidas-ultraboost-1.0-core-black',
      flightClub: 'https://www.flightclub.com/adidas-ultraboost-1.0-core-black',
      stadiumGoods: 'https://www.stadiumgoods.com/adidas-ultraboost-1.0-core-black',
    },
  },
  {
    shoeName: 'New Balance 990v6 White/Grey',
    brand: 'New Balance',
    styleID: 'NB-990V6-WHITE-GREY',
    colorway: 'White/Grey/Blue',
    retailPrice: 185,
    thumbnail: 'https://images.stockx.com/images/New-Balance-990v6-White-Grey.jpg',
    lowestResellPrice: {
      stockX: 240,
      goat: 230,
      flightClub: 250,
      stadiumGoods: 270,
    },
    resellLinks: {
      stockX: 'https://stockx.com/new-balance-990v6-white-grey',
      goat: 'https://www.goat.com/sneakers/new-balance-990v6-white-grey',
      flightClub: 'https://www.flightclub.com/new-balance-990v6-white-grey',
      stadiumGoods: 'https://www.stadiumgoods.com/new-balance-990v6-white-grey',
    },
  },
  {
    shoeName: 'Air Jordan 4 Retro Travis Scott Cactus Jack',
    brand: 'Jordan',
    styleID: 'AJ4-TRAVIS-SCOTT-CACTUS',
    colorway: 'Brown/Olive/Cream',
    retailPrice: 190,
    thumbnail: 'https://images.stockx.com/images/Air-Jordan-4-Retro-Travis-Scott-Cactus-Jack.jpg',
    lowestResellPrice: {
      stockX: 1650,
      goat: 1600,
      flightClub: 1700,
      stadiumGoods: 1800,
    },
    resellLinks: {
      stockX: 'https://stockx.com/air-jordan-4-retro-travis-scott-cactus-jack',
      goat: 'https://www.goat.com/sneakers/air-jordan-4-retro-travis-scott-cactus-jack',
      flightClub: 'https://www.flightclub.com/air-jordan-4-retro-travis-scott-cactus-jack',
      stadiumGoods: 'https://www.stadiumgoods.com/air-jordan-4-retro-travis-scott-cactus-jack',
    },
  },
  {
    shoeName: 'Sacai x Nike Blazer Low Classic Green/White',
    brand: 'Nike',
    styleID: 'SACAI-BLAZER-LOW-GREEN',
    colorway: 'Green/White/Black',
    retailPrice: 125,
    thumbnail: 'https://images.stockx.com/images/Sacai-Nike-Blazer-Low-Classic-Green-White.jpg',
    lowestResellPrice: {
      stockX: 380,
      goat: 360,
      flightClub: 400,
      stadiumGoods: 420,
    },
    resellLinks: {
      stockX: 'https://stockx.com/sacai-nike-blazer-low-classic-green-white',
      goat: 'https://www.goat.com/sneakers/sacai-nike-blazer-low-classic-green-white',
      flightClub: 'https://www.flightclub.com/sacai-nike-blazer-low-classic-green-white',
      stadiumGoods: 'https://www.stadiumgoods.com/sacai-nike-blazer-low-classic-green-white',
    },
  },
  {
    shoeName: 'Yeezy Boost 700 Wave Runner Solid Grey',
    brand: 'Yeezy',
    styleID: 'YEEZY-700-WAVE-RUNNER',
    colorway: 'Solid Grey/Chalk White',
    retailPrice: 300,
    thumbnail: 'https://images.stockx.com/images/Yeezy-Boost-700-Wave-Runner-Solid-Grey.jpg',
    lowestResellPrice: {
      stockX: 580,
      goat: 560,
      flightClub: 600,
      stadiumGoods: 640,
    },
    resellLinks: {
      stockX: 'https://stockx.com/yeezy-boost-700-wave-runner-solid-grey',
      goat: 'https://www.goat.com/sneakers/yeezy-boost-700-wave-runner-solid-grey',
      flightClub: 'https://www.flightclub.com/yeezy-boost-700-wave-runner-solid-grey',
      stadiumGoods: 'https://www.stadiumgoods.com/yeezy-boost-700-wave-runner-solid-grey',
    },
  },
  {
    shoeName: 'Air Max 90 OG White/Neutral Grey/Black',
    brand: 'Nike',
    styleID: 'AIR-MAX-90-OG-WHITE',
    colorway: 'White/Neutral Grey/Black',
    retailPrice: 130,
    thumbnail: 'https://images.stockx.com/images/Air-Max-90-OG-White-Neutral-Grey-Black.jpg',
    lowestResellPrice: {
      stockX: 190,
      goat: 180,
      flightClub: 200,
      stadiumGoods: 220,
    },
    resellLinks: {
      stockX: 'https://stockx.com/air-max-90-og-white-neutral-grey-black',
      goat: 'https://www.goat.com/sneakers/air-max-90-og-white-neutral-grey-black',
      flightClub: 'https://www.flightclub.com/air-max-90-og-white-neutral-grey-black',
      stadiumGoods: 'https://www.stadiumgoods.com/air-max-90-og-white-neutral-grey-black',
    },
  },
  {
    shoeName: 'Jordan 3 Retro A Ma ManiÃ©re Black/Gold',
    brand: 'Jordan',
    styleID: 'JORDAN-3-RETRO-A-MA-MANIERE',
    colorway: 'Black/Gold/Red',
    retailPrice: 200,
    thumbnail: 'https://images.stockx.com/images/Jordan-3-Retro-A-Ma-Maniere-Black-Gold.jpg',
    lowestResellPrice: {
      stockX: 420,
      goat: 400,
      flightClub: 440,
      stadiumGoods: 480,
    },
    resellLinks: {
      stockX: 'https://stockx.com/jordan-3-retro-a-ma-maniere-black-gold',
      goat: 'https://www.goat.com/sneakers/jordan-3-retro-a-ma-maniere-black-gold',
      flightClub: 'https://www.flightclub.com/jordan-3-retro-a-ma-maniere-black-gold',
      stadiumGoods: 'https://www.stadiumgoods.com/jordan-3-retro-a-ma-maniere-black-gold',
    },
  },
  {
    shoeName: 'Nike Kyrie 5 Duke Blue/White',
    brand: 'Nike',
    styleID: 'NIKE-KYRIE-5-DUKE',
    colorway: 'Duke Blue/White/Black',
    retailPrice: 140,
    thumbnail: 'https://images.stockx.com/images/Nike-Kyrie-5-Duke-Blue-White.jpg',
    lowestResellPrice: {
      stockX: 280,
      goat: 265,
      flightClub: 295,
      stadiumGoods: 320,
    },
    resellLinks: {
      stockX: 'https://stockx.com/nike-kyrie-5-duke-blue-white',
      goat: 'https://www.goat.com/sneakers/nike-kyrie-5-duke-blue-white',
      flightClub: 'https://www.flightclub.com/nike-kyrie-5-duke-blue-white',
      stadiumGoods: 'https://www.stadiumgoods.com/nike-kyrie-5-duke-blue-white',
    },
  },
  {
    shoeName: 'Adidas ZX 8000 Black/White/Red',
    brand: 'Adidas',
    styleID: 'ADIDAS-ZX-8000-RETRO',
    colorway: 'Black/White/Red',
    retailPrice: 140,
    thumbnail: 'https://images.stockx.com/images/Adidas-ZX-8000-Black-White-Red.jpg',
    lowestResellPrice: {
      stockX: 180,
      goat: 170,
      flightClub: 190,
      stadiumGoods: 210,
    },
    resellLinks: {
      stockX: 'https://stockx.com/adidas-zx-8000-black-white-red',
      goat: 'https://www.goat.com/sneakers/adidas-zx-8000-black-white-red',
      flightClub: 'https://www.flightclub.com/adidas-zx-8000-black-white-red',
      stadiumGoods: 'https://www.stadiumgoods.com/adidas-zx-8000-black-white-red',
    },
  },
  {
    shoeName: 'Nike LeBron 20 White/Gold/Black',
    brand: 'Nike',
    styleID: 'NIKE-LEBRON-20-WHITE',
    colorway: 'White/Gold/Black',
    retailPrice: 185,
    thumbnail: 'https://images.stockx.com/images/Nike-LeBron-20-White-Gold-Black.jpg',
    lowestResellPrice: {
      stockX: 220,
      goat: 210,
      flightClub: 230,
      stadiumGoods: 250,
    },
    resellLinks: {
      stockX: 'https://stockx.com/nike-lebron-20-white-gold-black',
      goat: 'https://www.goat.com/sneakers/nike-lebron-20-white-gold-black',
      flightClub: 'https://www.flightclub.com/nike-lebron-20-white-gold-black',
      stadiumGoods: 'https://www.stadiumgoods.com/nike-lebron-20-white-gold-black',
    },
  },
  {
    shoeName: 'Converse Chuck Taylor All Star 70 High Black',
    brand: 'Converse',
    styleID: 'CHUCK-TAYLOR-70-HIGH-BLACK',
    colorway: 'Black',
    retailPrice: 75,
    thumbnail: 'https://images.stockx.com/images/Converse-Chuck-Taylor-All-Star-70-High-Black.jpg',
    lowestResellPrice: {
      stockX: 95,
      goat: 90,
      flightClub: 100,
      stadiumGoods: 110,
    },
    resellLinks: {
      stockX: 'https://stockx.com/converse-chuck-taylor-all-star-70-high-black',
      goat: 'https://www.goat.com/sneakers/converse-chuck-taylor-all-star-70-high-black',
      flightClub: 'https://www.flightclub.com/converse-chuck-taylor-all-star-70-high-black',
      stadiumGoods: 'https://www.stadiumgoods.com/converse-chuck-taylor-all-star-70-high-black',
    },
  },
];

// Search StockX via Algolia
async function searchStockX(query, limit = 20) {
  try {
    const response = await fetch(
      `https://${ALGOLIA_HOST}/1/indexes/${ALGOLIA_INDEX}/query`,
      {
        method: 'POST',
        headers: {
          'x-algolia-application-id': ALGOLIA_APP_ID,
          'x-algolia-api-key': ALGOLIA_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          limit: limit,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`StockX API error: ${response.status}`);
    }

    const data = await response.json();
    return data.hits || [];
  } catch (error) {
    console.error('StockX API error:', error.message);
    return null;
  }
}

// Format product data for response
function formatProduct(product) {
  return {
    shoeName: product.shoeName || product.name || '',
    brand: product.brand || '',
    styleID: product.styleID || product.id || '',
    colorway: product.colorway || product.color || '',
    retailPrice: product.retailPrice || product.retail_price || 0,
    thumbnail: product.thumbnail || product.image_url || '',
    lowestResellPrice: {
      stockX: product.lowestResellPrice?.stockX || product.stockx_price || 0,
      goat: product.lowestResellPrice?.goat || product.goat_price || 0,
      flightClub: product.lowestResellPrice?.flightClub || product.flight_club_price || 0,
      stadiumGoods: product.lowestResellPrice?.stadiumGoods || product.stadium_goods_price || 0,
    },
    resellLinks: {
      stockX: product.resellLinks?.stockX || '',
      goat: product.resellLinks?.goat || '',
      flightClub: product.resellLinks?.flightClub || '',
      stadiumGoods: product.resellLinks?.stadiumGoods || '',
    },
  };
}

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Search route
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    if (!query) {
      return res.status(400).json({ error: 'Search query required' });
    }

    // Check cache first
    const cacheKey = `search:${query}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', results: cached });
    }

    // Try StockX API
    const results = await searchStockX(query, limit);

    if (results && results.length > 0) {
      const formatted = results.slice(0, limit).map(formatProduct);
      cache.set(cacheKey, formatted);
      return res.json({ source: 'live', results: formatted });
    }

    // Fall back to demo data
    const filtered = DEMO_DATA.filter(
      (product) =>
        product.shoeName.toLowerCase().includes(query.toLowerCase()) ||
        product.brand.toLowerCase().includes(query.toLowerCase()) ||
        product.colorway.toLowerCase().includes(query.toLowerCase())
    ).slice(0, limit);

    cache.set(cacheKey, filtered);
    res.json({ source: 'demo', results: filtered });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Product detail route
app.get('/api/product/:styleID', (req, res) => {
  try {
    const { styleID } = req.params;

    // Check cache
    const cacheKey = `product:${styleID}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Search demo data
    const product = DEMO_DATA.find((p) => p.styleID === styleID);

    if (product) {
      cache.set(cacheKey, product);
      return res.json(product);
    }

    res.status(404).json({ error: 'Product not found' });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).json({ error: 'Failed to get product details' });
  }
});

// Trending route
app.get('/api/trending', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    // Check cache
    const cacheKey = `trending:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ source: 'cache', results: cached });
    }

    // Return top demo data items (sorted by highest resale price)
    const trending = DEMO_DATA.sort(
      (a, b) =>
        Math.max(...Object.values(b.lowestResellPrice || {})) -
        Math.max(...Object.values(a.lowestResellPrice || {}))
    ).slice(0, limit);

    cache.set(cacheKey, trending);
    res.json({ source: 'demo', results: trending });
  } catch (error) {
    console.error('Trending error:', error);
    res.status(500).json({ error: 'Failed to get trending products' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`SolePing API server listening on port ${PORT}`);
});
