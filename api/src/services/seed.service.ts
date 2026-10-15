import mongoose from 'mongoose';
import { config } from '../config';
import { Hospital } from '../models/hospital.model';
import { Route } from '../models/route.model';
import { Unit } from '../models/unit.model';
import { BloodRequest } from '../models/request.model';
import { Reservation } from '../models/reservation.model';
import { Plan } from '../models/plan.model';
import { SimState } from '../models/simState.model';
import { AuditLog } from '../models/auditLog.model';
import { User } from '../models/user.model';
import { AuthService } from './auth.service';
import { BloodGroup, Component } from './rules.service';
import { computeAuditHash } from '../utils/hash';

export const INITIAL_SIM_TIME = '2026-10-15T08:00:00.000Z';

// Mulberry32 deterministic seeded PRNG
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BLOOD_GROUPS_WEIGHTED: { group: BloodGroup; weight: number }[] = [
  { group: 'O+', weight: 0.38 },
  { group: 'A+', weight: 0.30 },
  { group: 'B+', weight: 0.18 },
  { group: 'AB+', weight: 0.04 },
  { group: 'O-', weight: 0.06 },
  { group: 'A-', weight: 0.025 },
  { group: 'B-', weight: 0.012 },
  { group: 'AB-', weight: 0.003 },
];

function pickGroup(rand: () => number): BloodGroup {
  const r = rand();
  let acc = 0;
  for (const item of BLOOD_GROUPS_WEIGHTED) {
    acc += item.weight;
    if (r <= acc) return item.group;
  }
  return 'O+';
}

const HOSPITALS_SEED = [
  {
    id: 'H1',
    name: 'Pink City General',
    shortName: 'Pink City',
    coords: { x: 400, y: 250 },
    tier: 'Regional Hub',
  },
  {
    id: 'H2',
    name: 'Aravali Medical Centre',
    shortName: 'Aravali',
    coords: { x: 180, y: 170 },
    tier: 'General Hospital',
  },
  {
    id: 'H3',
    name: 'Amber Heart Institute',
    shortName: 'Amber Heart',
    coords: { x: 620, y: 110 },
    tier: 'Heart Institute',
  },
  {
    id: 'H4',
    name: 'Sawai Care Hospital',
    shortName: 'Sawai Care',
    coords: { x: 260, y: 390 },
    tier: 'Care Centre',
  },
  {
    id: 'H5',
    name: 'Rampura Trauma Centre',
    shortName: 'Rampura',
    coords: { x: 650, y: 360 },
    tier: 'Trauma Centre',
  },
];

const BASE_MATRIX: Record<string, Record<string, number>> = {
  H1: { H1: 5,  H2: 25, H3: 20, H4: 30, H5: 35 },
  H2: { H1: 25, H2: 5,  H3: 55, H4: 40, H5: 75 },
  H3: { H1: 20, H2: 55, H3: 5,  H4: 65, H5: 45 },
  H4: { H1: 30, H2: 40, H3: 65, H4: 5,  H5: 50 },
  H5: { H1: 35, H2: 75, H3: 45, H4: 50, H5: 5  },
};

