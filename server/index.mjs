import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Load optional .env keys for server-side geocoding if present
function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}
loadDotEnv();

const db = new DatabaseSync(path.join(DATA_DIR, 'kaarigar.sqlite'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Core Tables + Users & Sessions for strict Role-Based Access Control
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'kaarigar')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS kaarigars (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    business_name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🍱',
    theme_color TEXT NOT NULL DEFAULT '#FBD3E3',
    area_name TEXT NOT NULL DEFAULT 'Navrangpura, Ahmedabad',
    private_lat REAL NOT NULL,
    private_lng REAL NOT NULL,
    masked_lat REAL NOT NULL,
    masked_lng REAL NOT NULL,
    service_radius_km REAL NOT NULL DEFAULT 5.0,
    open_time TEXT NOT NULL DEFAULT '08:00',
    close_time TEXT NOT NULL DEFAULT '20:00',
    is_open INTEGER NOT NULL DEFAULT 1,
    daily_cap INTEGER NOT NULL DEFAULT 15,
    id_verified INTEGER NOT NULL DEFAULT 1,
    rating REAL NOT NULL DEFAULT 4.8,
    review_count INTEGER NOT NULL DEFAULT 0,
    trust_score INTEGER NOT NULL DEFAULT 82,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    kaarigar_id TEXT NOT NULL REFERENCES kaarigars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price_inr INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS kaarigar_photos (
    id TEXT PRIMARY KEY,
    kaarigar_id TEXT NOT NULL REFERENCES kaarigars(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    kaarigar_id TEXT NOT NULL REFERENCES kaarigars(id) ON DELETE CASCADE,
    service_id TEXT,
    service_title TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_inr INTEGER NOT NULL,
    commission_inr INTEGER NOT NULL,
    net_payout_inr INTEGER NOT NULL,
    fulfilment_type TEXT NOT NULL DEFAULT 'pickup',
    payment_method TEXT NOT NULL DEFAULT 'upi',
    customer_name TEXT NOT NULL DEFAULT 'Neighbour',
    customer_note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'placed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_messages (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE,
    kaarigar_id TEXT NOT NULL REFERENCES kaarigars(id) ON DELETE CASCADE,
    customer_name TEXT NOT NULL DEFAULT 'Neighbour',
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    photo_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Auto-migrate Phase 1 SQLite databases smoothly if columns were missing
function ensureColumn(table, col, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
  }
}
ensureColumn('kaarigars', 'user_id', 'TEXT REFERENCES users(id)');
ensureColumn('orders', 'customer_user_id', 'TEXT REFERENCES users(id)');

// Password / PIN hashing using Node crypto.scryptSync
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPin(pin, stored) {
  const [salt, hex] = String(stored ?? '').split(':');
  if (!salt || !hex) return false;
  const derived = crypto.scryptSync(String(pin), salt, 64);
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
}

function createSessionToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at)
    VALUES (?, ?, datetime('now', '+30 days'))
  `).run(token, userId);
  return token;
}

function maskCoordinates(lat, lng, seedStr) {
  const hash = crypto.createHash('sha256').update(seedStr).digest();
  const angle = (((hash[0] << 8) + hash[1]) / 65535) * Math.PI * 2;
  const distMeters = 220 + (hash[2] / 255) * 160; // 220m - 380m offset
  const dLat = (distMeters * Math.cos(angle)) / 111320;
  const dLng = (distMeters * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    maskedLat: Number((lat + dLat).toFixed(6)),
    maskedLng: Number((lng + dLng).toFixed(6)),
  };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeTrustScore({ idVerified, rating, reviewCount, photoReviewsCount }) {
  const base = idVerified ? 62 : 45;
  const ratingBoost = Math.max(0, (rating - 3.5) * 14);
  const volumeBoost = Math.min(14, Math.log10(reviewCount + 1) * 6.5);
  const photoBoost = Math.min(8, photoReviewsCount * 2);
  return Math.min(99, Math.round(base + ratingBoost + volumeBoost + photoBoost));
}

function seedDatabaseAndAccounts() {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
    return;
  }
  const seedPin = process.env.DEMO_SEED_PIN || '1234';
  const defaultPinHash = hashPin(seedPin);

  const seeds = [
    {
      id: 'k-meena',
      userId: 'u-meena',
      biz: "Meena's Kitchen",
      owner: 'Meena Ben',
      emoji: '🍱',
      lat: 23.0372,
      lng: 72.5512,
      area: 'Navrangpura, Ahmedabad',
      rating: 4.8,
      reviews: 126,
      open: 1,
      color: '#FBD3E3',
      phone: '9876540001',
      displayPhone: '98765 40001',
      radius: 5,
      openTime: '08:00',
      closeTime: '21:00',
      cap: 25,
      services: [
        ['Veg thali tiffin, daily', 80],
        ['Jain tiffin', 90],
        ['Party meal tray', 450],
      ],
    },
    {
      id: 'k-sunita',
      userId: 'u-sunita',
      biz: 'Sunita Wash & Iron',
      owner: 'Sunita Devi',
      emoji: '👕',
      lat: 23.0265,
      lng: 72.5401,
      area: 'Ambawadi, Ahmedabad',
      rating: 4.6,
      reviews: 84,
      open: 1,
      color: '#B3E1E6',
      phone: '9876540002',
      displayPhone: '98765 40002',
      radius: 4,
      openTime: '07:30',
      closeTime: '20:00',
      cap: 20,
      services: [
        ['Laundry: wash and iron, per piece', 12],
        ['Saree care', 60],
        ['Bedsheet wash', 50],
      ],
    },
    {
      id: 'k-rekha',
      userId: 'u-rekha',
      biz: 'Rekha Stitching Studio',
      owner: 'Rekha Ben',
      emoji: '🧵',
      lat: 23.0301,
      lng: 72.5598,
      area: 'CG Road, Ahmedabad',
      rating: 4.9,
      reviews: 203,
      open: 0,
      color: '#FFE2A8',
      phone: '9876540003',
      displayPhone: '98765 40003',
      radius: 6,
      openTime: '10:00',
      closeTime: '19:30',
      cap: 10,
      services: [
        ['Blouse stitching', 250],
        ['Tailoring and alterations', 60],
        ['Kurti stitching', 350],
      ],
    },
    {
      id: 'k-kavita',
      userId: 'u-kavita',
      biz: "Kavita's Papad & Pickle",
      owner: 'Kavita Ji',
      emoji: '🫙',
      lat: 23.0165,
      lng: 72.5532,
      area: 'Paldi, Ahmedabad',
      rating: 4.7,
      reviews: 58,
      open: 1,
      color: '#FBD3E3',
      phone: '9876540004',
      displayPhone: '98765 40004',
      radius: 8,
      openTime: '09:00',
      closeTime: '20:00',
      cap: 18,
      services: [
        ['Urad papad, 1 kg', 140],
        ['Mango pickle, 500 g', 180],
      ],
    },
    {
      id: 'k-apa',
      userId: 'u-apa',
      biz: "Apa's Tiffin",
      owner: 'Farida Apa',
      emoji: '🍱',
      lat: 23.0498,
      lng: 72.5615,
      area: 'Usmanpura, Ahmedabad',
      rating: 4.5,
      reviews: 71,
      open: 1,
      color: '#B3E1E6',
      phone: '9876540005',
      displayPhone: '98765 40005',
      radius: 5,
      openTime: '09:00',
      closeTime: '21:30',
      cap: 20,
      services: [
        ['Non-veg tiffin', 110],
        ['Biryani, 1 kg', 420],
      ],
    },
    {
      id: 'k-pooja',
      userId: 'u-pooja',
      biz: "Pooja's Baking & Cakes",
      owner: 'Pooja Ben',
      emoji: '🧁',
      lat: 23.0258,
      lng: 72.5205,
      area: 'Satellite, Ahmedabad',
      rating: 4.9,
      reviews: 167,
      open: 1,
      color: '#FFE2A8',
      phone: '9876540006',
      displayPhone: '98765 40006',
      radius: 7,
      openTime: '09:30',
      closeTime: '21:00',
      cap: 12,
      services: [
        ['Eggless cake, 1 kg', 600],
        ['Cupcakes, box of 6', 300],
      ],
    },
    {
      id: 'k-jaya',
      userId: 'u-jaya',
      biz: 'Jaya Mehndi Art',
      owner: 'Jaya Ben',
      emoji: '🌿',
      lat: 23.0385,
      lng: 72.5295,
      area: 'Vastrapur, Ahmedabad',
      rating: 4.8,
      reviews: 92,
      open: 1,
      color: '#FBD3E3',
      phone: '9876540007',
      displayPhone: '98765 40007',
      radius: 6,
      openTime: '10:00',
      closeTime: '20:00',
      cap: 8,
      services: [
        ['Bridal mehndi', 800],
        ['Festive hands', 150],
      ],
    },
    {
      id: 'k-laxmi',
      userId: 'u-laxmi',
      biz: 'Laxmi Mithai Ghar',
      owner: 'Laxmi Ben',
      emoji: '🍬',
      lat: 23.0585,
      lng: 72.5568,
      area: 'Naranpura, Ahmedabad',
      rating: 4.8,
      reviews: 139,
      open: 1,
      color: '#FDE08A',
      phone: '9876540008',
      displayPhone: '98765 40008',
      radius: 8,
      openTime: '08:30',
      closeTime: '20:30',
      cap: 22,
      services: [
        ['Ladoo box, 500 g', 320],
        ['Mithai for festivals', 500],
        ['Farsan combo', 200],
      ],
    },
    {
      id: 'k-gauri',
      userId: 'u-gauri',
      biz: 'Gauri Hand Crafts',
      owner: 'Gauri Ben',
      emoji: '🪡',
      lat: 23.0412,
      lng: 72.5055,
      area: 'Bodakdev, Ahmedabad',
      rating: 4.7,
      reviews: 45,
      open: 1,
      color: '#B3E1E6',
      phone: '9876540009',
      displayPhone: '98765 40009',
      radius: 10,
      openTime: '10:00',
      closeTime: '19:00',
      cap: 10,
      services: [
        ['Embroidered potli bag', 350],
        ['Crochet toran', 220],
        ['Custom gift hamper', 700],
      ],
    },
    {
      id: 'k-shanta',
      userId: 'u-shanta',
      biz: 'Shanta Clay Works',
      owner: 'Shanta Ben',
      emoji: '🏺',
      lat: 22.9962,
      lng: 72.5995,
      area: 'Maninagar, Ahmedabad',
      rating: 4.6,
      reviews: 33,
      open: 0,
      color: '#FBD3E3',
      phone: '9876540010',
      displayPhone: '98765 40010',
      radius: 10,
      openTime: '09:00',
      closeTime: '18:30',
      cap: 12,
      services: [
        ['Painted matka', 250],
        ['Diya set of 12', 180],
      ],
    },
  ];

  // Ensure isolated user accounts exist for each seed Kaarigar + sample Neighbour
  const upsertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, name, phone, pin_hash, role)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const s of seeds) {
    upsertUser.run(s.userId, s.owner, s.phone, defaultPinHash, 'kaarigar');
  }
  upsertUser.run('u-rohan', 'Rohan Shah', '9876500001', defaultPinHash, 'customer');
  upsertUser.run('u-neha', 'Neha Desai', '9876500002', defaultPinHash, 'customer');

  const kCount = db.prepare('SELECT COUNT(*) as cnt FROM kaarigars').get().cnt;
  if (kCount === 0) {
    const insertK = db.prepare(`
      INSERT INTO kaarigars (
        id, user_id, business_name, owner_name, phone, emoji, theme_color, area_name,
        private_lat, private_lng, masked_lat, masked_lng, service_radius_km,
        open_time, close_time, is_open, daily_cap, id_verified, rating, review_count, trust_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertS = db.prepare(`
      INSERT INTO services (id, kaarigar_id, title, price_inr, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const s of seeds) {
      const { maskedLat, maskedLng } = maskCoordinates(s.lat, s.lng, s.id);
      const trust = computeTrustScore({
        idVerified: true,
        rating: s.rating,
        reviewCount: s.reviews,
        photoReviewsCount: 2,
      });
      insertK.run(
        s.id,
        s.userId,
        s.biz,
        s.owner,
        s.displayPhone,
        s.emoji,
        s.color,
        s.area,
        s.lat,
        s.lng,
        maskedLat,
        maskedLng,
        s.radius,
        s.openTime,
        s.closeTime,
        s.open,
        s.cap,
        1,
        s.rating,
        s.reviews,
        trust
      );
      s.services.forEach(([title, price], idx) => {
        insertS.run(`${s.id}-s${idx}`, s.id, title, price, idx);
      });
    }

    const insertOrder = db.prepare(`
      INSERT INTO orders (
        id, customer_user_id, kaarigar_id, service_id, service_title, unit_price, quantity,
        total_inr, commission_inr, net_payout_inr, fulfilment_type, payment_method,
        customer_name, customer_note, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertOrder.run(
      'ord-seed-1',
      'u-rohan',
      'k-meena',
      'k-meena-s0',
      'Veg thali tiffin, daily',
      80,
      3,
      240,
      22,
      218,
      'delivery',
      'upi',
      'Rohan Shah',
      'Less spicy please, gate 2 near LDCE hostel',
      'completed'
    );
    insertOrder.run(
      'ord-seed-2',
      'u-neha',
      'k-meena',
      'k-meena-s2',
      'Party meal tray',
      450,
      2,
      900,
      81,
      819,
      'pickup',
      'upi',
      'Neha Desai',
      'Pickup at 7:30 PM',
      'accepted'
    );
    db.prepare('INSERT INTO order_messages (id, order_id, sender, body) VALUES (?, ?, ?, ?)').run(
      'msg-seed-1',
      'ord-seed-2',
      'customer',
      'Hi Meena Ben! Confirmed for 7:30 PM pickup.'
    );
    db.prepare('INSERT INTO order_messages (id, order_id, sender, body) VALUES (?, ?, ?, ?)').run(
      'msg-seed-2',
      'ord-seed-2',
      'kaarigar',
      'Namaste Neha! Yes, fresh phulkas will be packed warm at 7:25 PM.'
    );
  } else {
    // Link existing Phase 1 rows to their dedicated user accounts
    const updateKUser = db.prepare('UPDATE kaarigars SET user_id = ? WHERE id = ? AND user_id IS NULL');
    for (const s of seeds) {
      updateKUser.run(s.userId, s.id);
    }
    db.prepare("UPDATE orders SET customer_user_id = 'u-rohan' WHERE id = 'ord-seed-1' AND customer_user_id IS NULL").run();
    db.prepare("UPDATE orders SET customer_user_id = 'u-neha' WHERE id = 'ord-seed-2' AND customer_user_id IS NULL").run();
  }
}

seedDatabaseAndAccounts();

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true,
  })
);
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));

