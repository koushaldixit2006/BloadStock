package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "routes")
@CompoundIndex(name = "route_from_to_idx", def = "{'fromId': 1, 'toId': 1}")
public class Route {

    @Id
    private String mongoId;

    private String fromId;
    private String toId;
    private int baseMinutes;
    private String status = "UP";
    private int delayMinutes = 0;

    public Route() {}

    public Route(String fromId, String toId, int baseMinutes, String status, int delayMinutes) {
        this.fromId = fromId;
        this.toId = toId;
        this.baseMinutes = baseMinutes;
        this.status = status;
        this.delayMinutes = delayMinutes;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getFromId() { return fromId; }
    public void setFromId(String fromId) { this.fromId = fromId; }

    public String getToId() { return toId; }
    public void setToId(String toId) { this.toId = toId; }

    public int getBaseMinutes() { return baseMinutes; }
    public void setBaseMinutes(int baseMinutes) { this.baseMinutes = baseMinutes; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getDelayMinutes() { return delayMinutes; }
    public void setDelayMinutes(int delayMinutes) { this.delayMinutes = delayMinutes; }
}
