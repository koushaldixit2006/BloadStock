import mongoose from 'mongoose';
import { config } from '../src/config';
import { Reservation } from '../src/models/reservation.model';

export async function verifyReservationIndex(customUri?: string) {
  const uri = customUri || config.mongodbUri;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // Ensure indexes are synced with the database
  await Reservation.init();

  console.log('=================================================================');
  console.log('🔍 STEP 1: Inspecting Indexes on "reservations" Collection');
  console.log('=================================================================');
  const indexes = await Reservation.collection.indexes();
  console.dir(indexes, { depth: null });

  const partialActiveIndex = indexes.find(
    (idx) => idx.key && idx.key['unitId'] === 1 && idx.unique === true && idx.partialFilterExpression?.isActive === true
  );

  if (!partialActiveIndex) {
    throw new Error('❌ FAILED: Unique partial index on { unitId: 1 } with { isActive: true } was NOT found!');
  }
  console.log('\n✅ VERIFIED: Unique partial index exists:');
  console.log('   Key:', JSON.stringify(partialActiveIndex.key));
  console.log('   Unique:', partialActiveIndex.unique);
  console.log('   PartialFilterExpression:', JSON.stringify(partialActiveIndex.partialFilterExpression));

  console.log('\n=================================================================');
  console.log('🧪 STEP 2: Concurrency & Duplicate Booking Invariant Test');
  console.log('=================================================================');

  const testUnitId = 'U-TEST-LOCK-9999';
  const testRequestId1 = 'R-TEST-1001';
  const testRequestId2 = 'R-TEST-1002';

  // Clean up any stale test documents
  await Reservation.deleteMany({ unitId: testUnitId });

  try {
    console.log(`[Attempt 1] Creating first ACTIVE reservation for unit ${testUnitId}...`);
    const res1 = await Reservation.create({
      id: 'RSV-TEST-001',
      unitId: testUnitId,
      requestId: testRequestId1,
      fromHospitalId: 'H1',
      toHospitalId: 'H3',
      dispatchAt: new Date(),
      eta: new Date(Date.now() + 35 * 60000),
      transitMinutes: 35,
      status: 'RESERVED',
      isActive: true,
    });
    console.log(`   -> Successfully created ${res1.id} (isActive: ${res1.isActive})`);

    console.log(`[Attempt 2] Attempting to create SECOND ACTIVE reservation for SAME unit ${testUnitId}...`);
    let caught11000 = false;
    let errorCode: number | undefined;

    try {
      await Reservation.create({
        id: 'RSV-TEST-002',
        unitId: testUnitId,
        requestId: testRequestId2,
        fromHospitalId: 'H1',
        toHospitalId: 'H4',
        dispatchAt: new Date(),
        eta: new Date(Date.now() + 30 * 60000),
        transitMinutes: 30,
        status: 'RESERVED',
        isActive: true,
      });
      console.error('❌ ERROR: Second active reservation succeeded! Invariant broken!');
    } catch (err: unknown) {
      const mongoErr = err as { code?: number; message?: string };
      errorCode = mongoErr.code;
      if (mongoErr.code === 11000) {
        caught11000 = true;
        console.log('   -> ✅ Second active reservation rejected as expected!');
        console.log(`   -> Error Code: ${mongoErr.code} (Duplicate Key Error)`);
        console.log(`   -> Details: ${mongoErr.message}`);
      } else {
        console.error('❌ Unexpected error occurred:', err);
      }
    }

    if (!caught11000) {
      throw new Error(`❌ Invariant failed: Expected Mongo error 11000, got ${errorCode}`);
    }

    console.log('\n[Attempt 3] Testing non-active historical reservation for SAME unit (DELIVERED)...');
    const res3 = await Reservation.create({
      id: 'RSV-TEST-003',
      unitId: testUnitId,
      requestId: 'R-TEST-HISTORIC',
      fromHospitalId: 'H1',
      toHospitalId: 'H3',
      dispatchAt: new Date(Date.now() - 3600000),
      eta: new Date(Date.now() - 1800000),
      transitMinutes: 30,
      status: 'DELIVERED',
      isActive: false,
    });
    console.log(`   -> Successfully inserted historical DELIVERED reservation ${res3.id} (isActive: false)`);
    console.log('   -> Proves partialFilterExpression allows historical terminal records while locking active ones!');
    console.log('\n✅ Invariant verification completed with 100% SUCCESS.');

    return { indexes, partialActiveIndex, caught11000, errorCode };
  } finally {
    await Reservation.deleteMany({
      $or: [
        { unitId: testUnitId },
        { id: { $regex: '^RSV-TEST-' } }
      ]
    });
  }
}

if (require.main === module) {
  verifyReservationIndex()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Verification failed:', err);
      process.exit(1);
    });
}
