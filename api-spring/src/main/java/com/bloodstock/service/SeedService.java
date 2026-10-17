package com.bloodstock.service;

import com.bloodstock.domain.*;
import com.bloodstock.repository.*;
import com.bloodstock.util.CanonicalJson;
import com.bloodstock.util.Mulberry32;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
public class SeedService {

    private static final Logger log = LoggerFactory.getLogger(SeedService.class);

    public static final String INITIAL_SIM_TIME = "2026-10-15T08:00:00.000Z";

    private final HospitalRepository hospitalRepository;
    private final RouteRepository routeRepository;
    private final UnitRepository unitRepository;
    private final BloodRequestRepository bloodRequestRepository;
    private final ReservationRepository reservationRepository;
    private final PlanRepository planRepository;
    private final SimStateRepository simStateRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final SequenceCounterRepository sequenceCounterRepository;
    private final SequenceService sequenceService;

    private final Argon2PasswordEncoder passwordEncoder =
            new Argon2PasswordEncoder(16, 32, 1, 19456, 2);

    private record GroupWeight(BloodGroup group, double weight) {}

    private static final List<GroupWeight> BLOOD_GROUPS_WEIGHTED = List.of(
            new GroupWeight(BloodGroup.O_PLUS, 0.38),
            new GroupWeight(BloodGroup.A_PLUS, 0.30),
            new GroupWeight(BloodGroup.B_PLUS, 0.18),
            new GroupWeight(BloodGroup.AB_PLUS, 0.04),
            new GroupWeight(BloodGroup.O_MINUS, 0.06),
            new GroupWeight(BloodGroup.A_MINUS, 0.025),
            new GroupWeight(BloodGroup.B_MINUS, 0.012),
            new GroupWeight(BloodGroup.AB_MINUS, 0.003)
    );

    private static final Map<String, Map<String, Integer>> BASE_MATRIX = Map.of(
            "H1", Map.of("H1", 5, "H2", 25, "H3", 20, "H4", 30, "H5", 35),
            "H2", Map.of("H1", 25, "H2", 5, "H3", 55, "H4", 40, "H5", 75),
            "H3", Map.of("H1", 20, "H2", 55, "H3", 5, "H4", 65, "H5", 45),
            "H4", Map.of("H1", 30, "H2", 40, "H3", 65, "H4", 5, "H5", 50),
            "H5", Map.of("H1", 35, "H2", 75, "H3", 45, "H4", 50, "H5", 5)
    );

    public SeedService(
            HospitalRepository hospitalRepository,
            RouteRepository routeRepository,
            UnitRepository unitRepository,
            BloodRequestRepository bloodRequestRepository,
            ReservationRepository reservationRepository,
            PlanRepository planRepository,
            SimStateRepository simStateRepository,
            AuditLogRepository auditLogRepository,
            UserRepository userRepository,
            SequenceCounterRepository sequenceCounterRepository,
            SequenceService sequenceService
    ) {
        this.hospitalRepository = hospitalRepository;
        this.routeRepository = routeRepository;
        this.unitRepository = unitRepository;
        this.bloodRequestRepository = bloodRequestRepository;
        this.reservationRepository = reservationRepository;
        this.planRepository = planRepository;
        this.simStateRepository = simStateRepository;
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
        this.sequenceCounterRepository = sequenceCounterRepository;
        this.sequenceService = sequenceService;
    }

    private BloodGroup pickGroup(Mulberry32 rand) {
        double r = rand.nextDouble();
        double acc = 0;
        for (GroupWeight item : BLOOD_GROUPS_WEIGHTED) {
            acc += item.weight();
            if (r <= acc) return item.group();
        }
        return BloodGroup.O_PLUS;
    }