// Simple IP rate limiter for login & registration to prevent PIN brute-forcing
const authAttempts = new Map();
function authRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'local';
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    return next();
  }
  entry.count += 1;
  if (entry.count > 15) {
    return res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes.' });
  }
  next();
}

// Auth Middleware: Verifies Bearer token and attaches req.user + req.kaarigar
function getAuthenticatedUser(req) {
  const header = String(req.headers.authorization ?? '');
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  if (!token) return null;

  const row = db
    .prepare(`
      SELECT u.id, u.name, u.phone, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')
    `)
    .get(token);
  if (!row) return null;

  const shop = db.prepare('SELECT id, business_name FROM kaarigars WHERE user_id = ?').get(row.id);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    role: row.role,
    kaarigarId: shop?.id ?? null,
    businessName: shop?.business_name ?? null,
  };
}

function requireAuth(req, res, next) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Please log in to continue.' });
  }
  req.user = user;
  next();
}

// ==================== AUTH ENDPOINTS ====================

app.post('/api/auth/register', authRateLimit, (req, res) => {
  const { name, phone, pin, role = 'customer' } = req.body ?? {};
  const cleanName = String(name ?? '').trim();
  const cleanPhone = normalizePhone(phone);
  const cleanPin = String(pin ?? '').trim();
  const cleanRole = role === 'kaarigar' ? 'kaarigar' : 'customer';

  if (!cleanName) return res.status(400).json({ error: 'Enter your name.' });
  if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  if (cleanPin.length < 4) return res.status(400).json({ error: 'Set a PIN or password of at least 4 characters.' });

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (existing) {
    return res.status(409).json({ error: 'This mobile number is already registered. Please log in.' });
  }

  const userId = `u-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare('INSERT INTO users (id, name, phone, pin_hash, role) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    cleanName,
    cleanPhone,
    hashPin(cleanPin),
    cleanRole
  );

  const token = createSessionToken(userId);
  res.status(201).json({
    token,
    user: {
      id: userId,
      name: cleanName,
      phone: cleanPhone,
      role: cleanRole,
      kaarigarId: null,
      businessName: null,
    },
  });
});

app.post('/api/auth/login', authRateLimit, (req, res) => {
  const cleanPhone = normalizePhone(req.body?.phone);
  const cleanPin = String(req.body?.pin ?? '').trim();

  if (cleanPhone.length !== 10 || !cleanPin) {
    return res.status(400).json({ error: 'Enter your 10-digit mobile number and PIN.' });
  }

  const row = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  if (!row || !verifyPin(cleanPin, row.pin_hash)) {
    return res.status(401).json({ error: 'Incorrect mobile number or PIN.' });
  }

  const token = createSessionToken(row.id);
  const shop = db.prepare('SELECT id, business_name FROM kaarigars WHERE user_id = ?').get(row.id);

  res.json({
    token,
    user: {
      id: row.id,
      name: row.name,
      phone: row.phone,
      role: row.role,
      kaarigarId: shop?.id ?? null,
      businessName: shop?.business_name ?? null,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  const header = String(req.headers.authorization ?? '');
  if (header.startsWith('Bearer ')) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(header.slice(7).trim());
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const user = getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  res.json({ user });
});

// ==================== ACCURATE INDIA MAP & PLACES API ====================
// Supports: 1) Ola Maps (free, no credit card) -> 2) Geoapify (free, no credit card) -> 3) Live Photon + Nominatim (zero key)

const KNOWN_PLACES = [
  { key: 'ldce', lat: 23.0338, lng: 72.5466, label: 'L.D. College of Engineering, Navrangpura, Ahmedabad' },
  { key: 'navrangpura', lat: 23.0365, lng: 72.5611, label: 'Navrangpura, Ahmedabad' },
  { key: 'paldi', lat: 23.0145, lng: 72.5603, label: 'Paldi, Ahmedabad' },
  { key: 'satellite', lat: 23.0274, lng: 72.5174, label: 'Satellite, Ahmedabad' },
  { key: 'vastrapur', lat: 23.0396, lng: 72.5286, label: 'Vastrapur, Ahmedabad' },
  { key: 'maninagar', lat: 22.9968, lng: 72.6022, label: 'Maninagar, Ahmedabad' },
  { key: 'bodakdev', lat: 23.0402, lng: 72.5067, label: 'Bodakdev, Ahmedabad' },
  { key: 'bopal', lat: 23.0334, lng: 72.4638, label: 'Bopal, Ahmedabad' },
  { key: 'naranpura', lat: 23.0568, lng: 72.5562, label: 'Naranpura, Ahmedabad' },
  { key: 'usmanpura', lat: 23.0472, lng: 72.5665, label: 'Usmanpura, Ahmedabad' },
  { key: 'ambawadi', lat: 23.0242, lng: 72.5432, label: 'Ambawadi, Ahmedabad' },
  { key: 'cg road', lat: 23.0298, lng: 72.5584, label: 'CG Road, Navrangpura, Ahmedabad' },
  { key: 'law garden', lat: 23.0264, lng: 72.5611, label: 'Law Garden, Ellisbridge, Ahmedabad' },
  { key: 'prahlad nagar', lat: 23.0120, lng: 72.5108, label: 'Prahlad Nagar, Ahmedabad' },
  { key: 'shyamal', lat: 23.0131, lng: 72.5269, label: 'Shyamal Cross Road, Satellite, Ahmedabad' },
  { key: 'gurukul', lat: 23.0449, lng: 72.5338, label: 'Gurukul Road, Memnagar, Ahmedabad' },
  { key: 'chandkheda', lat: 23.1092, lng: 72.5844, label: 'Chandkheda, Ahmedabad' },
  { key: 'sabarmati', lat: 23.0811, lng: 72.5858, label: 'Sabarmati, Ahmedabad' },
  { key: 'gota', lat: 23.0987, lng: 72.5364, label: 'Gota, Ahmedabad' },
  { key: 'thaltej', lat: 23.0497, lng: 72.5117, label: 'Thaltej, Ahmedabad' },
  { key: 'ellisbridge', lat: 23.0225, lng: 72.5714, label: 'Ellisbridge, Ahmedabad' },
];

app.get('/api/places/autocomplete', async (req, res) => {
  const input = String(req.query.q ?? '').trim();
  if (input.length < 2) return res.json({ suggestions: [] });

  const olaKey = process.env.VITE_OLA_MAPS_API_KEY || process.env.OLA_MAPS_API_KEY;
  const geoapifyKey = process.env.VITE_GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY;
  const results = [];

  // 1. Instant local match for top Ahmedabad localities
  const lower = input.toLowerCase();
  for (const p of KNOWN_PLACES) {
    if (p.key.includes(lower) || p.label.toLowerCase().includes(lower)) {
      results.push({ lat: p.lat, lng: p.lng, label: p.label, source: 'preset' });
    }
  }

  // 2. Ola Maps Places Autocomplete (Hyper-accurate Indian societies/streets, free without credit card)
  if (olaKey) {
    try {
      const url = `https://api.olamaps.io/places/v1/autocomplete?input=${encodeURIComponent(input)}&location=23.0338,72.5466&api_key=${encodeURIComponent(olaKey)}`;
      const r = await fetch(url, {
        headers: { 'X-Request-Id': crypto.randomUUID() },
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const data = await r.json();
        for (const pred of (data.predictions ?? []).slice(0, 6)) {
          const lat = pred.geometry?.location?.lat;
          const lng = pred.geometry?.location?.lng;
          if (typeof lat === 'number' && typeof lng === 'number') {
            results.push({
              lat,
              lng,
              label: pred.description || pred.structured_formatting?.main_text || input,
              source: 'ola',
            });
          }
        }
        if (results.length > 0) return res.json({ suggestions: dedupePlaces(results).slice(0, 6) });
      }
    } catch {
      // Fall through
    }
  }

  // 3. Geoapify Autocomplete (Free email signup, no credit card)
  if (geoapifyKey) {
    try {
      const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(input)}&filter=countrycode:in&bias=proximity:72.5466,23.0338&limit=6&apiKey=${encodeURIComponent(geoapifyKey)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const data = await r.json();
        for (const f of data.features ?? []) {
          if (f.geometry?.coordinates) {
            results.push({
              lng: Number(f.geometry.coordinates[0]),
              lat: Number(f.geometry.coordinates[1]),
              label: f.properties?.formatted || input,
              source: 'geoapify',
            });
          }
        }
        if (results.length > 0) return res.json({ suggestions: dedupePlaces(results).slice(0, 6) });
      }
    } catch {
      // Fall through
    }
  }

  // 4. Live Zero-Key Autocomplete via Photon (Komoot OSM) biased to Ahmedabad + Nominatim India
  try {
    const qIndia = /ahmedabad|gujarat|surat|vadodara|rajkot|gandhinagar|india/i.test(input)
      ? input
      : `${input} Ahmedabad`;
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(qIndia)}&lat=23.0338&lon=72.5466&limit=6&lang=en`;
    const pr = await fetch(photonUrl, { signal: AbortSignal.timeout(4000) });
    if (pr.ok) {
      const pData = await pr.json();
      for (const f of pData.features ?? []) {
        const p = f.properties ?? {};
        if (p.countrycode && p.countrycode.toUpperCase() !== 'IN') continue;
        const parts = [p.name, p.street, p.district || p.suburb || p.locality, p.city || p.state]
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);
        if (f.geometry?.coordinates && parts.length > 0) {
          results.push({
            lng: Number(f.geometry.coordinates[0]),
            lat: Number(f.geometry.coordinates[1]),
            label: parts.slice(0, 3).join(', '),
            source: 'photon',
          });
        }
      }
    }
  } catch {
    // Ignore
  }

  if (results.length < 3) {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=5&q=${encodeURIComponent(input + ', Ahmedabad')}`;
      const nr = await fetch(nomUrl, {
        headers: { 'User-Agent': 'Kaarigar-SSIP-MVP/1.1' },
        signal: AbortSignal.timeout(4000),
      });
      if (nr.ok) {
        const nData = await nr.json();
        for (const item of nData ?? []) {
          results.push({
            lat: Number(item.lat),
            lng: Number(item.lon),
            label: String(item.display_name).split(',').slice(0, 3).join(',').trim(),
            source: 'nominatim',
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  res.json({ suggestions: dedupePlaces(results).slice(0, 6) });
});

function dedupePlaces(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = `${item.label.toLowerCase().slice(0, 24)}:${item.lat.toFixed(3)}:${item.lng.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

// Live Reverse Geocoding when user clicks GPS or drags pin
app.get('/api/places/reverse', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  const olaKey = process.env.VITE_OLA_MAPS_API_KEY || process.env.OLA_MAPS_API_KEY;
  const geoapifyKey = process.env.VITE_GEOAPIFY_API_KEY || process.env.GEOAPIFY_API_KEY;

  if (olaKey) {
    try {
      const r = await fetch(
        `https://api.olamaps.io/places/v1/reverse-geocode?latlng=${lat},${lng}&api_key=${encodeURIComponent(olaKey)}`,
        { headers: { 'X-Request-Id': crypto.randomUUID() }, signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const data = await r.json();
        const addr = data?.results?.[0]?.formatted_address;
        if (addr) {
          return res.json({
            lat,
            lng,
            label: addr.split(',').slice(0, 3).join(',').trim(),
          });
        }
      }
    } catch {
      // Fall through
    }
  }

  if (geoapifyKey) {
    try {
      const r = await fetch(
        `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${encodeURIComponent(geoapifyKey)}`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const data = await r.json();
        const addr = data?.features?.[0]?.properties?.formatted;
        if (addr) {
          return res.json({
            lat,
            lng,
            label: addr.split(',').slice(0, 3).join(',').trim(),
          });
        }
      }
    } catch {
      // Fall through
    }
  }

  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
      {
        headers: { 'User-Agent': 'Kaarigar-SSIP-MVP/1.1' },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (r.ok) {
      const data = await r.json();
      const a = data.address ?? {};
      const parts = [
        a.neighbourhood || a.residential || a.road || a.amenity,
        a.suburb || a.city_district || a.quarter,
        a.city || a.town || a.state_district,
      ].filter(Boolean);
      if (parts.length > 0) {
        return res.json({ lat, lng, label: parts.join(', ') });
      }
    }
  } catch {
    // Fall through
  }

  res.json({ lat, lng, label: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
});

// Forward Geocode single string
app.get('/api/geocode', async (req, res) => {
  const raw = String(req.query.q ?? '').trim();
  if (!raw) return res.status(400).json({ error: 'Missing query' });

  const lower = raw.toLowerCase().replace(/,\s*(ahmedabad|gujarat|india)/g, '').trim();
  for (const p of KNOWN_PLACES) {
    if (lower === p.key || lower.includes(p.key)) {
      return res.json({ lat: p.lat, lng: p.lng, label: p.label });
    }
  }

  // Delegate to same pipeline as autocomplete top hit
  try {
    const queryWithRegion = /ahmedabad|surat|vadodara|rajkot|gandhinagar|gujarat|india/i.test(raw)
      ? raw
      : `${raw}, Ahmedabad, Gujarat, India`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=1&q=${encodeURIComponent(queryWithRegion)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Kaarigar-SSIP-MVP/1.1' },
      signal: AbortSignal.timeout(4500),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data) && data.length > 0) {
        return res.json({
          lat: Number(data[0].lat),
          lng: Number(data[0].lon),
          label: data[0].display_name.split(',').slice(0, 3).join(',').trim(),
        });
      }
    }
  } catch {
    // Ignore
  }

  res.status(404).json({ error: `Could not locate "${raw}"` });
});

