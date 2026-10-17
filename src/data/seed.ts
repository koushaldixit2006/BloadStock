import { BloodGroup, BloodRequest, Component, Unit } from '../types/domain';

export const INITIAL_SIM_TIME = '2026-10-15T08:00:00.000Z';

// Seeded PRNG (Mulberry32) for deterministic reproducible simulation data
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

export function generateSeedUnits(baseTimeIso: string = INITIAL_SIM_TIME): Unit[] {
  const rand = mulberry32(42);
  const baseTime = new Date(baseTimeIso).getTime();
  const hospitals = ['H1', 'H2', 'H3', 'H4', 'H5'];
  const units: Unit[] = [];

  let unitCounter = 10001;

  // 1. Explicitly crafted hero units for the scenario
  // Near unit for R-101 (Sawai Care needs O- Platelet):
  // At H1 (Pink City, 30 min from H4): expires in 35 min!
  // With 15m dispatch buffer + 30m transit = 45m arrival, so it arrives AFTER unit expires (and violates 30m safety margin).
  units.push({
    id: `U-${unitCounter++}`,
    component: 'PLATELETS',
    group: 'O-',
    hospitalId: 'H1', // Pink City General (nearest to H4)
    collectedAt: new Date(baseTime - 4 * 86400000 - 23.4 * 3600000).toISOString(),
    expiresAt: new Date(baseTime + 35 * 60000).toISOString(), // expires in 35 mins
    status: 'AVAILABLE',
  });

  // Farther feasible unit for R-101:
  // At H5 (Rampura Trauma Centre, 50 min from H4): expires in 28 hours (feasible!)
  units.push({
    id: `U-${unitCounter++}`,
    component: 'PLATELETS',
    group: 'O-',
    hospitalId: 'H5', // Rampura (50 min to H4)
    collectedAt: new Date(baseTime - 3 * 86400000).toISOString(),
    expiresAt: new Date(baseTime + 28 * 3600000).toISOString(), // expires in 28 hours
    status: 'AVAILABLE',
  });

  // Critical O- Red cells at H1 and H2 for urgent emergency requests
  units.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'O-',
    hospitalId: 'H1',
    collectedAt: new Date(baseTime - 12 * 86400000).toISOString(),
    expiresAt: new Date(baseTime + 30 * 86400000).toISOString(),
    status: 'AVAILABLE',
  });

  units.push({
    id: `U-${unitCounter++}`,
    component: 'RED_CELLS',
    group: 'O-',
    hospitalId: 'H2',
    collectedAt: new Date(baseTime - 15 * 86400000).toISOString(),
    expiresAt: new Date(baseTime + 27 * 86400000).toISOString(),
    status: 'AVAILABLE',
  });

  // Seeded units with shelf-life expiring within 6h (urgent waste risk)
  const expiringWithin6hConfigs = [
    { comp: 'PLATELETS' as Component, group: 'A+' as BloodGroup, h: 'H3', expMin: 180 },
    { comp: 'RED_CELLS' as Component, group: 'B+' as BloodGroup, h: 'H4', expMin: 270 },
    { comp: 'PLASMA' as Component, group: 'O+' as BloodGroup, h: 'H2', expMin: 320 },
  ];
  for (const cfg of expiringWithin6hConfigs) {
    units.push({
      id: `U-${unitCounter++}`,
      component: cfg.comp,
      group: cfg.group,
      hospitalId: cfg.h,
      collectedAt: new Date(baseTime - 4 * 86400000).toISOString(),
      expiresAt: new Date(baseTime + cfg.expMin * 60000).toISOString(),
      status: 'AVAILABLE',
    });
  }

  // Seeded units expiring within 24h
  const expiringWithin24hConfigs = [
    { comp: 'PLATELETS' as Component, group: 'A+' as BloodGroup, h: 'H1', expHours: 9 },
    { comp: 'RED_CELLS' as Component, group: 'A-' as BloodGroup, h: 'H5', expHours: 14 },
    { comp: 'PLATELETS' as Component, group: 'B+' as BloodGroup, h: 'H2', expHours: 18 },
    { comp: 'RED_CELLS' as Component, group: 'O+' as BloodGroup, h: 'H3', expHours: 21 },
  ];
  for (const cfg of expiringWithin24hConfigs) {
    units.push({
      id: `U-${unitCounter++}`,
      component: cfg.comp,
      group: cfg.group,
      hospitalId: cfg.h,
      collectedAt: new Date(baseTime - 5 * 86400000).toISOString(),
      expiresAt: new Date(baseTime + cfg.expHours * 3600000).toISOString(),
      status: 'AVAILABLE',
    });
  }

  // Seeded units expiring within 72h
  const expiringWithin72hConfigs = [
    { comp: 'RED_CELLS' as Component, group: 'A+' as BloodGroup, h: 'H1', expHours: 40 },
    { comp: 'PLASMA' as Component, group: 'B-' as BloodGroup, h: 'H3', expHours: 52 },
    { comp: 'PLATELETS' as Component, group: 'AB+' as BloodGroup, h: 'H4', expHours: 64 },
  ];
  for (const cfg of expiringWithin72hConfigs) {
    units.push({
      id: `U-${unitCounter++}`,
      component: cfg.comp,
      group: cfg.group,
      hospitalId: cfg.h,
      collectedAt: new Date(baseTime - 8 * 86400000).toISOString(),
      expiresAt: new Date(baseTime + cfg.expHours * 3600000).toISOString(),
      status: 'AVAILABLE',
    });
  }

  // Generate remaining units up to ~120 total
  const components: Component[] = ['RED_CELLS', 'PLATELETS', 'PLASMA'];
  const shelfLives = {
    RED_CELLS: 42 * 86400000,
    PLATELETS: 5 * 86400000,
    PLASMA: 30 * 86400000,
  };

  while (units.length < 122) {
    const component = components[Math.floor(rand() * components.length)];
    let group = pickGroup(rand);
    // Keep O platelets exclusive to the curated scenario units (U-10001 and U-10002)
    if (component === 'PLATELETS' && (group === 'O-' || group === 'O+')) {
      group = 'A+';
    }
    const hospitalId = hospitals[Math.floor(rand() * hospitals.length)];

    const maxAge = shelfLives[component];
    // Random age between 10% and 90% of shelf life
    const age = maxAge * (0.1 + rand() * 0.8);
    const collectedAtTime = baseTime - age;
    const expiresAtTime = collectedAtTime + maxAge;

    units.push({
      id: `U-${unitCounter++}`,
      component,
      group,
      hospitalId,
      collectedAt: new Date(collectedAtTime).toISOString(),
      expiresAt: new Date(expiresAtTime).toISOString(),
      status: 'AVAILABLE',
    });
  }

  return units;
}

