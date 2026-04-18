const request = require('supertest');
const app     = require('../src/app');

// ─────────────────────────────────────────────────────────────────────────────
// MOCKS
// Jest hoists jest.mock() above variable declarations.
// Variables used inside a factory MUST be defined inside the factory itself,
// or be prefixed with "mock" (Jest's exception to the hoisting rule).
// ─────────────────────────────────────────────────────────────────────────────

// ── Auth middleware ───────────────────────────────────────────────────────────
jest.mock('../src/middleware/auth.middleware', () => {
  return (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Missing token' });
    }
    const token = header.split(' ')[1];
    if (token === 'valid-token') {
      req.user = { id: 'test-user-id', email: 'test@example.com' };
      return next();
    }
    return res.status(401).json({ message: 'Invalid token' });
  };
});

// ── SMS service ───────────────────────────────────────────────────────────────
jest.mock('../src/services/sms.service', () => ({
  sendSmsService: jest.fn(),
  normalizePhone: jest.fn((p) => p)
}));

// ── SMS model ─────────────────────────────────────────────────────────────────
jest.mock('../src/models/sms.model', () => ({
  getSmsLogs:          jest.fn(),
  getSmsLogById:       jest.fn(),
  getSmsStatsByTenant: jest.fn(),
  createSmsLog:        jest.fn()
}));

// ── BullMQ / Redis queue ──────────────────────────────────────────────────────
jest.mock('../src/queues/sms.queue', () => ({
  enqueueSms:    jest.fn(),
  getQueueStats: jest.fn()
}));

// ── Supabase client ───────────────────────────────────────────────────────────
// The chain object is built entirely inside the factory (no out-of-scope refs).
// We expose it as __chain so tests can set per-call return values via
// jest.requireMock() after the fact.
jest.mock('../src/config/supabase', () => {
  const mockSingle = jest.fn();
  const mockNeq    = jest.fn();
  const mockChain  = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    not:    jest.fn().mockReturnThis(),
    neq:    mockNeq,
    single: mockSingle
  };
  return { from: jest.fn(() => mockChain), __chain: mockChain };
});

// ── axios ─────────────────────────────────────────────────────────────────────
jest.mock('axios');

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS  (after all mocks are registered)
// ─────────────────────────────────────────────────────────────────────────────
const { sendSmsService }  = require('../src/services/sms.service');
const { createSmsLog }    = require('../src/models/sms.model');
const { enqueueSms }      = require('../src/queues/sms.queue');
const db                  = require('../src/config/supabase');

// Grab the shared chain object we attached as __chain
const chain = db.__chain;

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────
const VALID_HEADERS = { Authorization: 'Bearer valid-token' };

const VALID_BODY = {
  recipients: ['254700000000'],
  message:    'Hello test',
  type:       'broadcast',
  tenantId:   'tenant-abc'
};

const EVENT_ID = 'event-uuid-123';

const MOCK_EVENT = {
  id:        EVENT_ID,
  name:      'Holy Communion',
  date:      '2026-04-06',
  time:      '08:00',
  expected:  40,
  tenant_id: 'tenant-abc'
};

const MOCK_MEMBERS = [
  { phone: '254700000001' },
  { phone: '254700000002' },
  { phone: '254700000003' }
];

const EVENT_SMS_BODY = { tenantId: 'tenant-abc', sentBy: 'test-user-id' };