    public synchronized SeedCounts runSeed() {
        log.info("Starting deterministic seed at simulation time: {}", INITIAL_SIM_TIME);

        // Clear existing collections
        hospitalRepository.deleteAll();
        routeRepository.deleteAll();
        unitRepository.deleteAll();
        bloodRequestRepository.deleteAll();
        reservationRepository.deleteAll();
        planRepository.deleteAll();
        simStateRepository.deleteAll();
        auditLogRepository.deleteAll();
        userRepository.deleteAll();
        sequenceCounterRepository.deleteAll();

        // 0. Seed Demo Users
        String adminPasswordHash = passwordEncoder.encode("AdminPass123!");
        String coordPasswordHash = passwordEncoder.encode("CoordPass123!");
        String viewerPasswordHash = passwordEncoder.encode("ViewerPass123!");

        userRepository.saveAll(List.of(
                new User("USR-ADMIN", "admin@bloodstock.local", adminPasswordHash, "System Administrator", Role.ADMIN, null),
                new User("USR-COORD1", "coordinator1@bloodstock.local", coordPasswordHash, "Amber Heart Coordinator", Role.COORDINATOR, "H3"),
                new User("USR-VIEWER", "viewer@bloodstock.local", viewerPasswordHash, "Clinical Observer", Role.VIEWER, null)
        ));

        Mulberry32 rand = new Mulberry32(42);
        long baseTime = Instant.parse(INITIAL_SIM_TIME).toEpochMilli();

        // 1. Insert 5 Hospitals
        List<Hospital> hospitals = List.of(
                new Hospital("H1", "Pink City General", "Pink City", new Hospital.Coordinates(400, 250), "Regional Hub"),
                new Hospital("H2", "Aravali Medical Centre", "Aravali", new Hospital.Coordinates(180, 170), "General Hospital"),
                new Hospital("H3", "Amber Heart Institute", "Amber Heart", new Hospital.Coordinates(620, 110), "Heart Institute"),
                new Hospital("H4", "Sawai Care Hospital", "Sawai Care", new Hospital.Coordinates(260, 390), "Care Centre"),
                new Hospital("H5", "Rampura Trauma Centre", "Rampura", new Hospital.Coordinates(650, 360), "Trauma Centre")
        );
        hospitalRepository.saveAll(hospitals);

        // 2. Insert 25 Routes (Symmetric matrix 15-75 min)
        List<String> hospitalIds = List.of("H1", "H2", "H3", "H4", "H5");
        List<Route> routes = new ArrayList<>();
        for (String fromId : hospitalIds) {
            for (String toId : hospitalIds) {
                int baseMins = BASE_MATRIX.getOrDefault(fromId, Map.of()).getOrDefault(toId, 30);
                routes.add(new Route(fromId, toId, baseMins, "UP", 0));
            }
        }
        routeRepository.saveAll(routes);

        // 3. Insert Units (122 units)
        List<Unit> units = new ArrayList<>();
        int unitCounter = 10001;

        // HERO UNIT 1 (Pink City H1 -> Amber Heart H3; expired/infeasible)
        units.add(new Unit(
                "U-" + (unitCounter++),
                Component.PLATELETS,
                BloodGroup.O_MINUS,
                "H1",
                Instant.ofEpochMilli(baseTime - 4 * 86400000L - (long) (23.5 * 3600000L)),
                Instant.ofEpochMilli(baseTime + 30 * 60000L),
                "AVAILABLE",
                0L
        ));

        // HERO UNIT 2 (Rampura H5 -> Amber Heart H3; feasible)
        units.add(new Unit(
                "U-" + (unitCounter++),
                Component.PLATELETS,
                BloodGroup.O_MINUS,
                "H5",
                Instant.ofEpochMilli(baseTime - 3 * 86400000L),
                Instant.ofEpochMilli(baseTime + 28 * 3600000L),
                "AVAILABLE",
                0L
        ));

        // Critical O- Red cells at H1 and H2
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.O_MINUS, "H1",
                Instant.ofEpochMilli(baseTime - 12 * 86400000L), Instant.ofEpochMilli(baseTime + 30 * 86400000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.O_MINUS, "H2",
                Instant.ofEpochMilli(baseTime - 15 * 86400000L), Instant.ofEpochMilli(baseTime + 27 * 86400000L), "AVAILABLE", 0L));

        // Contention units for R-102 and R-105:
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.O_PLUS, "H1",
                Instant.ofEpochMilli(baseTime - 10 * 86400000L), Instant.ofEpochMilli(baseTime + 30 * 86400000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.A_PLUS, "H1",
                Instant.ofEpochMilli(baseTime - 10 * 86400000L), Instant.ofEpochMilli(baseTime + 30 * 86400000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.A_PLUS, "H3",
                Instant.ofEpochMilli(baseTime - 10 * 86400000L), Instant.ofEpochMilli(baseTime + 30 * 86400000L), "AVAILABLE", 0L));

