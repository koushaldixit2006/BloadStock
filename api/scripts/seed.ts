import { runSeed, INITIAL_SIM_TIME } from '../src/services/seed.service';

export { runSeed, INITIAL_SIM_TIME };

if (require.main === module) {
  runSeed()
    .then((counts) => {
      console.log('✅ Seed completed successfully:');
      console.log(`   - Hospitals: ${counts.hospitals}`);
      console.log(`   - Routes: ${counts.routes}`);
      console.log(`   - Units: ${counts.units}`);
      console.log(`   - Requests: ${counts.requests}`);
      console.log(`   - Users: ${counts.users}`);
      console.log(`   - SimState: ${counts.simState}`);
      console.log(`   - AuditLogs: ${counts.auditLogs}`);
      console.log(`   - Critical Request: ${counts.criticalRequest?.id} at ${counts.criticalRequest?.hospitalId} for ${counts.criticalRequest?.group} ${counts.criticalRequest?.component}`);
      console.log(`   - Nearest Unit: ${counts.heroUnitNearest?.id} at ${counts.heroUnitNearest?.hospitalId} expiresAt ${counts.heroUnitNearest?.expiresAt.toISOString()}`);
      console.log(`   - Farther Feasible Unit: ${counts.heroUnitFarther?.id} at ${counts.heroUnitFarther?.hospitalId} expiresAt ${counts.heroUnitFarther?.expiresAt.toISOString()}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Seed error:', err);
      process.exit(1);
    });
}
