# SoleSignal — Deployment Guide

## What You Have

- `solesignal-backend/` — Node.js Express API that pulls live sneaker prices from StockX, GOAT, FlightClub, and Stadium Goods
- `solesignal-website.jsx` — React frontend with live data integration (falls back to mock data if API is offline)

## Step 1: Deploy the Backend to Render ($7/month)

1. Create a GitHub repository and push the `solesignal-backend/` folder to it
2. Go to https://render.com and sign up (free)
3. Click "New +" then "Web Service"
4. Connect your GitHub repo
5. Configure:
   - **Name:** solesignal-api
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Starter ($7/mo)
6. Add environment variable:
   - `FRONTEND_URL` = your frontend URL (e.g. https://meethailo.com)
7. Click "Create Web Service"
8. Your API will be live at: `https://solesignal-api.onrender.com`

## Step 2: Update the Frontend

Open `solesignal-website.jsx` and change line 15:

```
const API_BASE = "https://solesignal-api.onrender.com";
```

Replace with your actual Render URL.

## Step 3: Test It

Visit your API health check:
```
https://solesignal-api.onrender.com/api/health
```

Try a search:
```
https://solesignal-api.onrender.com/api/search?q=jordan+1&limit=5
```

Try trending:
```
https://solesignal-api.onrender.com/api/trending?limit=10
```

## Security Features (Built In)

- **Helmet.js** — Sets secure HTTP headers automatically
- **CORS** — Only your frontend domain can call the API
- **Rate Limiting** — 100 requests per 15 minutes per IP (prevents abuse)
- **HTTPS** — Free SSL certificate from Render
- **Input validation** — All params sanitized before use
- **5-minute cache** — Reduces API calls and improves response time

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/search?q=yeezy&limit=10` | Search sneakers by name |
| `GET /api/product/:styleID` | Full price breakdown by size |
| `GET /api/trending?limit=10` | Most popular sneakers now |
| `GET /api/health` | Health check |

## Cost Summary

| Item | Monthly Cost |
|---|---|
| Render Starter (backend) | $7 |
| Frontend (Claude artifact / Vercel free) | $0 |
| Sneaks-API (open source) | $0 |
| SSL certificate | $0 (included) |
| **Total** | **$7/month** |

## Want to Go Free?

Use Render's free tier ($0/mo) instead of Starter. The only downside: the server sleeps after 15 minutes of inactivity and takes 30-60 seconds to wake up on the next request. For a demo/MVP, this is fine.
