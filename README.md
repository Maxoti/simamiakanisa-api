# SimamiaKanisa API

> Multi-tenant Church Management System — REST API backend powering member management, contributions, pledges, events, and bulk SMS notifications.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [SMS System](#sms-system)
- [Running Tests](#running-tests)
- [Deployment](#deployment)

---

## Overview

SimamiaKanisa is a SaaS church management platform built for multi-tenant use. Each church (tenant) gets an isolated data environment. The API handles:

- Authentication via Supabase Auth
-  Member management
- Contributions & pledges tracking
-  Events scheduling
-  Bulk SMS notifications via Mobiwave
-  Analytics & reporting

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database & Auth | Supabase (PostgreSQL) |
| SMS Provider | Mobiwave |
| Queue | BullMQ + Redis (Upstash) |
| Testing | Jest + Supertest |
| Frontend | Vercel (separate repo) |

---

## Project Structure

```
simamiakanisa-api/
├── src/
│   ├── config/
│   │   └── supabase.js           # Supabase client
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   └── sms.controller.js     # sendSMS, queueSMS, sendEventSMS
│   ├── middleware/
│   │   ├── auth.middleware.js    # Supabase JWT verification
│   │   ├── validate.middleware.js
│   │   └── rateLimit.middleware.js
│   ├── models/
│   │   └── sms.model.js          # SMS log CRUD
│   ├── queues/
│   │   └── sms.queue.js          # BullMQ producer & worker
│   ├── routes/
│   │   ├── auth.routes.js
│   │   └── sms.routes.js
│   ├── services/
│   │   ├── sms.service.js        # Core send logic + phone normalization
│   │   └── mobiwave.service.js   # Mobiwave HTTP client
│   └── app.js
├── tests/
│   ├── auth.test.js
│   └── sms.test.js               # 20 tests across 3 suites
├── .env
├── jest.config.js
└── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- A [Mobiwave](https://mobiwave.io) account
- A Redis instance ([Upstash](https://upstash.com) free tier recommended)

### Installation

```bash
git clone https://github.com/your-org/simamiakanisa-api.git
cd simamiakanisa-api
npm install
```

### Run locally

```bash
npm start
```

### Run in development (with auto-reload)

```bash
npm run dev
```

---

## Environment Variables

Create a `.env` file in the root directory:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Mobiwave SMS
MOBIWAVE_API_KEY=your-mobiwave-api-key
MOBIWAVE_SENDER_ID=SimamiaKanisa

# Redis (Upstash or local)
REDIS_URL=redis://default:password@your-upstash-url:6379

# App
PORT=3000
```

> ⚠️ Never commit `.env` to version control. It is already listed in `.gitignore`.

---

## API Reference

All routes are prefixed with `/api`. Protected routes require a valid Supabase JWT:

```
Authorization: Bearer <token>
```

---

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Sign in and receive JWT |
| POST | `/api/auth/logout` | Invalidate session |

---

### SMS

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/sms/send` | ✅ | Send SMS immediately to recipients |
| POST | `/api/sms/queue` | ✅ | Queue bulk SMS asynchronously |
| POST | `/api/sms/event/:eventId/notify` | ✅ | Notify all church members about an event |
| GET | `/api/sms/logs` | ✅ | Fetch SMS logs for a tenant |
| GET | `/api/sms/logs/:id` | ✅ | Fetch a single SMS log |
| GET | `/api/sms/stats` | ✅ | SMS stats + queue stats |

---

#### POST `/api/sms/send`

```json
{
  "recipients": ["254700000000", "254711111111"],
  "message": "Service starts at 10am Sunday",
  "type": "broadcast",
  "tenantId": "tenant-abc",
  "sentBy": "user-uuid"
}
```

**Response `200`**
```json
{
  "success": true,
  "summary": { "total": 2, "succeeded": 2, "failed": 0 },
  "results": [...]
}
```

---

#### POST `/api/sms/queue`

Same body as `/send`. Returns immediately with job IDs — processing happens asynchronously via the Bull queue.

**Response `202`**
```json
{
  "success": true,
  "queued": 2,
  "jobs": [{ "phone": "254700000000", "logId": "...", "jobId": "..." }]
}
```

---

#### POST `/api/sms/event/:eventId/notify`

Fetches all church members with phone numbers and queues one SMS per member about the event.

```json
{
  "tenantId": "tenant-abc",
  "sentBy": "user-uuid"
}
```

**Response `202`**
```json
{
  "success": true,
  "event": "Holy Communion",
  "queued": 120,
  "jobs": [...]
}
```

---

#### GET `/api/sms/logs?tenantId=tenant-abc`

Optional query params: `limit`, `offset`, `status`, `type`, `sentBy`

---

### Rate Limiting

All `/api/sms` routes are rate-limited to **20 requests per minute** per IP. Exceeding this returns:

```json
{ "error": "Too many requests" }
```

with HTTP status `429`.

---

## SMS System

```
Frontend clicks "📲 Notify"
        │
        ▼
POST /api/sms/event/:eventId/notify
        │
        ├── Fetch event from Supabase
        ├── Fetch all members with phone numbers
        ├── Build message string
        │
        └── For each member:
              ├── normalizePhone()
              ├── createSmsLog()   → status: pending
              └── enqueueSms()     → BullMQ job
                        │
                        ▼
                  Queue Worker
                        │
                        ├── Mobiwave HTTP request
                        └── updateSmsLog() → status: sent / failed
```

### Phone Normalization

All phone numbers are normalized to E.164 format (`+2547XXXXXXXX`) before sending.

### SMS Log Statuses

| Status | Meaning |
|---|---|
| `pending` | Job created, not yet processed |
| `sent` | Mobiwave accepted the message |
| `failed` | Mobiwave rejected or unreachable |

---

## Running Tests

```bash
# Run all tests
npm test

# Run with open handle detection
npm test -- --detectOpenHandles

# Run a specific suite
npm test -- tests/sms.test.js
```

### Test Coverage

| Suite | Tests | What's Covered |
|---|---|---|
| `POST /api/sms/send` | 8 | Auth, validation, success, provider failure |
| `POST /api/sms/event/:eventId/notify` | 9 | Auth, validation, 404, 400, 202, log type, DB/queue errors |
| Rate Limiter | 3 | Under limit, over limit (429), response headers |
| **Total** | **20** | ✅ All passing |

All external dependencies (Supabase, Mobiwave, Redis) are fully mocked — tests run offline with no real network calls.

---

## Deployment

### Railway (Recommended)

1. Push your repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
3. Select your repo and branch (`main`)
4. Add environment variables in the Railway dashboard
5. Add Redis: **New → Database → Redis** then copy `REDIS_URL` into your env vars
6. Railway auto-deploys on every push to `main` ✅

---

### Render (Alternative)

1. Go to [render.com](https://render.com) → **New Web Service**
2. Connect your GitHub repo
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables
6. Use [Upstash](https://upstash.com) for Redis (free tier, 10k commands/day)

Add a health endpoint to prevent the free tier from spinning down:

```js
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

Then add a free monitor on [UptimeRobot](https://uptimerobot.com) pinging `/health` every 5 minutes.

---

### Recommended Free Stack for Client Demo

| Service | Provider | Cost |
|---|---|---|
| API hosting | Railway or Render | Free |
| Redis queue | Upstash | Free |
| Database & Auth | Supabase | Free |
| Frontend | Vercel | Free |
| Uptime monitoring | UptimeRobot | Free |

---

## License

MIT © SimamiaKanisa