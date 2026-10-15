import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';

describe('Auth & RBAC Test Suite', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  let coordinatorToken: string;
  let coordinatorRefreshCookie: string;
  let viewerToken: string;
  let adminToken: string;

  it('1. Login with valid credentials returns accessToken and httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator1@bloodstock.local',
        password: 'CoordPass123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user).toEqual({
      id: 'USR-COORD1',
      email: 'coordinator1@bloodstock.local',
      name: 'Amber Heart Coordinator',
      role: 'COORDINATOR',
      hospitalId: 'H3',
    });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = (cookies as unknown as string[]).find((c) => c.startsWith('refreshToken='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');

    coordinatorToken = res.body.accessToken;
    coordinatorRefreshCookie = refreshCookie!;
  });

  it('2. Login with invalid password returns 401 in standard error shape', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'coordinator1@bloodstock.local',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
        details: {},
      },
    });
  });

  it('3. GET /api/v1/auth/me returns current user profile', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('coordinator1@bloodstock.local');
    expect(res.body.user.role).toBe('COORDINATOR');
  });

  it('4. POST /api/v1/auth/refresh rotates the refresh token and returns new accessToken', async () => {
    const rawCookie: string = coordinatorRefreshCookie.split(';')[0] || '';

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rawCookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.accessToken).not.toBe(coordinatorToken);

    const newCookies = res.headers['set-cookie'];
    expect(newCookies).toBeDefined();
    const newRefreshCookie = (newCookies as unknown as string[]).find((c) => c.startsWith('refreshToken='));
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie).not.toBe(coordinatorRefreshCookie);

    // Old refresh token must be invalidated (reuse prevention)
    const resReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rawCookie);
    expect(resReuse.status).toBe(401);
    expect(resReuse.body.error.code).toBe('UNAUTHORIZED');
  });

  it('5. POST /api/v1/auth/logout clears cookie and invalidates token', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@bloodstock.local', password: 'ViewerPass123!' });

    viewerToken = loginRes.body.accessToken;
    const cookie = (loginRes.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refreshToken=')) || '';
    const rawViewerCookie: string = cookie.split(';')[0] || '';

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${viewerToken}`)
      .set('Cookie', rawViewerCookie);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('Logged out successfully');

    // Attempting refresh with logged out token fails
    const refRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rawViewerCookie);
    expect(refRes.status).toBe(401);
  });

  it('6. Role guard: VIEWER cannot create request (403 Forbidden)', async () => {
    const loginViewer = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@bloodstock.local', password: 'ViewerPass123!' });

    const res = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${loginViewer.body.accessToken}`)
      .send({
        component: 'RED_CELLS',
        group: 'O-',
        unitsNeeded: 1,
        neededBy: new Date(Date.now() + 3600000).toISOString(),
        urgency: 'CRITICAL',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('7. Role guard: COORDINATOR cannot act on another hospital (403 Forbidden)', async () => {
    const loginCoord = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'coordinator1@bloodstock.local', password: 'CoordPass123!' });

    const res = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${loginCoord.body.accessToken}`)
      .send({
        hospitalId: 'H1', // Pink City General, while coordinator is H3
        component: 'RED_CELLS',
        group: 'O-',
        unitsNeeded: 1,
        neededBy: new Date(Date.now() + 3600000).toISOString(),
        urgency: 'CRITICAL',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Coordinators can only create requests for hospital H3');
  });

  it('8. Role guard: COORDINATOR can create request for own hospital (201 Created)', async () => {
    const loginCoord = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'coordinator1@bloodstock.local', password: 'CoordPass123!' });

    const res = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${loginCoord.body.accessToken}`)
      .send({
        hospitalId: 'H3', // Amber Heart Institute
        component: 'PLATELETS',
        group: 'O-',
        unitsNeeded: 1,
        neededBy: new Date(Date.now() + 3600000).toISOString(),
        urgency: 'CRITICAL',
        clinicalContext: 'Urgent surgery test request',
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^R-\d+/);
    expect(res.body.hospitalId).toBe('H3');
    expect(res.body.status).toBe('OPEN');
  });

  it('9. Role guard: ADMIN can create request for any hospital', async () => {
    const loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@bloodstock.local', password: 'AdminPass123!' });

    adminToken = loginAdmin.body.accessToken;

    const res = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        hospitalId: 'H5',
        component: 'PLASMA',
        group: 'AB+',
        unitsNeeded: 1,
        neededBy: new Date(Date.now() + 3600000).toISOString(),
        urgency: 'ROUTINE',
      });

    expect(res.status).toBe(201);
    expect(res.body.hospitalId).toBe('H5');
  });

  it('10. Non-admin cannot register users, ADMIN can register users', async () => {
    // Non-admin fails
    const resForbidden = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        email: 'newuser@bloodstock.local',
        password: 'NewUserPass123!',
        name: 'New User',
        role: 'VIEWER',
      });
    expect(resForbidden.status).toBe(403);

    // Admin succeeds
    const resSuccess = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'newcoordinator@bloodstock.local',
        password: 'NewUserPass123!',
        name: 'Sawai Care Coordinator',
        role: 'COORDINATOR',
        hospitalId: 'H4',
      });
    expect(resSuccess.status).toBe(201);
    expect(resSuccess.body.user.email).toBe('newcoordinator@bloodstock.local');
    expect(resSuccess.body.user.role).toBe('COORDINATOR');
    expect(resSuccess.body.user.hospitalId).toBe('H4');
  });
});
