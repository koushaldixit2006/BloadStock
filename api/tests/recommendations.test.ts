import request from 'supertest';
import { app } from '../src/app';
import { setupTestDatabase, teardownTestDatabase } from './setup';
import { Reservation } from '../src/models/reservation.model';
import { Unit } from '../src/models/unit.model';
import { OptimizerClient } from '../src/services/optimizerClient';

describe('Recommendations & Planning Test Suite', () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  let coordinatorToken: string;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'coordinator1@bloodstock.local', password: 'CoordPass123!' });
    coordinatorToken = loginRes.body.accessToken;
  });

  it('1. Seeded CRITICAL O- platelet request returns nearest unit as infeasible with exact reason', async () => {
    const res = await request(app)
      .post('/api/v1/requests/R-101/recommendations')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('R-101');
    expect(res.body.disclaimer).toBe('Planning support only - not a clinical decision. Synthetic data.');
    expect(res.body.planId).toMatch(/^PLAN-/);

    const assignment = res.body.assignments[0];
    expect(assignment.requestId).toBe('R-101');
    expect(assignment.isComplete).toBe(true);

    // Farther feasible unit U-10002 must be chosen
    expect(assignment.allocatedUnitIds).toEqual(['U-10002']);

    // Check options array contains nearest unit U-10001 marked infeasible
    const optNearest = assignment.options.find((o: any) => o.unitId === 'U-10001');
    expect(optNearest).toBeDefined();
    expect(optNearest.feasible).toBe(false);
    expect(optNearest.blockingReasons).toContain('Expires 5 min before arrival');

    // Check explanation cites the reason
    expect(assignment.explanation).toContain('Chosen over nearer unit U-10001');
  });

  it('2. Hard constraint: Recommendations endpoint NEVER changes unit or reservation state in DB', async () => {
    const reservationsBefore = await Reservation.countDocuments();
    const unitBefore = await Unit.findOne({ id: 'U-10002' }).lean();

    // Call recommendations
    const res = await request(app)
      .post('/api/v1/requests/R-101/recommendations')
      .set('Authorization', `Bearer ${coordinatorToken}`);
    expect(res.status).toBe(200);

    const reservationsAfter = await Reservation.countDocuments();
    const unitAfter = await Unit.findOne({ id: 'U-10002' }).lean();

    // Assert database is completely unmodified
    expect(reservationsAfter).toBe(reservationsBefore);
    expect(reservationsAfter).toBe(0);
    expect(unitAfter?.status).toBe(unitBefore?.status);
    expect(unitAfter?.status).toBe('AVAILABLE');
  });

  it('3. When optimizer fails/offline, recommendations fall back to baseline with source "fallback-baseline"', async () => {
    // Spy on OptimizerClient.getPlan to simulate optimizer failure / circuit break
    const spy = jest.spyOn(OptimizerClient, 'getPlan').mockRejectedValueOnce(new Error('Optimizer connection refused'));

    const res = await request(app)
      .post('/api/v1/requests/R-101/recommendations')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('fallback-baseline');
    expect(res.body.mode).toBe('baseline');

    const assignment = res.body.assignments[0];
    expect(assignment.allocatedUnitIds).toEqual(['U-10002']);
    expect(assignment.explanation).toContain('Baseline nearest-available');

    // Hard constraints hold
    const nearestOpt = assignment.options.find((o: any) => o.unitId === 'U-10001');
    expect(nearestOpt.feasible).toBe(false);
    expect(nearestOpt.blockingReasons).toContain('Expires 5 min before arrival');

    spy.mockRestore();
  });

  it('4. POST /api/v1/plans/compare returns baseline vs optimized with deltas', async () => {
    const res = await request(app)
      .post('/api/v1/plans/compare')
      .set('Authorization', `Bearer ${coordinatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('baseline');
    expect(res.body).toHaveProperty('optimized');
    expect(res.body).toHaveProperty('deltas');

    expect(res.body.deltas).toHaveProperty('satisfiedDelta');
    expect(res.body.deltas).toHaveProperty('totalTransportMinutesDelta');
    expect(res.body.deltas).toHaveProperty('wastedUnitsDelta');
  });
});
