import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { Unit } from '../src/models/unit.model';
import { BloodRequest } from '../src/models/request.model';
import { Reservation } from '../src/models/reservation.model';
import { Plan } from '../src/models/plan.model';

describe('Concurrency & Race Condition Test Suite', () => {
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

  it('50 parallel commit requests targeting the same unit: exactly 1 succeeds (201), 49 fail with 409 Conflict', async () => {
    // 1. Pick an available test unit and request
    const targetUnit = await Unit.findOne({ status: 'AVAILABLE', component: 'RED_CELLS', group: 'O-' }).lean();
    expect(targetUnit).toBeDefined();

    const targetRequest = await BloodRequest.findOne({ status: 'OPEN', component: 'RED_CELLS' }).lean();
    expect(targetRequest).toBeDefined();

    const initialVersion = targetUnit!.version;

    // 2. Create a shared plan allocating this target unit
    const planId = 'PLAN-RACE-50';
    await Plan.create({
      planId,
      requestIds: [targetRequest!.id],
      mode: 'baseline',
      source: 'test-concurrency',
      assignments: [
        {
          requestId: targetRequest!.id,
          allocatedUnitIds: [targetUnit!.id],
          options: [
            {
              unitId: targetUnit!.id,
              eta: new Date(Date.now() + 3600000).toISOString(),
              transitMinutes: 30,
              fromHospitalId: targetUnit!.hospitalId,
              toHospitalId: targetRequest!.hospitalId,
            },
          ],
        },
      ],
      expiresAt: new Date(Date.now() + 600000), // 10m TTL
    });

    // 3. Fire 50 concurrent commit requests targeting the exact same unit
    const concurrencyLevel = 50;
    const requests = Array.from({ length: concurrencyLevel }, (_, idx) =>
      request(app)
        .post('/api/v1/reservations/commit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          planId,
          idempotencyKey: `race-key-${idx + 1}`,
        })
    );

    const responses = await Promise.all(requests);

    // 4. Evaluate HTTP Response statuses
    const statusCounts: Record<number, number> = {};
    for (const res of responses) {
      statusCounts[res.status] = (statusCounts[res.status] || 0) + 1;
    }

    const successes = statusCounts[201] || 0;
    const conflicts = statusCounts[409] || 0;

    console.log('All status counts:', statusCounts);
    console.log('Sample non-201 response:', responses.find((r) => r.status !== 201)?.body);
    console.log(`Race Results (50 parallel requests): 201 Created: ${successes}, 409 Conflict: ${conflicts}`);

    // EXACT ACCEPTANCE CRITERIA:
    // Exactly 1 succeeds, 49 get 409
    expect(successes).toBe(1);
    expect(conflicts).toBe(49);

    // 5. Database-level state invariant verification:
    // Exactly 1 active reservation must exist for this unit in MongoDB
    const activeReservations = await Reservation.find({
      unitId: targetUnit!.id,
      isActive: true,
    }).lean();

    expect(activeReservations.length).toBe(1);
    expect(activeReservations[0]?.status).toBe('RESERVED');
    expect(activeReservations[0]?.requestId).toBe(targetRequest!.id);

    // Unit status must be RESERVED with version incremented exactly once
    const updatedUnit = await Unit.findOne({ id: targetUnit!.id }).lean();
    expect(updatedUnit?.status).toBe('RESERVED');
    expect(updatedUnit?.version).toBe(initialVersion + 1);
  }, 30000); // 30s timeout for 50 parallel requests
});
