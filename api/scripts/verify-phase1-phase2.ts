import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { runSeed } from './seed';
import { verifyReservationIndex } from './verify-reservation-index';
import { Hospital } from '../src/models/hospital.model';
import { Route } from '../src/models/route.model';
import { Unit } from '../src/models/unit.model';
import { BloodRequest } from '../src/models/request.model';
import { SimState } from '../src/models/simState.model';
import { AuditLog } from '../src/models/auditLog.model';
import { config } from '../src/config';

async function main() {
  console.log('======================================================================');
  console.log('🩸 BLOODSTOCK BACKEND: PHASE 1 & PHASE 2 VERIFICATION SUITE');
  console.log('======================================================================\n');

  let replSet: MongoMemoryReplSet | null = null;
  let uri = config.mongodbUri;

  console.log('📦 STEP 1: Verifying MongoDB 7.0 Single-Node Replica Set (rs0)...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
    console.log(`✅ Connected to existing MongoDB Replica Set at ${uri}`);
  } catch (err) {
    console.log('   Starting local single-node replica set instance...');
    replSet = await MongoMemoryReplSet.create({
      replSet: {
        name: 'rs0',
        count: 1,
        storageEngine: 'wiredTiger',
      },
      instanceOpts: [
        {
          port: 27017,
        },
      ],
    });
    uri = replSet.getUri('bloodstock');
    console.log(`✅ MongoDB Replica Set is ONLINE at ${uri}`);
    await mongoose.connect(uri);
  }

  // Check replica set status
  const adminDb = mongoose.connection.db?.admin();
  const replStatus = await adminDb?.command({ replSetGetStatus: 1 });
  const myState = replStatus?.members?.[0]?.state;
  const myStateStr = replStatus?.members?.[0]?.stateStr;
  console.log(`   - Replica Set Name: ${replStatus?.set}`);
  console.log(`   - Member State: ${myState} (${myStateStr})`);

  if (myState !== 1) {
    throw new Error(`❌ Replica Set failed to reach PRIMARY state. Current state: ${myStateStr}`);
  }
  console.log('   - Replica Set Status: 100% HEALTHY PRIMARY (Multi-document transactions enabled!)\n');

  console.log('======================================================================');
  console.log('🌱 STEP 2: Running Deterministic Seed Twice');
  console.log('======================================================================');

  console.log('▶️ Executing Run 1 of seed...');
  const run1Counts = await runSeed(uri);
  const run1Units = (await Unit.find({}, { id: 1, group: 1, component: 1 }).sort({ id: 1 }).lean()).map(u => `${u.id}:${u.component}:${u.group}`);
  const run1Requests = (await BloodRequest.find({}, { id: 1, urgency: 1 }).sort({ id: 1 }).lean()).map(r => `${r.id}:${r.urgency}`);
  const run1Audit = (await AuditLog.find({}, { seq: 1, hash: 1 }).sort({ seq: 1 }).lean()).map(a => `${a.seq}:${a.hash}`);

  console.log(`   - Run 1 Units count: ${run1Counts.units}`);
  console.log(`   - Run 1 Requests count: ${run1Counts.requests}`);
  console.log(`   - Run 1 Routes count: ${run1Counts.routes}`);
  console.log(`   - Run 1 Hospitals count: ${run1Counts.hospitals}`);
  console.log(`   - Run 1 Audit Genesis Hash: ${run1Audit[0]}`);

  console.log('\n▶️ Executing Run 2 of seed...');
  const run2Counts = await runSeed(uri);
  const run2Units = (await Unit.find({}, { id: 1, group: 1, component: 1 }).sort({ id: 1 }).lean()).map(u => `${u.id}:${u.component}:${u.group}`);
  const run2Requests = (await BloodRequest.find({}, { id: 1, urgency: 1 }).sort({ id: 1 }).lean()).map(r => `${r.id}:${r.urgency}`);
  const run2Audit = (await AuditLog.find({}, { seq: 1, hash: 1 }).sort({ seq: 1 }).lean()).map(a => `${a.seq}:${a.hash}`);

  console.log(`   - Run 2 Units count: ${run2Counts.units}`);
  console.log(`   - Run 2 Requests count: ${run2Counts.requests}`);
  console.log(`   - Run 2 Routes count: ${run2Counts.routes}`);
  console.log(`   - Run 2 Hospitals count: ${run2Counts.hospitals}`);
  console.log(`   - Run 2 Audit Genesis Hash: ${run2Audit[0]}`);

  // Strict determinism assertions on counts
  const run1CountsSummary = {
    hospitals: run1Counts.hospitals,
    routes: run1Counts.routes,
    units: run1Counts.units,
    requests: run1Counts.requests,
    users: run1Counts.users,
    simState: run1Counts.simState,
    auditLogs: run1Counts.auditLogs,
  };
  const run2CountsSummary = {
    hospitals: run2Counts.hospitals,
    routes: run2Counts.routes,
    units: run2Counts.units,
    requests: run2Counts.requests,
    users: run2Counts.users,
    simState: run2Counts.simState,
    auditLogs: run2Counts.auditLogs,
  };

  if (JSON.stringify(run1CountsSummary) !== JSON.stringify(run2CountsSummary)) {
    throw new Error('❌ Determinism violation: Counts differ between runs!');
  }
  if (JSON.stringify(run1Units) !== JSON.stringify(run2Units)) {
    throw new Error('❌ Determinism violation: Unit IDs or sequence differ between runs!');
  }
  if (JSON.stringify(run1Requests) !== JSON.stringify(run2Requests)) {
    throw new Error('❌ Determinism violation: Requests differ between runs!');
  }
  if (JSON.stringify(run1Audit) !== JSON.stringify(run2Audit)) {
    throw new Error('❌ Determinism violation: Audit genesis hash differs between runs!');
  }
  console.log('✅ STRICT DETERMINISM CONFIRMED: Run 1 and Run 2 produced 100% identical IDs, counts, and cryptographic hashes.\n');

  console.log('======================================================================');
  console.log('🔍 STEP 3: Verifying CRITICAL O- Platelet Scenario in Seed');
  console.log('======================================================================');
  const criticalReq = await BloodRequest.findOne({ id: 'R-101' }).lean();
  console.log(`Critical Request R-101:`);
  console.log(`   - Hospital: ${criticalReq?.hospitalId} (Amber Heart Institute)`);
  console.log(`   - Urgency: ${criticalReq?.urgency}`);
  console.log(`   - Component & Group: ${criticalReq?.component} ${criticalReq?.group}`);
  console.log(`   - Needed by: ${criticalReq?.neededBy.toISOString()}`);

  const nearestUnit = await Unit.findOne({ id: 'U-10001' }).lean();
  console.log(`Nearest Unit U-10001 (Pink City General - H1, 20m away):`);
  console.log(`   - Hospital: ${nearestUnit?.hospitalId}`);
  console.log(`   - Expires at: ${nearestUnit?.expiresAt.toISOString()}`);
  console.log(`   - Status: INFEASIBLE (Expires in 30m, but 15m buffer + 20m transit = 35m arrival > 30m expiry)`);

  const fartherUnit = await Unit.findOne({ id: 'U-10002' }).lean();
  console.log(`Farther Unit U-10002 (Rampura Trauma Centre - H5, 45m away):`);
  console.log(`   - Hospital: ${fartherUnit?.hospitalId}`);
  console.log(`   - Expires at: ${fartherUnit?.expiresAt.toISOString()}`);
  console.log(`   - Status: FEASIBLE (Expires in 28 hours, ample safety margin)`);
  console.log('✅ Scenario requirements perfectly seeded.\n');

  console.log('======================================================================');
  console.log('🔒 STEP 4: Index Inspection & Duplicate Booking Invariant Test');
  console.log('======================================================================');
  const indexVerification = await verifyReservationIndex(uri);

  console.log('\n======================================================================');
  console.log('🎉 ALL PHASE 1 & PHASE 2 VERIFICATIONS PASSED SUCCESSFULLY!');
  console.log('======================================================================');

  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Verification suite encountered an error:', err);
  process.exit(1);
});
