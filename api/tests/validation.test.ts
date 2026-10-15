import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';

describe('Validation & Error Shape Test Suite', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('1. Missing required body field returns standard VALIDATION_ERROR shape', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({}); // Empty body

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: expect.arrayContaining([
        expect.objectContaining({ path: 'email' }),
        expect.objectContaining({ path: 'password' }),
      ]),
    });
    // Ensure no stack trace is exposed
    expect(res.body.stack).toBeUndefined();
    expect(res.body.error.stack).toBeUndefined();
  });

  it('2. Invalid email format returns standard error with field details', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'email', message: 'Invalid email' }),
      ])
    );
  });

  it('3. Invalid query parameter enum returns 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .get('/api/v1/units?component=INVALID_COMPONENT');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'component' }),
      ])
    );
  });

  it('4. 404 route returns consistent standard error shape', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/v1/non-existent-endpoint',
        details: {},
      },
    });
    expect(res.body.stack).toBeUndefined();
  });
});