export function generateSeedRequests(baseTimeIso: string = INITIAL_SIM_TIME): BloodRequest[] {
  const baseTime = new Date(baseTimeIso).getTime();

  return [
    {
      id: 'R-101',
      hospitalId: 'H4', // Sawai Care Hospital
      component: 'PLATELETS',
      group: 'O-',
      unitsNeeded: 1,
      neededBy: new Date(baseTime + 2 * 3600000).toISOString(), // 2 hours
      urgency: 'CRITICAL',
      status: 'OPEN',
      createdAt: new Date(baseTime - 25 * 60000).toISOString(),
      clinicalContext: 'Severe post-partum hemorrhage with acute thrombocytopenia. Rapid platelet support required.',
    },
    {
      id: 'R-102',
      hospitalId: 'H1', // Pink City General
      component: 'RED_CELLS',
      group: 'A+',
      unitsNeeded: 3,
      neededBy: new Date(baseTime + 4 * 3600000).toISOString(), // 4 hours
      urgency: 'URGENT',
      status: 'OPEN',
      createdAt: new Date(baseTime - 45 * 60000).toISOString(),
      clinicalContext: 'Scheduled aortic aneurysm surgical repair requiring crossmatched packed red blood cells.',
    },
    {
      id: 'R-103',
      hospitalId: 'H5', // Rampura Trauma Centre
      component: 'RED_CELLS',
      group: 'O-',
      unitsNeeded: 2,
      neededBy: new Date(baseTime + 3 * 3600000).toISOString(), // 3 hours
      urgency: 'CRITICAL',
      status: 'OPEN',
      createdAt: new Date(baseTime - 15 * 60000).toISOString(),
      clinicalContext: 'Multi-vehicle collision trauma victim with massive internal bleed and shock.',
    },
    {
      id: 'R-104',
      hospitalId: 'H3', // Amber Heart Institute
      component: 'PLASMA',
      group: 'AB+',
      unitsNeeded: 2,
      neededBy: new Date(baseTime + 12 * 3600000).toISOString(), // 12 hours
      urgency: 'ROUTINE',
      status: 'OPEN',
      createdAt: new Date(baseTime - 90 * 60000).toISOString(),
      clinicalContext: 'Elective coronary artery bypass graft preparation; coagulopathy correction profile.',
    },
    {
      id: 'R-105',
      hospitalId: 'H2', // Aravali Medical Centre
      component: 'RED_CELLS',
      group: 'B+',
      unitsNeeded: 1,
      neededBy: new Date(baseTime + 8 * 3600000).toISOString(), // 8 hours
      urgency: 'ROUTINE',
      status: 'OPEN',
      createdAt: new Date(baseTime - 60 * 60000).toISOString(),
      clinicalContext: 'Severe chronic anemia in oncology chemotherapy patient needing stabilization.',
    },
    {
      id: 'R-106',
      hospitalId: 'H4', // Sawai Care Hospital
      component: 'PLASMA',
      group: 'A-',
      unitsNeeded: 1,
      neededBy: new Date(baseTime + 5 * 3600000).toISOString(), // 5 hours
      urgency: 'URGENT',
      status: 'OPEN',
      createdAt: new Date(baseTime - 30 * 60000).toISOString(),
      clinicalContext: 'Acute liver failure with prolonged INR requiring fresh frozen plasma transfusion.',
    },
  ];
}