// ==================== PUBLIC DISCOVERY ====================

function buildKaarigarPublicPayload(row, userLat, userLng) {
  const services = db
    .prepare('SELECT id, title, price_inr FROM services WHERE kaarigar_id = ? ORDER BY sort_order ASC')
    .all(row.id);
  const photos = db
    .prepare('SELECT id, url FROM kaarigar_photos WHERE kaarigar_id = ? ORDER BY created_at DESC')
    .all(row.id);
  const reviews = db
    .prepare('SELECT id, customer_name, rating, comment, photo_url, created_at FROM reviews WHERE kaarigar_id = ? ORDER BY created_at DESC LIMIT 8')
    .all(row.id);
  const todayRow = db
    .prepare("SELECT COUNT(*) as cnt FROM orders WHERE kaarigar_id = ? AND date(created_at) = date('now') AND status != 'cancelled'")
    .get(row.id);
  const ordersToday = todayRow?.cnt ?? 0;
  const distKm = Number(haversineKm(userLat, userLng, row.private_lat, row.private_lng).toFixed(2));
  const takingOrders = Boolean(row.is_open) && ordersToday < row.daily_cap;

  // NEVER expose private_lat, private_lng, user_id, or phone in public discovery!
  return {
    id: row.id,
    businessName: row.business_name,
    ownerName: row.owner_name,
    emoji: row.emoji,
    themeColor: row.theme_color,
    areaName: row.area_name,
    maskedLat: row.masked_lat,
    maskedLng: row.masked_lng,
    distanceKm: distKm,
    serviceRadiusKm: row.service_radius_km,
    openTime: row.open_time,
    closeTime: row.close_time,
    isOpen: Boolean(row.is_open),
    dailyCap: row.daily_cap,
    ordersToday,
    takingOrders,
    idVerified: Boolean(row.id_verified),
    rating: row.rating,
    reviewCount: row.review_count,
    trustScore: row.trust_score,
    services: services.map((s) => ({ id: s.id, title: s.title, priceInr: s.price_inr })),
    photos: photos.map((p) => p.url),
    reviews: reviews.map((r) => ({
      id: r.id,
      customerName: r.customer_name,
      rating: r.rating,
      comment: r.comment,
      photoUrl: r.photo_url,
      createdAt: r.created_at,
    })),
  };
}

