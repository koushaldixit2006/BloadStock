package com.bloodstock;

import com.bloodstock.util.CanonicalJson;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

public class AuditHashTest {

    @Test
    @DisplayName("Genesis audit payload hash matches Node.js implementation exactly")
    void testGenesisHashParity() {
        Map<String, Object> diff = new LinkedHashMap<>();
        diff.put("hospitals", 5);
        diff.put("routes", 25);
        diff.put("units", 122);
        diff.put("requests", 6);

        Map<String, Object> actorMap = new LinkedHashMap<>();
        actorMap.put("id", "SYSTEM");
        actorMap.put("role", "SYSTEM");

        Map<String, Object> genesisPayload = new LinkedHashMap<>();
        genesisPayload.put("seq", 1);
        genesisPayload.put("timestamp", "2026-10-15T08:00:00.000Z");
        genesisPayload.put("actor", actorMap);
        genesisPayload.put("action", "SYSTEM_GENESIS_SEED");
        genesisPayload.put("entity", "SYSTEM");
        genesisPayload.put("entityId", "GENESIS");
        genesisPayload.put("diff", diff);

        String genesisPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";

        String canonical = CanonicalJson.canonicalize(genesisPayload);
        String expectedCanonical = "{\"action\":\"SYSTEM_GENESIS_SEED\",\"actor\":{\"id\":\"SYSTEM\",\"role\":\"SYSTEM\"},\"diff\":{\"hospitals\":5,\"requests\":6,\"routes\":25,\"units\":122},\"entity\":\"SYSTEM\",\"entityId\":\"GENESIS\",\"seq\":1,\"timestamp\":\"2026-10-15T08:00:00.000Z\"}";
        assertEquals(expectedCanonical, canonical);

        String hash = CanonicalJson.computeAuditHash(genesisPrevHash, genesisPayload);
        String expectedHash = "2735f5727aa67193d4fa2c321dd2907652fdc7c33929a2d1b09e4e99c1a6cb68";
        assertEquals(expectedHash, hash);
    }
}
