
// console.log('SMS ROUTES FILE LOADED');

const express = require('express');
const router = express.Router();

const auth = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');
const rateLimit = require('../middleware/rateLimit.middleware');

const {
  sendSMS,
  queueSMS,
  getSmsLogsHandler,
  getSmsLogByIdHandler,
  sendEventSMS,
  getSmsStatsHandler
} = require('../controllers/sms.controller');


// ── SEND SMS (immediate) ─────────────────────────────
router.post(
  '/send',
  auth,
  rateLimit,
  validate,
  sendSMS
);


// ── QUEUE SMS (async / bulk) ─────────────────────────
router.post(
  '/queue',
  auth,
  rateLimit,
  validate,
  queueSMS
);


// ── GET ALL LOGS ─────────────────────────────────────
router.get(
  '/logs',
  auth,
  getSmsLogsHandler
);


// ── GET SINGLE LOG ───────────────────────────────────
router.get(
  '/logs/:id',
  auth,
  getSmsLogByIdHandler
);
// ── SEND EVENT SMS (bulk / queued) ───────────────────
router.post(
  '/event/:eventId/notify',
  auth,
  rateLimit,
  sendEventSMS
);

// ── GET STATS ────────────────────────────────────────
router.get(
  '/stats',
  auth,
  getSmsStatsHandler
);


module.exports = router;