app.get('/api/kaarigars', (req, res) => {
  const lat = Number(req.query.lat ?? 23.0338);
  const lng = Number(req.query.lng ?? 72.5466);
  const radiusKm = Number(req.query.radius ?? 5);
  const q = String(req.query.q ?? '').trim().toLowerCase();
  const sort = String(req.query.sort ?? 'd');

  const rows = db.prepare('SELECT * FROM kaarigars').all();
  let items = rows
    .map((r) => buildKaarigarPublicPayload(r, lat, lng))
    .filter((k) => k.distanceKm <= radiusKm);

  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    items = items.filter((k) => {
      const hay = `${k.businessName} ${k.ownerName} ${k.areaName} ${k.services.map((s) => s.title).join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  const lowestPrice = (k) => (k.services.length ? Math.min(...k.services.map((s) => s.priceInr)) : 99999);
  items.sort((a, b) => {
    if (sort === 'r') return b.rating - a.rating || a.distanceKm - b.distanceKm;
    if (sort === 'p') return lowestPrice(a) - lowestPrice(b);
    return a.distanceKm - b.distanceKm;
  });

  res.json({ kaarigars: items, center: { lat, lng } });
});

function saveDataUrlImage(dataUrl, prefix = 'img') {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null;
  }
  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
  if (!match) return null;
  const rawExt = match[1].toLowerCase();
  const allowed = new Set(['jpeg', 'jpg', 'png', 'webp', 'gif']);
  if (!allowed.has(rawExt)) return null; // Reject SVG/XML uploads to prevent stored XSS
  const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
  const filename = `${prefix.replace(/[^a-zA-Z0-9_-]/g, '')}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), Buffer.from(match[2], 'base64'));
  return `/uploads/${filename}`;
}

// ==================== AUTHENTICATED KAARIGAR ONBOARDING ====================

app.post('/api/kaarigars', requireAuth, (req, res) => {
  const existingShop = db.prepare('SELECT id FROM kaarigars WHERE user_id = ?').get(req.user.id);
  if (existingShop) {
    return res.status(409).json({ error: 'Your account already has a registered shop.' });
  }

  const {
    businessName,
    emoji = '🍱',
    themeColor = '#FBD3E3',
    areaName = 'Navrangpura, Ahmedabad',
    lat = 23.0338,
    lng = 72.5466,
    serviceRadiusKm = 5,
    openTime = '09:00',
    closeTime = '20:00',
    dailyCap = 15,
    idVerified = true,
    services = [],
    photos = [],
  } = req.body ?? {};

  if (!businessName || !Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ error: 'Business name and at least one service are required.' });
  }

  // Upgrade role to kaarigar if registering from a neighbour account
  db.prepare("UPDATE users SET role = 'kaarigar' WHERE id = ?").run(req.user.id);

  const id = `k-${crypto.randomUUID().slice(0, 8)}`;
  const { maskedLat, maskedLng } = maskCoordinates(Number(lat), Number(lng), id);
  const trustScore = computeTrustScore({
    idVerified: Boolean(idVerified),
    rating: 5.0,
    reviewCount: 0,
    photoReviewsCount: 0,
  });

  db.prepare(`
    INSERT INTO kaarigars (
      id, user_id, business_name, owner_name, phone, emoji, theme_color, area_name,
      private_lat, private_lng, masked_lat, masked_lng, service_radius_km,
      open_time, close_time, is_open, daily_cap, id_verified, rating, review_count, trust_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 5.0, 0, ?)
  `).run(
    id,
    req.user.id,
    String(businessName).trim(),
    req.user.name,
    req.user.phone,
    emoji,
    themeColor,
    String(areaName).trim(),
    Number(lat),
    Number(lng),
    maskedLat,
    maskedLng,
    Number(serviceRadiusKm),
    openTime,
    closeTime,
    Number(dailyCap),
    idVerified ? 1 : 0,
    trustScore
  );

  const insertS = db.prepare('INSERT INTO services (id, kaarigar_id, title, price_inr, sort_order) VALUES (?, ?, ?, ?, ?)');
  services.forEach((s, idx) => {
    const title = String(s.title ?? '').trim();
    const price = Math.max(10, Number(s.priceInr ?? 100));
    if (title) insertS.run(`${id}-s${idx}`, id, title, price, idx);
  });

  const insertP = db.prepare('INSERT INTO kaarigar_photos (id, kaarigar_id, url) VALUES (?, ?, ?)');
  photos.slice(0, 8).forEach((p, idx) => {
    const saved = saveDataUrlImage(p, id) ?? (typeof p === 'string' && p.startsWith('http') ? p : null);
    if (saved) insertP.run(`${id}-p${idx}`, id, saved);
  });

  const created = db.prepare('SELECT * FROM kaarigars WHERE id = ?').get(id);
  res.status(201).json({
    kaarigar: buildKaarigarPublicPayload(created, Number(lat), Number(lng)),
  });
});

