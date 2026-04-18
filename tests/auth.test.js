// auth.middleware is loaded AFTER jest.setup.js sets env vars
const auth = require('../src/middleware/auth.middleware');

describe('Auth Middleware', () => {

  it('returns 401 when no Authorization header is present', async () => {
    const req  = { headers: {} };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const req  = { headers: { authorization: 'Basic abc123' } };
    const res  = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

});