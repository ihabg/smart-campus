// tests/auth.test.js
// Run with: npm test (requires jest + supertest in package.json)

const request  = require('supertest');
const bcrypt   = require('bcryptjs');
const app      = require('../server');
const { query } = require('../config/db');

// ─── Test helpers ──────────────────────────────────────────────
const TEST_USER = {
  first_name: 'Test',
  last_name:  'User',
  email:      `test_${Date.now()}@najah.edu`,
  password:   'TestPass1',
};

let accessToken = '';
let userId      = '';

// ─── Auth tests ────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(TEST_USER.email);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.password_hash).toBeUndefined();

    accessToken = res.body.data.accessToken;
    userId      = res.body.data.user.id;
  });

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER);

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should reject weak password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...TEST_USER, email: 'another@najah.edu', password: 'weak' });

    expect(res.status).toBe(422);
  });

  it('should reject missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'missing@najah.edu' });

    expect(res.status).toBe(422);
  });
});

describe('POST /api/auth/login', () => {
  it('should login with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_USER.email);
  });

  it('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'WrongPass1' });

    expect(res.status).toBe(401);
  });

  it('should reject non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@najah.edu', password: 'AnyPass1' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user when authenticated', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(userId);
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
  });
});

// ─── Floor tests ───────────────────────────────────────────────
describe('GET /api/floors/buildings', () => {
  it('should return buildings list', async () => {
    const res = await request(app).get('/api/floors/buildings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.buildings)).toBe(true);
  });
});

describe('GET /api/floors', () => {
  it('should return floors list', async () => {
    const res = await request(app).get('/api/floors');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.floors)).toBe(true);
  });

  it('should filter by building_id', async () => {
    const bldRes = await request(app).get('/api/floors/buildings');
    if (!bldRes.body.data.buildings.length) return;
    const bldId = bldRes.body.data.buildings[0].id;

    const res = await request(app).get(`/api/floors?building_id=${bldId}`);
    expect(res.status).toBe(200);
    res.body.data.floors.forEach(f => expect(f.building_id).toBe(bldId));
  });
});

// ─── Search tests ──────────────────────────────────────────────
describe('GET /api/search', () => {
  it('should reject short query', async () => {
    const res = await request(app).get('/api/search?q=a');
    expect(res.status).toBe(400);
  });

  it('should return results for valid query', async () => {
    const res = await request(app).get('/api/search?q=lab');
    expect(res.status).toBe(200);
    expect(res.body.data.results).toBeDefined();
    expect(typeof res.body.data.total).toBe('number');
  });

  it('should filter by type', async () => {
    const res = await request(app).get('/api/search?q=engineering&type=course');
    expect(res.status).toBe(200);
    expect(res.body.data.results.rooms).toBeUndefined();
    expect(res.body.data.results.courses).toBeDefined();
  });
});

// ─── Health check ──────────────────────────────────────────────
describe('GET /api/health', () => {
  it('should return healthy status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('running');
  });
});

// ─── 404 handler ──────────────────────────────────────────────
describe('Unknown routes', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/this-route-does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ─── Cleanup ───────────────────────────────────────────────────
afterAll(async () => {
  if (userId) {
    await query('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
});