// ==================== AUTHENTICATED ORDERS, CHAT & REVIEWS ====================

// Helper: verify user is either the buyer OR the shop owner of an order
function canAccessOrder(orderRow, user) {
  if (!orderRow || !user) return false;
  if (orderRow.customer_user_id === user.id) return true;
  const k = db.prepare('SELECT user_id FROM kaarigars WHERE id = ?').get(orderRow.kaarigar_id);
  return k?.user_id === user.id;
}

app.post('/api/orders', requireAuth, (req, res) => {
  const {
    kaarigarId,
    serviceId,
    quantity = 1,
    fulfilmentType = 'pickup',
    paymentMethod = 'upi',
    customerNote = '',
  } = req.body ?? {};

  const k = db.prepare('SELECT * FROM kaarigars WHERE id = ?').get(kaarigarId);
  if (!k) return res.status(404).json({ error: 'Kaarigar not found.' });
  if (k.user_id === req.user.id) {
    return res.status(400).json({ error: 'You cannot place an order on your own shop.' });
  }

  const todayRow = db
    .prepare("SELECT COUNT(*) as cnt FROM orders WHERE kaarigar_id = ? AND date(created_at) = date('now') AND status != 'cancelled'")
    .get(k.id);
  if (!k.is_open || (todayRow?.cnt ?? 0) >= k.daily_cap) {
    return res.status(400).json({ error: 'This kaarigar has paused orders or reached her daily limit.' });
  }

  const svc = serviceId
    ? db.prepare('SELECT * FROM services WHERE id = ? AND kaarigar_id = ?').get(serviceId, k.id)
    : db.prepare('SELECT * FROM services WHERE kaarigar_id = ? ORDER BY sort_order ASC LIMIT 1').get(k.id);
  if (!svc) return res.status(400).json({ error: 'Service not found.' });

  const qty = Math.min(20, Math.max(1, Number(quantity)));
  const totalInr = svc.price_inr * qty;
  const commissionInr = Math.round(totalInr * 0.09);
  const netPayoutInr = totalInr - commissionInr;
  const orderId = `ord-${crypto.randomUUID().slice(0, 8)}`;

  db.prepare(`
    INSERT INTO orders (
      id, customer_user_id, kaarigar_id, service_id, service_title, unit_price, quantity,
      total_inr, commission_inr, net_payout_inr, fulfilment_type, payment_method,
      customer_name, customer_note, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed')
  `).run(
    orderId,
    req.user.id,
    k.id,
    svc.id,
    svc.title,
    svc.price_inr,
    qty,
    totalInr,
    commissionInr,
    netPayoutInr,
    fulfilmentType === 'delivery' ? 'delivery' : 'pickup',
    paymentMethod === 'cod' ? 'cod' : 'upi',
    req.user.name,
    String(customerNote || '').trim()
  );

  const insertMsg = db.prepare('INSERT INTO order_messages (id, order_id, sender, body) VALUES (?, ?, ?, ?)');
  insertMsg.run(`msg-${crypto.randomUUID().slice(0, 8)}`, orderId, 'customer', `Hi! I just ordered ${qty} × ${svc.title} (${fulfilmentType}).`);
  insertMsg.run(
    `msg-${crypto.randomUUID().slice(0, 8)}`,
    orderId,
    'kaarigar',
    `Namaste ${req.user.name.split(' ')[0]}! Order received by ${k.owner_name}. ${fulfilmentType === 'pickup' ? `Pickup near ${k.area_name}.` : 'Please share your society/flat details here.'}`
  );

  res.status(201).json({
    order: {
      id: orderId,
      kaarigarId: k.id,
      businessName: k.business_name,
      ownerName: k.owner_name,
      unlockedPhone: k.phone,
      pickupArea: k.area_name,
      serviceTitle: svc.title,
      unitPrice: svc.price_inr,
      quantity: qty,
      totalInr,
      fulfilmentType,
      paymentMethod,
      customerNote,
      status: 'placed',
    },
  });
});

