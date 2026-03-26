/**
 * SolePing API — Live Sneaker Resale Intelligence
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
