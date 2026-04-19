require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const smsRoutes = require('./routes/sms.routes');

const app = express();

// ── Middleware ────────────────────────────────────────────────
app.use(express.json());
app.use(cors({
  origin: [
    'http://127.0.0.1:5501',
    'http://localhost:5501',
    'https://simamiakanisa-cms.vercel.app'
  ],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ── Health check (used by UptimeRobot to keep Render awake) ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Root ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'SimamiaKanisa API running', version: '1.0.0' });
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/sms', smsRoutes);

module.exports = app;