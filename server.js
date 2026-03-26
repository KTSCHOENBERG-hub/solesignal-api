/**
 * SoleSignal API — Live Sneaker Resale Intelligence
 *
 * Wraps the Sneaks-API library to pull real-time pricing from
 * StockX, GOAT, FlightClub, and Stadium Goods.
 *
 * Endpoints:
 *   GET /api/search?q=jordan+1&limit=10     — Search sneakers
 *   GET /api/product/:styleID                — Get product detail + prices
 *   GET /api/trending?limit=10               — Most popular sneakers right now
 *   GET /api/health                          — Health check
 *
 * Deploy: Render.com, Railway, or any Node.js host
 * Cost:   $7/mo on Render Starter (always-on, free SSL)
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const NodeCache = require("node-cache");
const SneaksAPI = require("sneaks-api");

const app = express();
const sneaks = new SneaksAPI();
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5-min cache

const PORT = process.env.PORT || 3001;

// Allowed origins (add your frontend domain here)
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://meethailo.com",
  "https://www.meethailo.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET"],
    optionsSuccessStatus: 200,
  })
);

// Rate limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use("/api/", limiter);

app.use(express.json());

// Helper: promisify Sneaks-API callbacks
function searchProducts(query, limit = 10) {
  return new Promise((resolve, reject) => {
    sneaks.getProducts(query, limit, (err, products) => {
      if (err) return reject(err);
      resolve(products || []);
    });
  });
}

function getProductPrices(styleID) {
  return new Promise((resolve, reject) => {
    sneaks.getProductPrices(styleID, (err, product) => {
      if (err) return reject(err);
      resolve(product);
    });
  });
}

function getMostPopular(limit = 10) {
  return new Promise((resolve, reject) => {
    sneaks.getMostPopular(limit, (err, products) => {
      if (err) return reject(err);
      resolve(products || []);
    });
  });
}

// Helper: normalize product data into clean JSON
function normalizeProduct(p) {
  if (!p) return null;
  return {
    name: p.shoeName || p.name || "Unknown",
    brand: p.brand || "Unknown",
    styleID: p.styleID || "",
    colorway: p.colorway || "",
    retailPrice: p.retailPrice || 0,
    releaseDate: p.releaseDate || "",
    description: p.description || "",
    thumbnail: p.thumbnail || "",
    images: {
      small: p.smallImage || p.thumbnail || "",
      original: p.originalImage || p.thumbnail || "",
    },
    resellPrices: {
      stockX: p.lowestResellPrice?.stockX || null,
      goat: p.lowestResellPrice?.goat || null,
      flightClub: p.lowestResellPrice?.flightClub || null,
      stadiumGoods: p.lowestResellPrice?.stadiumGoods || null,
    },
    resellLinks: {
      stockX: p.resellLinks?.stockX || "",
      goat: p.resellLinks?.goat || "",
      flightClub: p.resellLinks?.flightClub || "",
      stadiumGoods: p.resellLinks?.stadiumGoods || "",
    },
    priceMap: p.resellPrices || {},
    lowestResale: Math.min(
      ...[
        p.lowestResellPrice?.stockX,
        p.lowestResellPrice?.goat,
        p.lowestResellPrice?.flightClub,
        p.lowestResellPrice?.stadiumGoods,
      ].filter((v) => v && v > 0)
    ) || null,
    highestResale: Math.max(
      ...[
        p.lowestResellPrice?.stockX,
        p.lowestResellPrice?.goat,
        p.lowestResellPrice?.flightClub,
        p.lowestResellPrice?.stadiumGoods,
      ].filter((v) => v && v > 0)
    ) || null,
  };
}

// Add profit calculation to a normalized product
function addProfitCalc(product) {
  if (!product) return product;
  const retail = product.retailPrice;
  const lowest = product.lowestResale;
  if (retail && lowest && retail > 0) {
    const profit = lowest - retail;
    const roi = ((profit / retail) * 100).toFixed(1);
    product.profitEstimate = {
      raw: profit,
      roi: parseFloat(roi),
      verdict: profit > 50 ? "COP" : profit > 0 ? "HOLD" : "SKIP",
      confidence: profit > 100 ? "HIGH" : profit > 30 ? "MEDIUM" : "LOW",
    };
  } else {
    product.profitEstimate = {
      raw: 0,
      roi: 0,
      verdict: "NO DATA",
      confidence: "NONE",
    };
  }
  return product;
}

// ROUTES

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "SoleSignal API",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Search sneakers
app.get("/api/search", async (req, res) => {
  try {
    const query = req.query.q;
    const limit = Math.min(parseInt(req.query.limit) || 10, 40);
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    const cacheKey = "search:" + query + ":" + limit;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ source: "cache", count: cached.length, results: cached });
    }
    const products = await searchProducts(query.trim(), limit);
    const normalized = products.map(normalizeProduct).filter(Boolean).map(addProfitCalc);
    cache.set(cacheKey, normalized);
    res.json({ source: "live", count: normalized.length, results: normalized });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ error: "Failed to search products", detail: err.message });
  }
});

// Get single product with full price breakdown by size
app.get("/api/product/:styleID", async (req, res) => {
  try {
    const { styleID } = req.params;
    if (!styleID || styleID.trim().length === 0) {
      return res.status(400).json({ error: "Style ID is required" });
    }
    const cacheKey = "product:" + styleID;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ source: "cache", product: cached });
    }
    const product = await getProductPrices(styleID.trim());
    const normalized = addProfitCalc(normalizeProduct(product));
    cache.set(cacheKey, normalized);
    res.json({ source: "live", product: normalized });
  } catch (err) {
    console.error("Product error:", err.message);
    res.status(500).json({ error: "Failed to get product", detail: err.message });
  }
});

// Trending / most popular sneakers
app.get("/api/trending", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 40);
    const cacheKey = "trending:" + limit;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ source: "cache", count: cached.length, results: cached });
    }
    const products = await getMostPopular(limit);
    const normalized = products.map(normalizeProduct).filter(Boolean).map(addProfitCalc);
    cache.set(cacheKey, normalized);
    res.json({ source: "live", count: normalized.length, results: normalized });
  } catch (err) {
    console.error("Trending error:", err.message);
    res.status(500).json({ error: "Failed to get trending", detail: err.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not found",
    available: [
      "GET /api/search?q=yeezy&limit=10",
      "GET /api/product/:styleID",
      "GET /api/trending?limit=10",
      "GET /api/health",
    ],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log("SoleSignal API running on port " + PORT);
});
