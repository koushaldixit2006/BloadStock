package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Document(collection = "plans")
public class Plan {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String planId;

    private List<String> requestIds;
    private String mode;
    private String source;
    private List<Map<String, Object>> assignments;
    private Map<String, Object> metrics;
    private Instant createdAt = Instant.now();

    @Indexed
    private Instant expiresAt;

    public Plan() {}

    public Plan(String planId, List<String> requestIds, String mode, String source,
                List<Map<String, Object>> assignments, Map<String, Object> metrics,
                Instant createdAt, Instant expiresAt) {
        this.planId = planId;
        this.requestIds = requestIds;
        this.mode = mode;
        this.source = source;
        this.assignments = assignments;
        this.metrics = metrics;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getPlanId() { return planId; }
    public void setPlanId(String planId) { this.planId = planId; }

    public List<String> getRequestIds() { return requestIds; }
    public void setRequestIds(List<String> requestIds) { this.requestIds = requestIds; }

    public String getMode() { return mode; }
    public void setMode(String mode) { this.mode = mode; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }

    public List<Map<String, Object>> getAssignments() { return assignments; }
    public void setAssignments(List<Map<String, Object>> assignments) { this.assignments = assignments; }

    public Map<String, Object> getMetrics() { return metrics; }
    public void setMetrics(Map<String, Object> metrics) { this.metrics = metrics; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
