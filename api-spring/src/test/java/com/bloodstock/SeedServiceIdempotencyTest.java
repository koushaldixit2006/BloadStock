package com.bloodstock;

import com.bloodstock.domain.Unit;
import com.bloodstock.repository.UnitRepository;
import com.bloodstock.service.SeedCounts;
import com.bloodstock.service.SeedService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
@ActiveProfiles("test")
public class SeedServiceIdempotencyTest {

    @Autowired
    private SeedService seedService;

    @Autowired
    private UnitRepository unitRepository;

    @Test
    @DisplayName("Running seed twice produces identical counts, unit IDs, expiry times, and genesis hash")
    void testSeedIdempotency() {
        // Run 1
        SeedCounts run1 = seedService.runSeed();
        assertEquals(5, run1.hospitals());
        assertEquals(25, run1.routes());
        assertEquals(122, run1.units());
        assertEquals(6, run1.requests());
        assertEquals(3, run1.users());
        assertEquals(1, run1.auditLogs());
        assertEquals(1, run1.simState());

        List<Unit> unitsRun1 = unitRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
        Map<String, Instant> expiryMap1 = unitsRun1.stream()
                .collect(Collectors.toMap(Unit::getId, Unit::getExpiresAt));

        // Run 2
        SeedCounts run2 = seedService.runSeed();
        assertEquals(run1.hospitals(), run2.hospitals());
        assertEquals(run1.routes(), run2.routes());
        assertEquals(run1.units(), run2.units());
        assertEquals(run1.requests(), run2.requests());
        assertEquals(run1.users(), run2.users());
        assertEquals(run1.auditLogs(), run2.auditLogs());
        assertEquals(run1.simState(), run2.simState());
        assertEquals(run1.genesisHash(), run2.genesisHash());

        List<Unit> unitsRun2 = unitRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
        Map<String, Instant> expiryMap2 = unitsRun2.stream()
                .collect(Collectors.toMap(Unit::getId, Unit::getExpiresAt));

        assertEquals(122, unitsRun2.size());
        for (Unit u : unitsRun2) {
            Instant exp1 = expiryMap1.get(u.getId());
            Instant exp2 = expiryMap2.get(u.getId());
            assertNotNull(exp1, "Unit " + u.getId() + " must exist in run 1");
            assertEquals(exp1, exp2, "Expiry mismatch for unit " + u.getId());
        }

        // Verify Hero units exist with expected properties
        assertNotNull(run2.heroUnitNearest());
        assertEquals("U-10001", run2.heroUnitNearest().getId());
        assertEquals("H1", run2.heroUnitNearest().getHospitalId());

        assertNotNull(run2.heroUnitFarther());
        assertEquals("U-10002", run2.heroUnitFarther().getId());
        assertEquals("H5", run2.heroUnitFarther().getHospitalId());

        assertNotNull(run2.criticalRequest());
        assertEquals("R-101", run2.criticalRequest().getId());
        assertEquals("H3", run2.criticalRequest().getHospitalId());
    }
}
