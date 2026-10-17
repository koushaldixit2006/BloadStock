package com.bloodstock;

import com.bloodstock.config.AppConfig;
import com.bloodstock.domain.*;
import com.bloodstock.domain.FeasibilityCandidate;
import com.bloodstock.service.RulesService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@Tag("contract")
public class FeasibilityContractTest {

    private RulesService rulesService;
    private RestTemplate restTemplate;
    private ObjectMapper objectMapper;
    private static final String OPTIMIZER_URL = "http://127.0.0.1:8000/v1/feasibility";
    private static final String INTERNAL_SECRET = "bloodstock-dev-secret-key-32chars-min";

    @BeforeEach
    void setUp() {
        AppConfig config = new AppConfig();
        config.setSharedRulesPath("../shared/rules.json");
        rulesService = new RulesService(config);
        rulesService.init();

        restTemplate = new RestTemplate();
        objectMapper = new ObjectMapper();
    }

    private JsonNode callPythonFeasibility(Unit unit, BloodRequest request, List<Route> routes, Instant now) throws Exception {
        Map<String, Object> unitMap = new LinkedHashMap<>();
        unitMap.put("id", unit.getId());
        unitMap.put("component", unit.getComponent().name());
        unitMap.put("group", unit.getGroup().getCode());
        unitMap.put("hospitalId", unit.getHospitalId());
        unitMap.put("collectedAt", unit.getCollectedAt().toString());
        unitMap.put("expiresAt", unit.getExpiresAt().toString());
        unitMap.put("status", unit.getStatus());
        unitMap.put("reservedForRequestId", unit.getReservedForRequestId());

        Map<String, Object> reqMap = new LinkedHashMap<>();
        reqMap.put("id", request.getId());
        reqMap.put("hospitalId", request.getHospitalId());
        reqMap.put("component", request.getComponent().name());
        reqMap.put("group", request.getGroup().getCode());
        reqMap.put("unitsNeeded", request.getUnitsNeeded());
        reqMap.put("neededBy", request.getNeededBy().toString());
        reqMap.put("urgency", request.getUrgency().name());

        List<Map<String, Object>> routeMaps = new ArrayList<>();
        for (Route r : routes) {
            Map<String, Object> rm = new LinkedHashMap<>();
            rm.put("fromId", r.getFromId());
            rm.put("toId", r.getToId());
            rm.put("baseMinutes", r.getBaseMinutes());
            rm.put("status", r.getStatus());
            rm.put("delayMinutes", r.getDelayMinutes());
            routeMaps.add(rm);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("units", List.of(unitMap));
        payload.put("request", reqMap);
        payload.put("routes", routeMaps);
        payload.put("now", now.toString());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Internal-Secret", INTERNAL_SECRET);

        HttpEntity<Map<String, Object>> httpEntity = new HttpEntity<>(payload, headers);
        ResponseEntity<String> response = restTemplate.exchange(OPTIMIZER_URL, HttpMethod.POST, httpEntity, String.class);
        assertEquals(HttpStatus.OK, response.getStatusCode());

        JsonNode root = objectMapper.readTree(response.getBody());
        assertTrue(root.isArray());
        assertEquals(1, root.size());
        return root.get(0);
    }

    private void assertJavaMatchesPython(FeasibilityCandidate javaResult, JsonNode pythonNode) {
        boolean pyFeasible = pythonNode.get("feasible").asBoolean();
        int pyTransitMinutes = pythonNode.get("transitMinutes").asInt();
        int pyExpiryMargin = pythonNode.get("expiryMarginMinutes").asInt();
        String pyFromHosp = pythonNode.get("fromHospitalId").asText();
        String pyToHosp = pythonNode.get("toHospitalId").asText();

        List<String> pyReasons = new ArrayList<>();
        if (pythonNode.has("blockingReasons")) {
            pythonNode.get("blockingReasons").forEach(r -> pyReasons.add(r.asText()));
        }

        assertEquals(pyFeasible, javaResult.feasible(), "Feasible flag mismatch");
        assertEquals(pyTransitMinutes, javaResult.transitMinutes(), "Transit minutes mismatch");
        assertEquals(pyExpiryMargin, javaResult.expiryMarginMinutes(), "Expiry margin minutes mismatch");
        assertEquals(pyFromHosp, javaResult.fromHospitalId(), "From hospital mismatch");
        assertEquals(pyToHosp, javaResult.toHospitalId(), "To hospital mismatch");
        assertEquals(pyReasons, javaResult.blockingReasons(), "Blocking reasons mismatch");
    }

    @Test
    @DisplayName("Contract: Hero unit U-10001 (infeasible expiration) matches Python optimizer")
    void testHeroUnit1Contract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H1", "H3", 20, "UP", 0));

        Unit unit = new Unit(
                "U-10001", Component.PLATELETS, BloodGroup.O_MINUS, "H1",
                now.minusSeconds(4 * 86400 + (long) (23.5 * 3600)),
                now.plusSeconds(30 * 60),
                "AVAILABLE", 0L
        );
        BloodRequest req = new BloodRequest(
                "R-101", "H3", Component.PLATELETS, BloodGroup.O_MINUS, 1,
                now.plusSeconds(2 * 3600), UrgencyLevel.CRITICAL, "OPEN",
                now.minusSeconds(25 * 60), "Critical emergency"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }

    @Test
    @DisplayName("Contract: Hero unit U-10002 (feasible transfer) matches Python optimizer")
    void testHeroUnit2Contract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H5", "H3", 45, "UP", 0));

        Unit unit = new Unit(
                "U-10002", Component.PLATELETS, BloodGroup.O_MINUS, "H5",
                now.minusSeconds(3 * 86400),
                now.plusSeconds(28 * 3600),
                "AVAILABLE", 0L
        );
        BloodRequest req = new BloodRequest(
                "R-101", "H3", Component.PLATELETS, BloodGroup.O_MINUS, 1,
                now.plusSeconds(2 * 3600), UrgencyLevel.CRITICAL, "OPEN",
                now.minusSeconds(25 * 60), "Critical emergency"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }

    @Test
    @DisplayName("Contract: Intra-hospital self transfer (H1 -> H1) matches Python optimizer")
    void testSelfTransferContract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H1", "H1", 5, "UP", 0));

        Unit unit = new Unit(
                "U-10005", Component.RED_CELLS, BloodGroup.O_PLUS, "H1",
                now.minusSeconds(10 * 86400),
                now.plusSeconds(30 * 86400),
                "AVAILABLE", 0L
        );
        BloodRequest req = new BloodRequest(
                "R-102", "H1", Component.RED_CELLS, BloodGroup.A_PLUS, 2,
                now.plusSeconds(4 * 3600), UrgencyLevel.URGENT, "OPEN",
                now.minusSeconds(45 * 60), "Scheduled repair"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }

    @Test
    @DisplayName("Contract: Incompatible component matches Python optimizer")
    void testIncompatibleComponentContract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H1", "H3", 20, "UP", 0));

        Unit unit = new Unit(
                "U-10003", Component.RED_CELLS, BloodGroup.O_MINUS, "H1",
                now.minusSeconds(12 * 86400),
                now.plusSeconds(30 * 86400),
                "AVAILABLE", 0L
        );
        BloodRequest req = new BloodRequest(
                "R-101", "H3", Component.PLATELETS, BloodGroup.O_MINUS, 1,
                now.plusSeconds(2 * 3600), UrgencyLevel.CRITICAL, "OPEN",
                now.minusSeconds(25 * 60), "Platelet need"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }

    @Test
    @DisplayName("Contract: Incompatible blood group matches Python optimizer")
    void testIncompatibleBloodGroupContract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H1", "H2", 25, "UP", 0));

        Unit unit = new Unit(
                "U-10006", Component.RED_CELLS, BloodGroup.A_PLUS, "H1",
                now.minusSeconds(10 * 86400),
                now.plusSeconds(30 * 86400),
                "AVAILABLE", 0L
        );
        BloodRequest req = new BloodRequest(
                "R-105", "H2", Component.RED_CELLS, BloodGroup.B_PLUS, 1,
                now.plusSeconds(8 * 3600), UrgencyLevel.ROUTINE, "OPEN",
                now.minusSeconds(60 * 60), "Anemia support"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }

    @Test
    @DisplayName("Contract: Route DOWN matches Python optimizer")
    void testRouteDownContract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H1", "H2", 25, "DOWN", 0));

        Unit unit = new Unit(
                "U-10005", Component.RED_CELLS, BloodGroup.O_PLUS, "H1",
                now.minusSeconds(10 * 86400),
                now.plusSeconds(30 * 86400),
                "AVAILABLE", 0L
        );
        BloodRequest req = new BloodRequest(
                "R-105", "H2", Component.RED_CELLS, BloodGroup.B_PLUS, 1,
                now.plusSeconds(8 * 3600), UrgencyLevel.ROUTINE, "OPEN",
                now.minusSeconds(60 * 60), "Anemia support"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }

    @Test
    @DisplayName("Contract: Arrives after neededBy deadline matches Python optimizer")
    void testLateArrivalContract() throws Exception {
        Instant now = Instant.parse("2026-10-15T08:00:00Z");
        List<Route> routes = List.of(new Route("H5", "H3", 45, "UP", 0));

        Unit unit = new Unit(
                "U-10002", Component.PLATELETS, BloodGroup.O_MINUS, "H5",
                now.minusSeconds(3 * 86400),
                now.plusSeconds(28 * 3600),
                "AVAILABLE", 0L
        );
        // Arrives in 15+45 = 60 min (09:00), but neededBy is in 40 min (08:40)
        BloodRequest req = new BloodRequest(
                "R-101", "H3", Component.PLATELETS, BloodGroup.O_MINUS, 1,
                now.plusSeconds(40 * 60), UrgencyLevel.CRITICAL, "OPEN",
                now.minusSeconds(25 * 60), "Needed very urgently"
        );

        FeasibilityCandidate javaResult = rulesService.evaluateCandidate(unit, req, routes, now);
        JsonNode pythonResult = callPythonFeasibility(unit, req, routes, now);
        assertJavaMatchesPython(javaResult, pythonResult);
    }
}
