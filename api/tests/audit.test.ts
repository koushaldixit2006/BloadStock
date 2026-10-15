import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { AuditLog } from '../src/models/auditLog.model';

describe('Audit Log & Cryptographic Verification Test Suite', () => {
  let adminToken: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@bloodstock.local', password: 'AdminPass123!' });

    adminToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('1. GET /api/v1/audit: returns paginated audit log entries for ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/audit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.pagination).toBeDefined();

    const genesis = res.body.items.find((item: any) => item.seq === 1);
    expect(genesis).toBeDefined();
    expect(genesis.action).toBe('SYSTEM_GENESIS_SEED');
    expect(genesis.prevHash).toBe('0000000000000000000000000000000000000000000000000000000000000000');
  });

  it('2. GET /api/v1/audit/verify: validates intact cryptographic hash chain', async () => {
    const res = await request(app).get('/api/v1/audit/verify');

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.totalVerified).toBeGreaterThanOrEqual(1);
  });

  it('3. Tamper Detection: modifying a record in MongoDB invalidates the hash chain', async () => {
    // 1. Confirm chain is initially valid
    const initialCheck = await request(app).get('/api/v1/audit/verify');
    expect(initialCheck.body.valid).toBe(true);

    // 2. Tamper with genesis record directly in MongoDB
    await AuditLog.updateOne(
      { seq: 1 },
      { $set: { action: 'TAMPERED_MALICIOUS_ACTION' } }
    );

    // 3. Verify that the tamper detector flags the broken chain at seq 1
    const tamperedCheck = await request(app).get('/api/v1/audit/verify');
    expect(tamperedCheck.status).toBe(200);
    expect(tamperedCheck.body.valid).toBe(false);
    expect(tamperedCheck.body.tamperedSeq).toBe(1);
    expect(tamperedCheck.body.reason).toContain('Hash mismatch at seq 1');

    // 4. Restore the original value for test isolation
    await AuditLog.updateOne(
      { seq: 1 },
      { $set: { action: 'SYSTEM_GENESIS_SEED' } }
    );

    // 5. Verify restored chain is valid again
    const restoredCheck = await request(app).get('/api/v1/audit/verify');
    expect(restoredCheck.body.valid).toBe(true);
  });
});