export async function runSeed(customUri?: string) {
  const uri = customUri || config.mongodbUri;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // Ensure all collections and indexes are initialized
  await Hospital.init();
  await Route.init();
  await Unit.init();
  await BloodRequest.init();
  await Reservation.init();
  await Plan.init();
  await SimState.init();
  await AuditLog.init();
  await User.init();

  // Clear existing collections
  await Hospital.deleteMany({});
  await Route.deleteMany({});
  await Unit.deleteMany({});
  await BloodRequest.deleteMany({});
  await Reservation.deleteMany({});
  await Plan.deleteMany({});
  await SimState.deleteMany({});
  await AuditLog.deleteMany({});
  await User.deleteMany({});

  // 0. Seed Demo Users
  const adminPasswordHash = await AuthService.hashPassword('AdminPass123!');
  const coordPasswordHash = await AuthService.hashPassword('CoordPass123!');
  const viewerPasswordHash = await AuthService.hashPassword('ViewerPass123!');

  await User.insertMany([
    {
      id: 'USR-ADMIN',
      email: 'admin@bloodstock.local',
      passwordHash: adminPasswordHash,
      name: 'System Administrator',
      role: 'ADMIN',
      hospitalId: null,
      refreshTokens: [],
    },
    {
      id: 'USR-COORD1',
      email: 'coordinator1@bloodstock.local',
      passwordHash: coordPasswordHash,
      name: 'Amber Heart Coordinator',
      role: 'COORDINATOR',
      hospitalId: 'H3', // Amber Heart Institute
      refreshTokens: [],
    },
    {
      id: 'USR-VIEWER',
      email: 'viewer@bloodstock.local',
      passwordHash: viewerPasswordHash,
      name: 'Clinical Observer',
      role: 'VIEWER',
      hospitalId: null,
      refreshTokens: [],
    },
  ]);

  const rand = mulberry32(42);
  const baseTime = new Date(INITIAL_SIM_TIME).getTime();

  // 1. Insert Hospitals
  await Hospital.insertMany(HOSPITALS_SEED);

  // 2. Insert Routes (Symmetric matrix 15-75 min)
  const routesData: Array<{ fromId: string; toId: string; baseMinutes: number; status: 'UP'; delayMinutes: number }> = [];
  const hospitalIds = ['H1', 'H2', 'H3', 'H4', 'H5'];
  for (const fromId of hospitalIds) {
    for (const toId of hospitalIds) {
      routesData.push({
        fromId,
        toId,
        baseMinutes: BASE_MATRIX[fromId]?.[toId] ?? 30,
        status: 'UP',
        delayMinutes: 0,
      });
    }
  }
  await Route.insertMany(routesData);

  // 3. Insert Units (~120 deterministic units)
  const unitsData: Array<unknown> = [];
  let unitCounter = 10001;

  // HERO UNIT 1 (Nearest to H3 Amber Heart Institute, but INFEASIBLE due to expiration):
  // At H1 (20m transit to H3). With 15m dispatch buffer + 20m transit = 35m arrival.
  // Unit expires in 30 minutes! Arrives AFTER expiration (violates 30m safety margin as well).
  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'PLATELETS',
    group: 'O-',
    hospitalId: 'H1', // Pink City General (nearest to H3)
    collectedAt: new Date(baseTime - 4 * 86400000 - 23.5 * 3600000),
    expiresAt: new Date(baseTime + 30 * 60000), // expires in 30 mins!
    status: 'AVAILABLE',
    version: 0,
  });

  // HERO UNIT 2 (Farther feasible unit for Amber Heart Institute):
  // At H5 (Rampura Trauma Centre, 45m transit to H3).
  // Collected 3 days ago, expires in 28 hours (feasible!).
  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'PLATELETS',
    group: 'O-',
    hospitalId: 'H5',
    collectedAt: new Date(baseTime - 3 * 86400000),
    expiresAt: new Date(baseTime + 28 * 3600000),
    status: 'AVAILABLE',
    version: 0,
  });

  // Critical O- Red cells at H1 and H2
  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'O-',
    hospitalId: 'H1',
    collectedAt: new Date(baseTime - 12 * 86400000),
    expiresAt: new Date(baseTime + 30 * 86400000),
    status: 'AVAILABLE',
    version: 0,
  });

  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'O-',
    hospitalId: 'H2',
    collectedAt: new Date(baseTime - 15 * 86400000),
    expiresAt: new Date(baseTime + 27 * 86400000),
    status: 'AVAILABLE',
    version: 0,
  });

  // Contention units for R-102 (H1, A+ red cells, needs 2 units) and R-105 (H2, B+ red cells, needs 1 unit):
  // U-10005: O+ red cells at H1 (5m to H1; 40m to H2)
  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'O+',
    hospitalId: 'H1',
    collectedAt: new Date(baseTime - 10 * 86400000),
    expiresAt: new Date(baseTime + 30 * 86400000),
    status: 'AVAILABLE',
    version: 0,
  });

  // U-10006: A+ red cells at H1 (5m to H1)
  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'A+',
    hospitalId: 'H1',
    collectedAt: new Date(baseTime - 10 * 86400000),
    expiresAt: new Date(baseTime + 30 * 86400000),
    status: 'AVAILABLE',
    version: 0,
  });

  // U-10007: A+ red cells at H3 (35m to H1; incompatible with B+)
  unitsData.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'A+',
    hospitalId: 'H3',
    collectedAt: new Date(baseTime - 10 * 86400000),
    expiresAt: new Date(baseTime + 30 * 86400000),
    status: 'AVAILABLE',
    version: 0,
  });

  // Units expiring within 6 hours
  const expiringWithin6h = [
    { comp: 'PLATELETS' as Component, group: 'A+' as BloodGroup, h: 'H3', expMin: 180 },
    { comp: 'RED_CELLS' as Component, group: 'AB+' as BloodGroup, h: 'H4', expMin: 270 },
    { comp: 'PLASMA' as Component, group: 'O+' as BloodGroup, h: 'H2', expMin: 320 },
  ];
  for (const cfg of expiringWithin6h) {
    unitsData.push({
      id: `U-${unitCounter++}`,
      component: cfg.comp,
      group: cfg.group,
      hospitalId: cfg.h,
      collectedAt: new Date(baseTime - 4 * 86400000),
      expiresAt: new Date(baseTime + cfg.expMin * 60000),
      status: 'AVAILABLE',
      version: 0,
    });
  }

  // Units expiring within 24 hours
  const expiringWithin24h = [
    { comp: 'PLATELETS' as Component, group: 'A+' as BloodGroup, h: 'H1', expHours: 9 },
    { comp: 'RED_CELLS' as Component, group: 'AB-' as BloodGroup, h: 'H5', expHours: 14 },
    { comp: 'PLATELETS' as Component, group: 'A+' as BloodGroup, h: 'H2', expHours: 18 },
    { comp: 'RED_CELLS' as Component, group: 'AB+' as BloodGroup, h: 'H3', expHours: 21 },
  ];
  for (const cfg of expiringWithin24h) {
    unitsData.push({
      id: `U-${unitCounter++}`,
      component: cfg.comp,
      group: cfg.group,
      hospitalId: cfg.h,
      collectedAt: new Date(baseTime - 5 * 86400000),
      expiresAt: new Date(baseTime + cfg.expHours * 3600000),
      status: 'AVAILABLE',
      version: 0,
    });
  }

  // Units expiring within 72 hours
  const expiringWithin72h = [
    { comp: 'RED_CELLS' as Component, group: 'AB+' as BloodGroup, h: 'H1', expHours: 40 },
    { comp: 'PLASMA' as Component, group: 'B-' as BloodGroup, h: 'H3', expHours: 52 },
    { comp: 'PLATELETS' as Component, group: 'AB+' as BloodGroup, h: 'H4', expHours: 64 },
  ];
  for (const cfg of expiringWithin72h) {
    unitsData.push({
      id: `U-${unitCounter++}`,
      component: cfg.comp,
      group: cfg.group,
      hospitalId: cfg.h,
      collectedAt: new Date(baseTime - 8 * 86400000),
      expiresAt: new Date(baseTime + cfg.expHours * 3600000),
      status: 'AVAILABLE',
      version: 0,
    });
  }

  // Generate remaining units up to 122 units total
  const components: Component[] = ['RED_CELLS', 'PLATELETS', 'PLASMA'];
  const shelfLives = {
    RED_CELLS: 42 * 86400000,
    PLATELETS: 5 * 86400000,
    PLASMA: 30 * 86400000,
  };

  while (unitsData.length < 122) {
    const component = components[Math.floor(rand() * components.length)]!;
    let group = pickGroup(rand);
    if (component === 'PLATELETS' && (group === 'O-' || group === 'O+')) {
      group = 'A+';
    }
    if (component === 'RED_CELLS') {
      group = 'AB+';
    }
    const hospitalId = hospitalIds[Math.floor(rand() * hospitalIds.length)]!;
    const maxAge = shelfLives[component];
    const age = maxAge * (0.1 + rand() * 0.8);
    const collectedAtTime = baseTime - age;
    const expiresAtTime = collectedAtTime + maxAge;

    unitsData.push({
      id: `U-${unitCounter++}`,
      component,
      group,
      hospitalId,
      collectedAt: new Date(collectedAtTime),
      expiresAt: new Date(expiresAtTime),
      status: 'AVAILABLE',
      version: 0,
    });
  }

  await Unit.insertMany(unitsData);

  // 4. Insert 6 Open Requests
  const requestsData = [
    {
      id: 'R-101',
      hospitalId: 'H3', // Amber Heart Institute (CRITICAL O- Platelet edge case)
      component: 'PLATELETS',
      group: 'O-',
      unitsNeeded: 1,
      neededBy: new Date(baseTime + 2 * 3600000), // 2 hours
      urgency: 'CRITICAL',
      status: 'OPEN',
      createdAt: new Date(baseTime - 25 * 60000),
      clinicalContext: 'Acute bleeding post-coronary intervention. Emergency platelet crossmatch required.',
    },
    {
      id: 'R-102',
      hospitalId: 'H1', // Pink City General
      component: 'RED_CELLS',
      group: 'A+',
      unitsNeeded: 2,
      neededBy: new Date(baseTime + 4 * 3600000), // 4 hours
      urgency: 'URGENT',
      status: 'OPEN',
      createdAt: new Date(baseTime - 45 * 60000),
      clinicalContext: 'Scheduled aortic aneurysm surgical repair requiring crossmatched packed red blood cells.',
    },
    {
      id: 'R-103',
      hospitalId: 'H5', // Rampura Trauma Centre
      component: 'RED_CELLS',
      group: 'O-',
      unitsNeeded: 2,
      neededBy: new Date(baseTime + 3 * 3600000), // 3 hours
      urgency: 'CRITICAL',
      status: 'OPEN',
      createdAt: new Date(baseTime - 15 * 60000),
      clinicalContext: 'Multi-vehicle collision trauma victim with massive internal bleed and shock.',
    },
    {
      id: 'R-104',
      hospitalId: 'H3', // Amber Heart Institute
      component: 'PLASMA',
      group: 'AB+',
      unitsNeeded: 2,
      neededBy: new Date(baseTime + 12 * 3600000), // 12 hours
      urgency: 'ROUTINE',
      status: 'OPEN',
      createdAt: new Date(baseTime - 90 * 60000),
      clinicalContext: 'Elective coronary artery bypass graft preparation; coagulopathy correction profile.',
    },
    {
      id: 'R-105',
      hospitalId: 'H2', // Aravali Medical Centre
      component: 'RED_CELLS',
      group: 'B+',
      unitsNeeded: 1,
      neededBy: new Date(baseTime + 8 * 3600000), // 8 hours
      urgency: 'ROUTINE',
      status: 'OPEN',
      createdAt: new Date(baseTime - 60 * 60000),
      clinicalContext: 'Severe chronic anemia in oncology chemotherapy patient needing stabilization.',
    },
    {
      id: 'R-106',
      hospitalId: 'H4', // Sawai Care Hospital
      component: 'PLASMA',
      group: 'A-',
      unitsNeeded: 1,
      neededBy: new Date(baseTime + 5 * 3600000), // 5 hours
      urgency: 'URGENT',
      status: 'OPEN',
      createdAt: new Date(baseTime - 30 * 60000),
      clinicalContext: 'Acute liver failure with prolonged INR requiring fresh frozen plasma transfusion.',
    },
  ];

  await BloodRequest.insertMany(requestsData);

  // 5. Insert SimState
  await SimState.create({
    key: 'current',
    virtualNow: new Date(INITIAL_SIM_TIME),
    isPaused: false,
    speedMultiplier: 1,
  });

  // 6. Insert Initial Genesis AuditLog
  const genesisPayload = {
    seq: 1,
    timestamp: new Date(INITIAL_SIM_TIME).toISOString(),
    actor: { id: 'SYSTEM', role: 'SYSTEM' as const },
    action: 'SYSTEM_GENESIS_SEED',
    entity: 'SYSTEM',
    entityId: 'GENESIS',
    diff: {
      hospitals: HOSPITALS_SEED.length,
      routes: routesData.length,
      units: unitsData.length,
      requests: requestsData.length,
    },
  };
  const genesisPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';
  const genesisHash = computeAuditHash(genesisPrevHash, genesisPayload);

  await AuditLog.create({
    ...genesisPayload,
    timestamp: new Date(genesisPayload.timestamp),
    prevHash: genesisPrevHash,
    hash: genesisHash,
  });

  const counts = {
    hospitals: await Hospital.countDocuments(),
    routes: await Route.countDocuments(),
    units: await Unit.countDocuments(),
    requests: await BloodRequest.countDocuments(),
    simState: await SimState.countDocuments(),
    auditLogs: await AuditLog.countDocuments(),
    users: await User.countDocuments(),
    heroUnitNearest: await Unit.findOne({ id: 'U-10001' }).lean(),
    heroUnitFarther: await Unit.findOne({ id: 'U-10002' }).lean(),
    criticalRequest: await BloodRequest.findOne({ id: 'R-101' }).lean(),
  };

  return counts;
}
