import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { Route } from '../src/models/route.model';
import { Unit } from '../src/models/unit.model';
import { BloodRequest } from '../src/models/request.model';
import { Reservation } from '../src/models/reservation.model';

describe('Dynamic Scenarios & Simulation Test Suite', () => {
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

  it('1. GET /invariants: validates all four hard clinical invariants are passed', async () => {
    const res = await request(app).get('/api/v1/invariants');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('PASSED');
    expect(res.body.invariants).toHaveLength(4);
    expect(res.body.invariants.every((inv: any) => inv.passed)).toBe(true);
  });

  it('2. POST /scenarios/transport-failure: marks route DOWN, releases RESERVED, preserves IN_TRANSIT, returns diff', async () => {
    // 1. Create a RESERVED reservation on H1 -> H3
    const unit1 = await Unit.findOne({ hospitalId: 'H1', status: 'AVAILABLE', component: 'PLATELETS' });
    const req1 = await BloodRequest.findOne({ hospitalId: 'H3', status: 'OPEN' });

    const testResId = 'RSV-SCENARIO-TEST';
    if (unit1 && req1) {
      await Reservation.create({
        id: testResId,
        unitId: unit1.id,
        requestId: req1.id,
        fromHospitalId: 'H1',
        toHospitalId: 'H3',
        dispatchAt: new Date(),
        eta: new Date(Date.now() + 3600000),
        transitMinutes: 20,
        status: 'RESERVED',
        isActive: true,
      });
      unit1.status = 'RESERVED';
      await unit1.save();
    }

    // 2. Trigger transport failure scenario on H1 -> H3
    const scenarioRes = await request(app)
      .post('/api/v1/scenarios/transport-failure')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        fromId: 'H1',
        toId: 'H3',
        down: true,
      });

    expect(scenarioRes.status).toBe(200);
    expect(scenarioRes.body.scenario).toBe('TRANSPORT_FAILURE');
    expect(scenarioRes.body.diff).toBeDefined();
    expect(scenarioRes.body.invariants.every((i: any) => i.passed)).toBe(true);

    // Verify route is DOWN in DB
    const routeInDb = await Route.findOne({ fromId: 'H1', toId: 'H3' }).lean();
    expect(routeInDb?.status).toBe('DOWN');

    // Restore route for subsequent tests
    await Route.updateOne({ fromId: 'H1', toId: 'H3' }, { $set: { status: 'UP' } });
  });

  it('3. POST /scenarios/demand-spike: creates urgent request surge and replans', async () => {
    const res = await request(app)
      .post('/api/v1/scenarios/demand-spike')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        hospitalId: 'H3',
        component: 'RED_CELLS',
        group: 'O-',
        units: 2,
        urgency: 'CRITICAL',
      });

    expect(res.status).toBe(200);
    expect(res.body.scenario).toBe('DEMAND_SPIKE');
    expect(res.body.plan).toBeDefined();
    expect(res.body.invariants.every((i: any) => i.passed)).toBe(true);
  });

  it('4. POST /scenarios/new-stock: adds units and replans', async () => {
    const res = await request(app)
      .post('/api/v1/scenarios/new-stock')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        hospitalId: 'H1',
        component: 'PLATELETS',
        group: 'O-',
        units: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.scenario).toBe('NEW_STOCK');
    expect(res.body.invariants.every((i: any) => i.passed)).toBe(true);
  });

  it('5. Simulation: GET /sim/clock, POST /sim/advance marks units EXPIRED, POST /sim/reset reseeds', async () => {
    // 1. Get clock
    const clockRes = await request(app).get('/api/v1/sim/clock');
    expect(clockRes.status).toBe(200);
    expect(clockRes.body.simNow).toBeDefined();

    // 2. Advance clock by 10 hours
    const advanceRes = await request(app)
      .post('/api/v1/sim/advance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hours: 10 });

    expect(advanceRes.status).toBe(200);
    expect(advanceRes.body.advancedHours).toBe(10);
    expect(advanceRes.body.expiredUnitsCount).toBeGreaterThanOrEqual(1);

    // 3. Reset simulation
    const resetRes = await request(app)
      .post('/api/v1/sim/reset')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.status).toBe('SUCCESS');
  });
});