// Logged-in customer's own orders ONLY
app.get('/api/me/orders', requireAuth, (req, res) => {
  const rows = db
    .prepare(`
      SELECT o.*, k.business_name, k.owner_name, k.phone as unlocked_phone, k.area_name, k.emoji
      FROM orders o
      JOIN kaarigars k ON k.id = o.kaarigar_id
      WHERE o.customer_user_id = ?
      ORDER BY o.rowid DESC
    `)
    .all(req.user.id);

  res.json({
    orders: rows.map((o) => ({
      id: o.id,
      kaarigarId: o.kaarigar_id,
      businessName: o.business_name,
      ownerName: o.owner_name,
      emoji: o.emoji,
      unlockedPhone: o.unlocked_phone,
      pickupArea: o.area_name,
      serviceTitle: o.service_title,
      unitPrice: o.unit_price,
      quantity: o.quantity,
      totalInr: o.total_inr,
      fulfilmentType: o.fulfilment_type,
      paymentMethod: o.payment_method,
      customerNote: o.customer_note,
      status: o.status,
      createdAt: o.created_at,
      hasReview: Boolean(db.prepare('SELECT 1 FROM reviews WHERE order_id = ?').get(o.id)),
    })),
  });
});

app.get('/api/orders/:orderId/messages', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!canAccessOrder(order, req.user)) {
    return res.status(403).json({ error: 'Forbidden: you are not a participant in this order.' });
  }

  const msgs = db
    .prepare('SELECT id, order_id, sender, body, created_at FROM order_messages WHERE order_id = ? ORDER BY rowid ASC')
    .all(order.id);
  res.json({
    messages: msgs.map((m) => ({
      id: m.id,
      orderId: m.order_id,
      sender: m.sender,
      body: m.body,
      createdAt: m.created_at,
    })),
  });
});

