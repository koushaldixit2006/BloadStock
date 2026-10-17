package com.bloodstock.web;

import org.bson.Document;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

@RestController
public class HealthController {

    private final MongoTemplate mongoTemplate;

    public HealthController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> healthCheck() {
        boolean isConnected = false;
        try {
            Document pingResult = mongoTemplate.getDb().runCommand(new Document("ping", 1));
            isConnected = pingResult.getDouble("ok") != null && pingResult.getDouble("ok") == 1.0;
        } catch (Exception e) {
            isConnected = false;
        }

        Map<String, Object> response = new HashMap<>();
        response.put("status", isConnected ? "healthy" : "degraded");
        response.put("service", "api-spring");

        Map<String, Object> mongoInfo = new HashMap<>();
        mongoInfo.put("readyState", isConnected ? 1 : 0);
        mongoInfo.put("status", isConnected ? "connected" : "disconnected");
        response.put("mongo", mongoInfo);
        response.put("timestamp", Instant.now().toString());

        return ResponseEntity.status(isConnected ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(response);
    }

    @GetMapping("/")
    public Map<String, Object> rootWelcome() {
        Map<String, Object> response = new HashMap<>();
        response.put("name", "BloodStock Planning API (Spring Boot)");
        response.put("version", "1.0.0");
        response.put("disclaimer", "Planning support only - not a clinical decision. Synthetic data.");
        return response;
    }
}
