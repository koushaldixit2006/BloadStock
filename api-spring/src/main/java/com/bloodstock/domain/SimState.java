package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "sim_state")
public class SimState {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String key = "current";

    private Instant virtualNow;
    private boolean isPaused = false;
    private double speedMultiplier = 1.0;
    private String activeScenario;

    public SimState() {}

    public SimState(String key, Instant virtualNow, boolean isPaused, double speedMultiplier) {
        this(key, virtualNow, isPaused, speedMultiplier, null);
    }

    public SimState(String key, Instant virtualNow, boolean isPaused, double speedMultiplier, String activeScenario) {
        this.key = key;
        this.virtualNow = virtualNow;
        this.isPaused = isPaused;
        this.speedMultiplier = speedMultiplier;
        this.activeScenario = activeScenario;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public Instant getVirtualNow() { return virtualNow; }
    public void setVirtualNow(Instant virtualNow) { this.virtualNow = virtualNow; }

    public boolean isPaused() { return isPaused; }
    public void setPaused(boolean paused) { isPaused = paused; }

    public double getSpeedMultiplier() { return speedMultiplier; }
    public void setSpeedMultiplier(double speedMultiplier) { this.speedMultiplier = speedMultiplier; }

    public String getActiveScenario() { return activeScenario; }
    public void setActiveScenario(String activeScenario) { this.activeScenario = activeScenario; }
}
