import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { Unit } from '../src/models/unit.model';
import { BloodRequest } from '../src/models/request.model';
import { Reservation } from '../src/models/reservation.model';
import { Plan } from '../src/models/plan.model';

describe('Reservations & Lifecycle Test Suite', () => {
  let coordinatorToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const [coordRes, adminRes] = await Promise.all([
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'coordinator1@bloodstock.local', password: 'CoordPass123!' }),
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@bloodstock.local', password: 'AdminPass123!' }),
    ]);

    coordinatorToken = coordRes.body.accessToken;
    adminToken = adminRes.body.accessToken;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  it('1. POST /reservations/commit: commits recommendation, marks unit RESERVED, and creates active reservation', async () => {
    // 1. Get recommendation for R-101 (Amber Heart H3, needs O- Platelet)
    const recRes = await request(app)
      .post('/api/v1/requests/R-101/recommendations')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(recRes.status).toBe(200);
    const planId = recRes.body.planId;
    expect(planId).toBeDefined();

    // 2. Commit the plan
    const commitRes = await request(app)
      .post('/api/v1/reservations/commit')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        planId,
        idempotencyKey: 'test-idemp-001',
      });

    expect(commitRes.status).toBe(201);
    expect(commitRes.body.status).toBe('SUCCESS');
    expect(commitRes.body.isReplay).toBe(false);
    expect(commitRes.body.reservations.length).toBeGreaterThanOrEqual(1);

    const reservation = commitRes.body.reservations[0];
    expect(reservation.status).toBe('RESERVED');
    expect(reservation.isActive).toBe(true);

    // 3. Verify unit in database
    const unitInDb = await Unit.findOne({ id: reservation.unitId }).lean();
    expect(unitInDb?.status).toBe('RESERVED');
    expect(unitInDb?.reservedForRequestId).toBe('R-101');
    expect(unitInDb?.version).toBeGreaterThan(0);

    // 4. Verify request status updated to PLANNED
    const reqInDb = await BloodRequest.findOne({ id: 'R-101' }).lean();
    expect(reqInDb?.status).toBe('PLANNED');
  });

  it('2. Idempotency: replaying same idempotencyKey returns original result without duplicate records', async () => {
    const plans = await Plan.find().lean();
    const planId = plans[0]!.planId;

    const replayRes = await request(app)
      .post('/api/v1/reservations/commit')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        planId,
        idempotencyKey: 'test-idemp-001',
      });

    expect(replayRes.status).toBe(201);
    expect(replayRes.body.isReplay).toBe(true);

    // Assert only 1 reservation exists in DB with this idempotency key
    const resCount = await Reservation.countDocuments({ idempotencyKey: 'test-idemp-001' });
    expect(resCount).toBe(1);
  });

  it('3. Re-committing already reserved unit returns 409 Conflict', async () => {
    // Attempting to commit a fresh plan targeting the same unit should fail with 409
    const activeRes = await Reservation.findOne({ isActive: true }).lean();
    expect(activeRes).toBeDefined();

    // Create a dummy plan targeting the already reserved unit
    const dummyPlan = await Plan.create({
      planId: 'PLAN-CONFLICT-TEST',
      requestIds: ['R-102'],
      mode: 'baseline',
      source: 'test',
      assignments: [
        {
          requestId: 'R-102',
          allocatedUnitIds: [activeRes!.unitId],
        },
      ],
      expiresAt: new Date(Date.now() + 600000),
    });

    const conflictRes = await request(app)
      .post('/api/v1/reservations/commit')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        planId: dummyPlan.planId,
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error.code).toBe('CONFLICT');
  });

  it('4. Reservation Lifecycle: dispatch -> deliver -> unit becomes USED, isActive becomes false', async () => {
    const reservation = await Reservation.findOne({ status: 'RESERVED', isActive: true }).lean();
    expect(reservation).toBeDefined();

    // 1. Dispatch
    const dispatchRes = await request(app)
      .post(`/api/v1/reservations/${reservation!.id}/dispatch`)
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(dispatchRes.status).toBe(200);
    expect(dispatchRes.body.status).toBe('IN_TRANSIT');
    expect(dispatchRes.body.isActive).toBe(true);

    const unitAfterDispatch = await Unit.findOne({ id: reservation!.unitId }).lean();
    expect(unitAfterDispatch?.status).toBe('IN_TRANSIT');

    // 2. Deliver
    const deliverRes = await request(app)
      .post(`/api/v1/reservations/${reservation!.id}/deliver`)
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(deliverRes.status).toBe(200);
    expect(deliverRes.body.status).toBe('DELIVERED');
    expect(deliverRes.body.isActive).toBe(false);

    const unitAfterDeliver = await Unit.findOne({ id: reservation!.unitId }).lean();
    expect(unitAfterDeliver?.status).toBe('USED');
  });

  it('5. Cancelling request releases reserved units back to AVAILABLE', async () => {
    // Create new request at H3
    const newReqRes = await request(app)
      .post('/api/v1/requests')
      .set('Authorization', `Bearer ${coordinatorToken}`)
      .send({
        hospitalId: 'H3',
        component: 'RED_CELLS',
        group: 'AB+',
        unitsNeeded: 1,
        neededBy: new Date(Date.now() + 10 * 3600000).toISOString(),
        urgency: 'ROUTINE',
      });

    expect(newReqRes.status).toBe(201);
    const reqId = newReqRes.body.id;

    // Pick an available AB+ red cells unit
    const unit = await Unit.findOne({ component: 'RED_CELLS', group: 'AB+', status: 'AVAILABLE' });
    expect(unit).toBeDefined();

    // Create reservation directly
    const resDoc = await Reservation.create({
      id: `RSV-CANCEL-TEST-${Date.now()}`,
      unitId: unit!.id,
      requestId: reqId,
      fromHospitalId: unit!.hospitalId,
      toHospitalId: 'H3',
      dispatchAt: new Date(),
      eta: new Date(Date.now() + 3600000),
      transitMinutes: 30,
      status: 'RESERVED',
      isActive: true,
    });

    unit!.status = 'RESERVED';
    unit!.reservedForRequestId = reqId;
    await unit!.save();

    // Now cancel the request
    const cancelRes = await request(app)
      .post(`/api/v1/requests/${reqId}/cancel`)
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('CANCELLED');

    // Unit must be freed back to AVAILABLE
    const freedUnit = await Unit.findOne({ id: unit!.id }).lean();
    expect(freedUnit?.status).toBe('AVAILABLE');
    expect(freedUnit?.reservedForRequestId).toBeNull();

    // Reservation must be CANCELLED and inactive
    const updatedRes = await Reservation.findOne({ id: resDoc.id }).lean();
    expect(updatedRes?.status).toBe('CANCELLED');
    expect(updatedRes?.isActive).toBe(false);
  });
});
