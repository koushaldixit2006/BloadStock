package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.Instant;

@Document(collection = "units")
@CompoundIndexes({
    @CompoundIndex(name = "unit_status_comp_group_idx", def = "{'status': 1, 'component': 1, 'group': 1}"),
    @CompoundIndex(name = "unit_hosp_status_idx", def = "{'hospitalId': 1, 'status': 1}")
})
public class Unit {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String id;

    private Component component;

    @Field("group")
    private BloodGroup group;

    @Indexed
    private String hospitalId;

    private Instant collectedAt;

    @Indexed
    private Instant expiresAt;

    @Indexed
    private String status = "AVAILABLE";

    private long version = 0L;

    private String reservedForRequestId;

    public Unit() {}

    public Unit(String id, Component component, BloodGroup group, String hospitalId,
                Instant collectedAt, Instant expiresAt, String status, long version) {
        this.id = id;
        this.component = component;
        this.group = group;
        this.hospitalId = hospitalId;
        this.collectedAt = collectedAt;
        this.expiresAt = expiresAt;
        this.status = status;
        this.version = version;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Component getComponent() { return component; }
    public void setComponent(Component component) { this.component = component; }

    public BloodGroup getGroup() { return group; }
    public void setGroup(BloodGroup group) { this.group = group; }

    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }

    public Instant getCollectedAt() { return collectedAt; }
    public void setCollectedAt(Instant collectedAt) { this.collectedAt = collectedAt; }

    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }

    public String getReservedForRequestId() { return reservedForRequestId; }
    public void setReservedForRequestId(String reservedForRequestId) { this.reservedForRequestId = reservedForRequestId; }
}
