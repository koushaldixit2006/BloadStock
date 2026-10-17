package com.bloodstock;

import com.bloodstock.config.AppConfig;
import com.bloodstock.domain.*;
import com.bloodstock.domain.FeasibilityCandidate;
import com.bloodstock.service.RouteDetails;
import com.bloodstock.service.RulesService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

public class RulesServiceTest {

    private RulesService rulesService;

    @BeforeEach
    void setUp() {
        AppConfig config = new AppConfig();
        config.setSharedRulesPath("../shared/rules.json");
        rulesService = new RulesService(config);
        rulesService.init();
    }

    @Test
    @DisplayName("RulesService loads parameters and shelf life from rules.json")
    void testParametersAndShelfLife() {
        assertEquals(30, rulesService.getSafetyMarginMinutes());
        assertEquals(15, rulesService.getDispatchBufferMinutes());
        assertEquals(42, rulesService.getShelfLifeDays(Component.RED_CELLS));
        assertEquals(5, rulesService.getShelfLifeDays(Component.PLATELETS));
        assertEquals(30, rulesService.getShelfLifeDays(Component.PLASMA));
    }

    @Test
    @DisplayName("ABO/Rh compatibility matches clinical rules in rules.json")
    void testCompatibilityMatrix() {
        // RED_CELLS: O- universal donor
        assertTrue(rulesService.isCompatible(Component.RED_CELLS, BloodGroup.O_MINUS, BloodGroup.AB_PLUS));
        assertTrue(rulesService.isCompatible(Component.RED_CELLS, BloodGroup.O_MINUS, BloodGroup.O_MINUS));
        assertFalse(rulesService.isCompatible(Component.RED_CELLS, BloodGroup.O_PLUS, BloodGroup.O_MINUS));
        assertFalse(rulesService.isCompatible(Component.RED_CELLS, BloodGroup.A_PLUS, BloodGroup.B_PLUS));

        // PLATELETS: O+ can give to O-
        assertTrue(rulesService.isCompatible(Component.PLATELETS, BloodGroup.O_PLUS, BloodGroup.O_MINUS));
        assertTrue(rulesService.isCompatible(Component.PLATELETS, BloodGroup.A_MINUS, BloodGroup.A_PLUS));
        assertFalse(rulesService.isCompatible(Component.PLATELETS, BloodGroup.A_PLUS, BloodGroup.O_MINUS));

        // PLASMA: AB+ universal donor
        assertTrue(rulesService.isCompatible(Component.PLASMA, BloodGroup.AB_PLUS, BloodGroup.O_MINUS));
        assertTrue(rulesService.isCompatible(Component.PLASMA, BloodGroup.AB_MINUS, BloodGroup.O_MINUS));
        assertFalse(rulesService.isCompatible(Component.PLASMA, BloodGroup.O_MINUS, BloodGroup.AB_PLUS));
    }

    @Test
    @DisplayName("Route details handles self-hospital, normal routes, DOWN routes, and missing routes")
    void testRouteDetails() {
        List<Route> routes = List.of(
                new Route("H1", "H3", 20, "UP", 5),
                new Route("H1", "H4", 30, "DOWN", 0)
        );

        // Self route
        RouteDetails self = rulesService.getRouteDetails(routes, "H1", "H1");
        assertEquals(0, self.dispatchBuffer());
        assertEquals(5, self.transitMinutes());
        assertTrue(self.routeUp());
        assertNull(self.errorReason());

        // Normal route: 15m buffer + (20+5)m = 25m transit
        RouteDetails normal = rulesService.getRouteDetails(routes, "H1", "H3");
        assertEquals(15, normal.dispatchBuffer());
        assertEquals(25, normal.transitMinutes());
        assertTrue(normal.routeUp());
        assertNull(normal.errorReason());

        // DOWN route
        RouteDetails down = rulesService.getRouteDetails(routes, "H1", "H4");
        assertFalse(down.routeUp());
        assertEquals("Route Pink City General to Sawai Care Hospital is down", down.errorReason());

        // Missing route
        RouteDetails missing = rulesService.getRouteDetails(routes, "H1", "H5");
        assertFalse(missing.routeUp());
        assertEquals("Route Pink City General to Rampura Trauma Centre not found", missing.errorReason());
    }

    @Test
    @DisplayName("Hero unit U-10001 (Pink City General -> Amber Heart) is infeasible due to expiration")
    void testHeroUnit1Infeasible() {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H1", "H3", 20, "UP", 0));

        Unit unit1 = new Unit(
                "U-10001",
                Component.PLATELETS,
                BloodGroup.O_MINUS,
                "H1",
                now.minusSeconds(4 * 86400 + (long) (23.5 * 3600)),
                now.plusSeconds(30 * 60), // expires in 30 mins
                "AVAILABLE",
                0L
        );

        BloodRequest req1 = new BloodRequest(
                "R-101",
                "H3",
                Component.PLATELETS,
                BloodGroup.O_MINUS,
                1,
                now.plusSeconds(2 * 3600), // needed in 2 hours
                UrgencyLevel.CRITICAL,
                "OPEN",
                now.minusSeconds(25 * 60),
                "Critical edge case"
        );

        FeasibilityCandidate cand = rulesService.evaluateCandidate(unit1, req1, routes, now);
        assertFalse(cand.feasible());
        // 15 buffer + 20 transit = 35 min arrival (08:35). Expires at 08:30 (5 min before arrival).
        assertEquals(35, cand.transitMinutes());
        assertEquals(-5, cand.expiryMarginMinutes());
        assertTrue(cand.blockingReasons().contains("Expires 5 min before arrival"));
    }

    @Test
    @DisplayName("Hero unit U-10002 (Rampura Trauma Centre -> Amber Heart) is feasible")
    void testHeroUnit2Feasible() {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H5", "H3", 45, "UP", 0));

        Unit unit2 = new Unit(
                "U-10002",
                Component.PLATELETS,
                BloodGroup.O_MINUS,
                "H5",
                now.minusSeconds(3 * 86400),
                now.plusSeconds(28 * 3600), // expires in 28 hours
                "AVAILABLE",
                0L
        );

        BloodRequest req1 = new BloodRequest(
                "R-101",
                "H3",
                Component.PLATELETS,
                BloodGroup.O_MINUS,
                1,
                now.plusSeconds(2 * 3600),
                UrgencyLevel.CRITICAL,
                "OPEN",
                now.minusSeconds(25 * 60),
                "Critical edge case"
        );

        FeasibilityCandidate cand = rulesService.evaluateCandidate(unit2, req1, routes, now);
        assertTrue(cand.feasible());
        assertEquals(0, cand.blockingReasons().size());
        assertEquals(60, cand.transitMinutes()); // 15 + 45 = 60 min
    }
}