        // Expiring within 6 hours
        units.add(new Unit("U-" + (unitCounter++), Component.PLATELETS, BloodGroup.A_PLUS, "H3",
                Instant.ofEpochMilli(baseTime - 4 * 86400000L), Instant.ofEpochMilli(baseTime + 180 * 60000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.AB_PLUS, "H4",
                Instant.ofEpochMilli(baseTime - 4 * 86400000L), Instant.ofEpochMilli(baseTime + 270 * 60000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.PLASMA, BloodGroup.O_PLUS, "H2",
                Instant.ofEpochMilli(baseTime - 4 * 86400000L), Instant.ofEpochMilli(baseTime + 320 * 60000L), "AVAILABLE", 0L));

        // Expiring within 24 hours
        units.add(new Unit("U-" + (unitCounter++), Component.PLATELETS, BloodGroup.A_PLUS, "H1",
                Instant.ofEpochMilli(baseTime - 5 * 86400000L), Instant.ofEpochMilli(baseTime + 9 * 3600000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.AB_MINUS, "H5",
                Instant.ofEpochMilli(baseTime - 5 * 86400000L), Instant.ofEpochMilli(baseTime + 14 * 3600000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.PLATELETS, BloodGroup.A_PLUS, "H2",
                Instant.ofEpochMilli(baseTime - 5 * 86400000L), Instant.ofEpochMilli(baseTime + 18 * 3600000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.AB_PLUS, "H3",
                Instant.ofEpochMilli(baseTime - 5 * 86400000L), Instant.ofEpochMilli(baseTime + 21 * 3600000L), "AVAILABLE", 0L));

        // Expiring within 72 hours
        units.add(new Unit("U-" + (unitCounter++), Component.RED_CELLS, BloodGroup.AB_PLUS, "H1",
                Instant.ofEpochMilli(baseTime - 8 * 86400000L), Instant.ofEpochMilli(baseTime + 40 * 3600000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.PLASMA, BloodGroup.B_MINUS, "H3",
                Instant.ofEpochMilli(baseTime - 8 * 86400000L), Instant.ofEpochMilli(baseTime + 52 * 3600000L), "AVAILABLE", 0L));
        units.add(new Unit("U-" + (unitCounter++), Component.PLATELETS, BloodGroup.AB_PLUS, "H4",
                Instant.ofEpochMilli(baseTime - 8 * 86400000L), Instant.ofEpochMilli(baseTime + 64 * 3600000L), "AVAILABLE", 0L));

        // Remaining units up to 122 units total
        Component[] components = { Component.RED_CELLS, Component.PLATELETS, Component.PLASMA };
        Map<Component, Long> shelfLives = Map.of(
                Component.RED_CELLS, 42L * 86400000L,
                Component.PLATELETS, 5L * 86400000L,
                Component.PLASMA, 30L * 86400000L
        );

        while (units.size() < 122) {
            Component component = components[(int) Math.floor(rand.nextDouble() * components.length)];
            BloodGroup group = pickGroup(rand);
            if (component == Component.PLATELETS && (group == BloodGroup.O_MINUS || group == BloodGroup.O_PLUS)) {
                group = BloodGroup.A_PLUS;
            }
            if (component == Component.RED_CELLS) {
                group = BloodGroup.AB_PLUS;
            }
            String hospitalId = hospitalIds.get((int) Math.floor(rand.nextDouble() * hospitalIds.size()));
            long maxAge = shelfLives.get(component);
            double age = maxAge * (0.1 + rand.nextDouble() * 0.8);
            double collectedAtTime = baseTime - age;
            double expiresAtTime = collectedAtTime + maxAge;

            units.add(new Unit(
                    "U-" + (unitCounter++),
                    component,
                    group,
                    hospitalId,
                    Instant.ofEpochMilli((long) collectedAtTime),
                    Instant.ofEpochMilli((long) expiresAtTime),
                    "AVAILABLE",
                    0L
            ));
        }

        unitRepository.saveAll(units);

        // 4. Insert 6 Open Requests
        List<BloodRequest> requests = List.of(
                new BloodRequest(
                        "R-101",
                        "H3",
                        Component.PLATELETS,
                        BloodGroup.O_MINUS,
                        1,
                        Instant.ofEpochMilli(baseTime + 2 * 3600000L),
                        UrgencyLevel.CRITICAL,
                        "OPEN",
                        Instant.ofEpochMilli(baseTime - 25 * 60000L),
                        "Acute bleeding post-coronary intervention. Emergency platelet crossmatch required."
                ),
                new BloodRequest(
                        "R-102",
                        "H1",
                        Component.RED_CELLS,
                        BloodGroup.A_PLUS,
                        2,
                        Instant.ofEpochMilli(baseTime + 4 * 3600000L),
                        UrgencyLevel.URGENT,
                        "OPEN",
                        Instant.ofEpochMilli(baseTime - 45 * 60000L),
                        "Scheduled aortic aneurysm surgical repair requiring crossmatched packed red blood cells."
                ),
                new BloodRequest(
                        "R-103",
                        "H5",
                        Component.RED_CELLS,
                        BloodGroup.O_MINUS,
                        2,
                        Instant.ofEpochMilli(baseTime + 3 * 3600000L),
                        UrgencyLevel.CRITICAL,
                        "OPEN",
                        Instant.ofEpochMilli(baseTime - 15 * 60000L),
                        "Multi-vehicle collision trauma victim with massive internal bleed and shock."
                ),
                new BloodRequest(
                        "R-104",
                        "H3",
                        Component.PLASMA,
                        BloodGroup.AB_PLUS,
                        2,
                        Instant.ofEpochMilli(baseTime + 12 * 3600000L),
                        UrgencyLevel.ROUTINE,
                        "OPEN",
                        Instant.ofEpochMilli(baseTime - 90 * 60000L),
                        "Elective coronary artery bypass graft preparation; coagulopathy correction profile."
                ),
                new BloodRequest(
                        "R-105",
                        "H2",
                        Component.RED_CELLS,
                        BloodGroup.B_PLUS,
                        1,
                        Instant.ofEpochMilli(baseTime + 8 * 3600000L),
                        UrgencyLevel.ROUTINE,
                        "OPEN",
                        Instant.ofEpochMilli(baseTime - 60 * 60000L),
                        "Severe chronic anemia in oncology chemotherapy patient needing stabilization."
                ),
                new BloodRequest(
                        "R-106",
                        "H4",
                        Component.PLASMA,
                        BloodGroup.A_MINUS,
                        1,
                        Instant.ofEpochMilli(baseTime + 5 * 3600000L),
                        UrgencyLevel.URGENT,
                        "OPEN",
                        Instant.ofEpochMilli(baseTime - 30 * 60000L),
                        "Acute liver failure with prolonged INR requiring fresh frozen plasma transfusion."
                )
        );
        bloodRequestRepository.saveAll(requests);

        // 5. Insert SimState
        simStateRepository.save(new SimState("current", Instant.parse(INITIAL_SIM_TIME), false, 1.0));

        // 6. Insert Initial Genesis AuditLog
        Map<String, Object> diff = new LinkedHashMap<>();
        diff.put("hospitals", hospitals.size());
        diff.put("routes", routes.size());
        diff.put("units", units.size());
        diff.put("requests", requests.size());

        Map<String, Object> actorMap = new LinkedHashMap<>();
        actorMap.put("id", "SYSTEM");
        actorMap.put("role", "SYSTEM");

        Map<String, Object> genesisPayload = new LinkedHashMap<>();
        genesisPayload.put("seq", 1);
        genesisPayload.put("timestamp", INITIAL_SIM_TIME);
        genesisPayload.put("actor", actorMap);
        genesisPayload.put("action", "SYSTEM_GENESIS_SEED");
        genesisPayload.put("entity", "SYSTEM");
        genesisPayload.put("entityId", "GENESIS");
        genesisPayload.put("diff", diff);

        String genesisPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";
        String genesisHash = CanonicalJson.computeAuditHash(genesisPrevHash, genesisPayload);

        auditLogRepository.save(new AuditLog(
                1L,
                Instant.parse(INITIAL_SIM_TIME),
                new AuditLog.Actor("SYSTEM", "SYSTEM"),
                "SYSTEM_GENESIS_SEED",
                "SYSTEM",
                "GENESIS",
                diff,
                genesisPrevHash,
                genesisHash
        ));

        // Initialize sequence counter to 1
        sequenceService.setSequence("audit_log_seq", 1L);

        SeedCounts counts = new SeedCounts(
                hospitalRepository.count(),
                routeRepository.count(),
                unitRepository.count(),
                bloodRequestRepository.count(),
                simStateRepository.count(),
                auditLogRepository.count(),
                userRepository.count(),
                unitRepository.findById("U-10001").orElse(null),
                unitRepository.findById("U-10002").orElse(null),
                bloodRequestRepository.findById("R-101").orElse(null),
                genesisHash
        );

        log.info("Deterministic seed complete: {} hospitals, {} routes, {} units, {} requests, {} users, genesisHash={}",
                counts.hospitals(), counts.routes(), counts.units(), counts.requests(), counts.users(), genesisHash);

        return counts;
    }
}