app.post('/api/orders/:orderId/messages', requireAuth, (req, res) => {
  const clean = String(req.body?.body ?? '').trim();
  if (!clean) return res.status(400).json({ error: 'Message cannot be empty.' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!canAccessOrder(order, req.user)) {
    return res.status(403).json({ error: 'Forbidden: you are not a participant in this order.' });
  }

  const k = db.prepare('SELECT user_id FROM kaarigars WHERE id = ?').get(order.kaarigar_id);
  const senderRole = k?.user_id === req.user.id ? 'kaarigar' : 'customer';

  const id = `msg-${crypto.randomUUID().slice(0, 8)}`;
  db.prepare('INSERT INTO order_messages (id, order_id, sender, body) VALUES (?, ?, ?, ?)').run(
    id,
    order.id,
    senderRole,
    clean
  );

  const msgs = db
    .prepare('SELECT id, order_id, sender, body, created_at FROM order_messages WHERE order_id = ? ORDER BY rowid ASC')
    .all(order.id);
  res.status(201).json({
    messages: msgs.map((m) => ({
      id: m.id,
      orderId: m.order_id,
      sender: m.sender,
      body: m.body,
      createdAt: m.created_at,
    })),
  });
});

app.post('/api/orders/:orderId/review', requireAuth, (req, res) => {
  const { rating = 5, comment = '', photoDataUrl = null } = req.body ?? {};
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.customer_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the customer who placed this order can review it.' });
  }

  const k = db.prepare('SELECT * FROM kaarigars WHERE id = ?').get(order.kaarigar_id);
  if (!k) return res.status(404).json({ error: 'Kaarigar not found.' });

  const savedPhoto = saveDataUrlImage(photoDataUrl, `rev-${k.id}`);
  const stars = Math.min(5, Math.max(1, Number(rating)));
  const revId = `rev-${crypto.randomUUID().slice(0, 8)}`;

  db.prepare(`
    INSERT OR REPLACE INTO reviews (id, order_id, kaarigar_id, customer_name, rating, comment, photo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(revId, order.id, k.id, req.user.name, stars, String(comment).trim(), savedPhoto);

  db.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").run(order.id);

  const newCount = k.review_count + 1;
  const newRating = Number(((k.rating * k.review_count + stars) / newCount).toFixed(1));
  const photoRevCnt = db
    .prepare('SELECT COUNT(*) as cnt FROM reviews WHERE kaarigar_id = ? AND photo_url IS NOT NULL')
    .get(k.id).cnt;
  const newTrust = computeTrustScore({
    idVerified: Boolean(k.id_verified),
    rating: newRating,
    reviewCount: newCount,
    photoReviewsCount: photoRevCnt + 2,
  });

  db.prepare('UPDATE kaarigars SET rating = ?, review_count = ?, trust_score = ? WHERE id = ?').run(
    newRating,
    newCount,
    newTrust,
    k.id
  );

  res.status(201).json({ rating: newRating, reviewCount: newCount, trustScore: newTrust, photoUrl: savedPhoto });
});

// ==================== STRICT SELF-ONLY PROVIDER DASHBOARD (/api/me/dashboard) ====================

app.get('/api/me/dashboard', requireAuth, (req, res) => {
  const k = db.prepare('SELECT * FROM kaarigars WHERE user_id = ?').get(req.user.id);
  if (!k) {
    return res.status(404).json({ error: 'No shop set up on this account yet.', needsOnboarding: true });
  }

  const orders = db
    .prepare('SELECT * FROM orders WHERE kaarigar_id = ? ORDER BY rowid DESC LIMIT 25')
    .all(k.id);

  const enrichedOrders = orders.map((o) => {
    const msgs = db
      .prepare('SELECT id, sender, body, created_at FROM order_messages WHERE order_id = ? ORDER BY rowid ASC')
      .all(o.id);
    return {
      id: o.id,
      serviceTitle: o.service_title,
      unitPrice: o.unit_price,
      quantity: o.quantity,
      totalInr: o.total_inr,
      commissionInr: o.commission_inr,
      netPayoutInr: o.net_payout_inr,
      fulfilmentType: o.fulfilment_type,
      paymentMethod: o.payment_method,
      customerName: o.customer_name,
      customerNote: o.customer_note,
      status: o.status,
      createdAt: o.created_at,
      messages: msgs,
    };
  });

  const activeOrders = orders.filter((o) => o.status !== 'cancelled');
  const grossInr = activeOrders.reduce((s, o) => s + o.total_inr, 0);
  const commissionInr = activeOrders.reduce((s, o) => s + o.commission_inr, 0);
  const netEarningsInr = activeOrders.reduce((s, o) => s + o.net_payout_inr, 0);
  const todayCnt = db
    .prepare("SELECT COUNT(*) as cnt FROM orders WHERE kaarigar_id = ? AND date(created_at) = date('now') AND status != 'cancelled'")
    .get(k.id).cnt;

  res.json({
    provider: {
      id: k.id,
      businessName: k.business_name,
      ownerName: k.owner_name,
      phone: k.phone,
      emoji: k.emoji,
      themeColor: k.theme_color,
      areaName: k.area_name,
      serviceRadiusKm: k.service_radius_km,
      openTime: k.open_time,
      closeTime: k.close_time,
      isOpen: Boolean(k.is_open),
      dailyCap: k.daily_cap,
      ordersToday: todayCnt,
      trustScore: k.trust_score,
      rating: k.rating,
      reviewCount: k.review_count,
    },
    earnings: {
      grossInr,
      commissionInr,
      netEarningsInr,
      commissionRatePct: 9,
      nextPayoutLabel: 'Every Monday via UPI',
    },
    orders: enrichedOrders,
  });
});

app.patch('/api/me/settings', requireAuth, (req, res) => {
  const k = db.prepare('SELECT * FROM kaarigars WHERE user_id = ?').get(req.user.id);
  if (!k) return res.status(404).json({ error: 'No shop found for your account.' });

  const isOpen = req.body.isOpen !== undefined ? (req.body.isOpen ? 1 : 0) : k.is_open;
  const dailyCap = req.body.dailyCap !== undefined ? Math.max(1, Number(req.body.dailyCap)) : k.daily_cap;
  const openTime = req.body.openTime ?? k.open_time;
  const closeTime = req.body.closeTime ?? k.close_time;
  const serviceRadiusKm =
    req.body.serviceRadiusKm !== undefined ? Math.max(1, Number(req.body.serviceRadiusKm)) : k.service_radius_km;

  db.prepare(`
    UPDATE kaarigars
    SET is_open = ?, daily_cap = ?, open_time = ?, close_time = ?, service_radius_km = ?
    WHERE id = ?
  `).run(isOpen, dailyCap, openTime, closeTime, serviceRadiusKm, k.id);

  res.json({ ok: true });
});

app.patch('/api/orders/:orderId/status', requireAuth, (req, res) => {
  const { status } = req.body ?? {};
  const allowed = ['placed', 'accepted', 'ready', 'completed', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const k = db.prepare('SELECT user_id FROM kaarigars WHERE id = ?').get(order.kaarigar_id);
  if (k?.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden: only this shop’s owner can update order status.' });
  }

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.orderId);
  res.json({ ok: true });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Kaarigar local API + Auth + SQLite listening on http://127.0.0.1:${PORT}`);
});
