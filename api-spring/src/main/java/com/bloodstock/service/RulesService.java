package com.bloodstock.service;

import com.bloodstock.config.AppConfig;
import com.bloodstock.domain.BloodGroup;
import com.bloodstock.domain.BloodRequest;
import com.bloodstock.domain.Component;
import com.bloodstock.domain.FeasibilityCandidate;
import com.bloodstock.domain.Route;
import com.bloodstock.domain.Unit;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class RulesService {

    private static final Logger log = LoggerFactory.getLogger(RulesService.class);

    public static final Map<String, String> HOSPITAL_NAMES = Map.of(
            "H1", "Pink City General",
            "H2", "Aravali Medical Centre",
            "H3", "Amber Heart Institute",
            "H4", "Sawai Care Hospital",
            "H5", "Rampura Trauma Centre"
    );

    private final AppConfig appConfig;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private int safetyMarginMinutes = 30;
    private int dispatchBufferMinutes = 15;
    private final Map<Component, Integer> shelfLifeDays = new EnumMap<>(Component.class);
    private final Map<Component, Map<String, Set<String>>> compatibilityMap = new EnumMap<>(Component.class);

    public RulesService(AppConfig appConfig) {
        this.appConfig = appConfig;
    }

    @PostConstruct
    public void init() {
        loadRules();
    }

    public synchronized void loadRules() {
        String configuredPath = appConfig.getSharedRulesPath();
        File file = resolveRulesFile(configuredPath);
        if (file == null || !file.exists()) {
            throw new IllegalStateException("Shared rules file not found at " + configuredPath);
        }

        try {
            JsonNode root = objectMapper.readTree(file);

            // 1. Parameters
            JsonNode paramsNode = root.get("parameters");
            if (paramsNode != null) {
                if (paramsNode.has("safetyMarginMinutes")) {
                    this.safetyMarginMinutes = paramsNode.get("safetyMarginMinutes").asInt(30);
                }
                if (paramsNode.has("dispatchBufferMinutes")) {
                    this.dispatchBufferMinutes = paramsNode.get("dispatchBufferMinutes").asInt(15);
                }
            }

            // 2. Shelf Life Days
            JsonNode shelfLifeNode = root.get("shelfLifeDays");
            if (shelfLifeNode != null) {
                for (Component comp : Component.values()) {
                    if (shelfLifeNode.has(comp.name())) {
                        shelfLifeDays.put(comp, shelfLifeNode.get(comp.name()).asInt(30));
                    }
                }
            }

            // 3. Compatibility Matrix
            JsonNode compatNode = root.get("compatibility");
            if (compatNode != null) {
                for (Component comp : Component.values()) {
                    JsonNode compRules = compatNode.get(comp.name());
                    if (compRules != null) {
                        Map<String, Set<String>> recipientToDonors = new HashMap<>();
                        Iterator<Map.Entry<String, JsonNode>> fields = compRules.fields();
                        while (fields.hasNext()) {
                            Map.Entry<String, JsonNode> entry = fields.next();
                            String recipientCode = entry.getKey();
                            Set<String> acceptableDonors = new HashSet<>();
                            for (JsonNode donorNode : entry.getValue()) {
                                acceptableDonors.add(donorNode.asText());
                            }
                            recipientToDonors.put(recipientCode, acceptableDonors);
                        }
                        compatibilityMap.put(comp, recipientToDonors);
                    }
                }
            }

            log.info("Loaded rules from {}: safetyMargin={}m, dispatchBuffer={}m",
                    file.getAbsolutePath(), safetyMarginMinutes, dispatchBufferMinutes);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to parse rules from " + file.getAbsolutePath(), e);
        }
    }

    private File resolveRulesFile(String configuredPath) {
        if (configuredPath != null && !configuredPath.isBlank()) {
            File direct = new File(configuredPath);
            if (direct.exists()) return direct;

            Path fromWorkingDir = Paths.get(System.getProperty("user.dir")).resolve(configuredPath).normalize();
            if (fromWorkingDir.toFile().exists()) return fromWorkingDir.toFile();
        }

        List<Path> candidates = List.of(
                Paths.get("shared", "rules.json"),
                Paths.get("..", "shared", "rules.json"),
                Paths.get("../..", "shared", "rules.json"),
                Paths.get(System.getProperty("user.dir"), "shared", "rules.json"),
                Paths.get(System.getProperty("user.dir"), "..", "shared", "rules.json")
        );

        for (Path candidate : candidates) {
            File f = candidate.toFile();
            if (f.exists()) return f;
        }

        return null;
    }

    public boolean isCompatible(Component component, BloodGroup donorGroup, BloodGroup recipientGroup) {
        if (component == null || donorGroup == null || recipientGroup == null) {
            return false;
        }
        Map<String, Set<String>> compMap = compatibilityMap.get(component);
        if (compMap == null) {
            return false;
        }
        Set<String> acceptableDonors = compMap.get(recipientGroup.getCode());
        return acceptableDonors != null && acceptableDonors.contains(donorGroup.getCode());
    }

    public int getSafetyMarginMinutes() {
        return safetyMarginMinutes;
    }

    public int getDispatchBufferMinutes() {
        return dispatchBufferMinutes;
    }

    public int getShelfLifeDays(Component component) {
        return shelfLifeDays.getOrDefault(component, 30);
    }

    public RouteDetails getRouteDetails(List<Route> routes, String fromId, String toId) {
        if (Objects.equals(fromId, toId)) {
            return new RouteDetails(0, 5, true, null);
        }

        int dispatchBuffer = getDispatchBufferMinutes();
        Route matching = null;
        if (routes != null) {
            for (Route r : routes) {
                if (Objects.equals(fromId, r.getFromId()) && Objects.equals(toId, r.getToId())) {
                    matching = r;
                    break;
                }
            }
        }

        if (matching == null) {
            String fromName = HOSPITAL_NAMES.getOrDefault(fromId, fromId);
            String toName = HOSPITAL_NAMES.getOrDefault(toId, toId);
            return new RouteDetails(dispatchBuffer, 9999, false, "Route " + fromName + " to " + toName + " not found");
        }

        if ("DOWN".equalsIgnoreCase(matching.getStatus())) {
            String fromName = HOSPITAL_NAMES.getOrDefault(fromId, fromId);
            String toName = HOSPITAL_NAMES.getOrDefault(toId, toId);
            return new RouteDetails(dispatchBuffer, 9999, false, "Route " + fromName + " to " + toName + " is down");
        }

        int transit = matching.getBaseMinutes() + matching.getDelayMinutes();
        return new RouteDetails(dispatchBuffer, transit, true, null);
    }

    /**
     * Strict 6-step feasibility evaluation matching optimizer/app/feasibility.py:
     * 1. Status AVAILABLE
     * 2. ABO/Rh Compatibility from rules.json
     * 3. Route UP
     * 4. ETA Calculation
     * 5. Expiration vs arrival + safety margin
     * 6. Arrival vs neededBy deadline
     */
    public FeasibilityCandidate evaluateCandidate(Unit unit, BloodRequest request, List<Route> routes, Instant now) {
        List<String> blockingReasons = new ArrayList<>();
        int safetyMargin = getSafetyMarginMinutes();

        // 1. Status check
        if (!"AVAILABLE".equals(unit.getStatus())) {
            if (unit.getReservedForRequestId() != null && !unit.getReservedForRequestId().isBlank()) {
                blockingReasons.add("Already reserved for " + unit.getReservedForRequestId());
            } else {
                blockingReasons.add("Unit status is " + unit.getStatus());
            }
        }

        // 2. Compatibility check
        if (unit.getComponent() != request.getComponent()) {
            blockingReasons.add("Incompatible component: unit is " + unit.getComponent() + ", request is for " + request.getComponent());
        } else if (!isCompatible(request.getComponent(), unit.getGroup(), request.getGroup())) {
            blockingReasons.add("Incompatible group: " + unit.getGroup().getCode() + " cannot serve " + request.getGroup().getCode());
        }

        // 3. Route check & ETA calculation
        RouteDetails routeDetails = getRouteDetails(routes, unit.getHospitalId(), request.getHospitalId());
        if (!routeDetails.routeUp() && routeDetails.errorReason() != null) {
            blockingReasons.add(routeDetails.errorReason());
        }

        int totalTransitMinutes = routeDetails.dispatchBuffer() + (routeDetails.transitMinutes() < 9000 ? routeDetails.transitMinutes() : 60);
        Instant eta = now.plus(Duration.ofMinutes(totalTransitMinutes));

        // 4. Expiry margin calculation
        long diffSeconds = ChronoUnit.SECONDS.between(eta, unit.getExpiresAt());
        int expiryMarginMinutes = (int) (diffSeconds / 60);

        // 5. Expiry safety margin check
        if (!eta.isBefore(unit.getExpiresAt())) {
            long overstayMin = ChronoUnit.SECONDS.between(unit.getExpiresAt(), eta) / 60;
            blockingReasons.add("Expires " + overstayMin + " min before arrival");
        } else if (expiryMarginMinutes < safetyMargin) {
            blockingReasons.add("Insufficient safety margin: arrives " + expiryMarginMinutes + " min before expiry, requires at least " + safetyMargin + " min");
        }

        // 6. Needed-by deadline check
        if (eta.isAfter(request.getNeededBy())) {
            long latenessMin = ChronoUnit.SECONDS.between(request.getNeededBy(), eta) / 60;
            blockingReasons.add("Arrives " + latenessMin + " min after needed-by");
        }

        boolean feasible = blockingReasons.isEmpty();

        return new FeasibilityCandidate(
                unit.getId(),
                feasible,
                blockingReasons,
                eta,
                expiryMarginMinutes,
                totalTransitMinutes,
                unit.getHospitalId(),
                request.getHospitalId()
        );
    }

    public List<FeasibilityCandidate> evaluateAllCandidates(List<Unit> units, BloodRequest request, List<Route> routes, Instant now) {
        if (units == null) return List.of();
        List<FeasibilityCandidate> result = new ArrayList<>(units.size());
        for (Unit unit : units) {
            result.add(evaluateCandidate(unit, request, routes, now));
        }
        return result;
    }
}