// ─────────────────────────────────────────────────────────────────────────────
// HELPER
// Sets terminal mock return values for the two sequential Supabase queries
// inside sendEventSMS:
//   query 1 → .from('events')...single()
//   query 2 → .from('members')...neq()
// ─────────────────────────────────────────────────────────────────────────────
function mockSupabaseQueries(eventResult, membersResult) {
  if (eventResult   !== undefined) chain.single.mockResolvedValueOnce(eventResult);
  if (membersResult !== undefined) chain.neq.mockResolvedValueOnce(membersResult);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1 — POST /api/sms/send
// ─────────────────────────────────────────────────────────────────────────────
describe('SMS API — POST /api/sms/send', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('rejects request without auth token', async () => {
    const res = await request(app).post('/api/sms/send').send(VALID_BODY);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBeDefined();
    expect(sendSmsService).not.toHaveBeenCalled();
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .post('/api/sms/send')
      .set('Authorization', 'Bearer wrong-token')
      .send(VALID_BODY);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid token');
    expect(sendSmsService).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('rejects empty payload', async () => {
    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send({});

    expect([400, 422]).toContain(res.statusCode);
    expect(sendSmsService).not.toHaveBeenCalled();
  });

  it('rejects empty recipients array', async () => {
    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send({ ...VALID_BODY, recipients: [] });

    expect([400, 422]).toContain(res.statusCode);
    expect(sendSmsService).not.toHaveBeenCalled();
  });

  it('rejects missing message', async () => {
    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send({ ...VALID_BODY, message: undefined });

    expect([400, 422]).toContain(res.statusCode);
    expect(sendSmsService).not.toHaveBeenCalled();
  });

  it('rejects missing tenantId', async () => {
    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send({ ...VALID_BODY, tenantId: undefined });

    expect([400, 422]).toContain(res.statusCode);
    expect(sendSmsService).not.toHaveBeenCalled();
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it('sends SMS and returns correct summary', async () => {
    sendSmsService.mockResolvedValue([
      { phone: '254700000000', logId: 'log-uuid-1', success: true }
    ]);

    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send(VALID_BODY);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.total).toBe(1);
    expect(res.body.summary.succeeded).toBe(1);
    expect(res.body.summary.failed).toBe(0);
    expect(sendSmsService).toHaveBeenCalledTimes(1);
  });

  // ── Error ─────────────────────────────────────────────────────────────────

  it('returns 500 when sendSmsService throws', async () => {
    sendSmsService.mockRejectedValue(new Error('Mobiwave down'));

    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send(VALID_BODY);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2 — POST /api/sms/event/:eventId/notify
// ─────────────────────────────────────────────────────────────────────────────
describe('SMS API — POST /api/sms/event/:eventId/notify', () => {

  beforeEach(() => jest.clearAllMocks());

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('rejects request without auth token', async () => {
    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(401);
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  it('rejects invalid token', async () => {
    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set('Authorization', 'Bearer wrong-token')
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe('Invalid token');
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────────────────

  it('rejects missing tenantId', async () => {
    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/tenantId/i);
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  // ── Not found ─────────────────────────────────────────────────────────────

  it('returns 404 when event does not exist', async () => {
    mockSupabaseQueries({ data: null, error: { message: 'not found' } });

    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/event not found/i);
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  // ── No members ────────────────────────────────────────────────────────────

  it('returns 400 when no members have phone numbers', async () => {
    mockSupabaseQueries(
      { data: MOCK_EVENT, error: null },
      { data: [],         error: null }
    );

    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no members/i);
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  // ── Success ───────────────────────────────────────────────────────────────

  it('queues one SMS per member and returns 202', async () => {
    mockSupabaseQueries(
      { data: MOCK_EVENT,   error: null },
      { data: MOCK_MEMBERS, error: null }
    );
    createSmsLog.mockResolvedValue({ id: 'log-uuid-1' });
    enqueueSms.mockResolvedValue({ id: 'job-uuid-1' });

    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.queued).toBe(3);
    expect(res.body.event).toBe('Holy Communion');
    expect(enqueueSms).toHaveBeenCalledTimes(3);
    expect(createSmsLog).toHaveBeenCalledTimes(3);
  });

  it('creates each log with correct type and sentBy', async () => {
    mockSupabaseQueries(
      { data: MOCK_EVENT,        error: null },
      { data: [MOCK_MEMBERS[0]], error: null }
    );
    createSmsLog.mockResolvedValue({ id: 'log-uuid-2' });
    enqueueSms.mockResolvedValue({ id: 'job-uuid-2' });

    await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send(EVENT_SMS_BODY);

    expect(createSmsLog).toHaveBeenCalledWith(
      'tenant-abc',
      expect.objectContaining({
        type:      'event_notification',
        sent_by:   'test-user-id',
        recipient: '254700000001'
      })
    );
  });

  // ── Errors ────────────────────────────────────────────────────────────────

  it('returns 500 when Supabase event query throws', async () => {
    chain.single.mockRejectedValueOnce(new Error('DB connection lost'));

    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/failed to send event sms/i);
    expect(enqueueSms).not.toHaveBeenCalled();
  });

  it('returns 500 when enqueueSms throws', async () => {
    mockSupabaseQueries(
      { data: MOCK_EVENT,        error: null },
      { data: [MOCK_MEMBERS[0]], error: null }
    );
    createSmsLog.mockResolvedValue({ id: 'log-uuid-3' });
    enqueueSms.mockRejectedValueOnce(new Error('Redis unavailable'));

    const res = await request(app)
      .post(`/api/sms/event/${EVENT_ID}/notify`)
      .set(VALID_HEADERS)
      .send(EVENT_SMS_BODY);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toMatch(/failed to send event sms/i);
  });

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3 — Rate Limiter
// ─────────────────────────────────────────────────────────────────────────────
describe('SMS API — Rate Limiter', () => {

  beforeEach(() => jest.clearAllMocks());

  it('allows requests under the limit', async () => {
    sendSmsService.mockResolvedValue([
      { phone: '254700000000', success: true }
    ]);

    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send(VALID_BODY);

    expect(res.statusCode).not.toBe(429);
  });

  it('blocks requests after exceeding the limit', async () => {
    sendSmsService.mockResolvedValue([
      { phone: '254700000000', success: true }
    ]);

    // Fire 20 requests to exhaust the limit
    for (let i = 0; i < 20; i++) {
      await request(app)
        .post('/api/sms/send')
        .set(VALID_HEADERS)
        .send(VALID_BODY);
    }

    // 21st request should be blocked
    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send(VALID_BODY);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('Too many requests');
  });

  it('sets correct rate limit headers', async () => {
    sendSmsService.mockResolvedValue([
      { phone: '254700000000', success: true }
    ]);

    const res = await request(app)
      .post('/api/sms/send')
      .set(VALID_HEADERS)
      .send(VALID_BODY);

    expect(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit'])
      .toBeDefined();
  });
});

});