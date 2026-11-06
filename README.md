# Kaarigar — Hunar from Home, Near You

A map-based hyperlocal platform helping homemakers in Ahmedabad turn everyday home skills (tiffin, laundry, tailoring, mehndi, papad/pickle, baking, crafts) into trusted neighbourhood income within 1–10 km.

Built for **SEVA FIRST INNOVATION CHALLENGE 2026 (SSIP 2.0)** — Team **TM003815**, L.D. College of Engineering, Ahmedabad.

---

## Key Features

- **Live Graphic Street Map (`src/components/LiveMap.tsx`)**
  - Custom pastel graphic street map built on **MapLibre GL + OpenFreeMap vector tiles** (real streets, bridges, parks & Sabarmati River with zero API key or watermarks, plus 1-click toggle to Detailed Street View).
  - Live `1 / 2 / 5 / 10 km` radius matching, draggable blue user pin, browser GPS (`🎯 Use my location`), live street/society **Places Autocomplete**, and **Reverse Geocoding**.
  - **Privacy Moat**: Exact homemaker addresses and phone numbers are never exposed publicly—map pins render deterministic ~320m fuzzed neighbourhood circles, and phone/chat unlock only after an order is placed.
- **Role-Based Auth & Account Isolation (`server/index.mjs` & `src/components/AuthModal.tsx`)**
  - Salted `scrypt` PIN/password hashing, Bearer session tokens, IP rate-limiting on auth endpoints, and strict per-owner authorization (`/api/me/dashboard`, `/api/me/orders`, order-participant chat & review checks).
  - Production PostgreSQL + PostGIS schema and `auth.uid()` Row-Level Security policies ready in `supabase/migrations/001_kaarigar_schema.sql`.
- **End-to-End Flows**
  - **Onboard**: Business profile, craft icon, ID verification badge, services with ₹ prices, interactive map pin-picker, service radius, working hours, daily order cap, and work photo uploads.
  - **Fulfil**: Pickup vs. local delivery, UPI / Cash on delivery, post-order call + live in-app chat, and customer photo reviews that dynamically update each Kaarigar's **Trust Score**.
  - **Provider Dashboard**: Live Taking Orders / Pause switch, daily order cap controls, order status workflow (`Accept` → `Ready` → `Complete`), customer chat replies, and 9% fee / weekly UPI payout summary.

---

## Quick Start

```bash
# 1. Create your local environment file (gitignored)
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start backend API (port 8787) + Vite React frontend (port 5173)
npm run dev
```

Open **http://localhost:5173/** in your browser.

---

## Environment & Security Notes

- **Never commit `.env`** — `.gitignore` excludes `.env`, `.env.*`, `*.sqlite*`, `server/data/`, `server/uploads/*`, `node_modules/`, and `dist/`.
- **Server-only vs. Browser keys**: Put secret API keys (`OLA_MAPS_API_KEY`, `GEOAPIFY_API_KEY`, `RAZORPAY_KEY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) in `.env` **without** the `VITE_` prefix so Vite never bundles them into client JavaScript.
