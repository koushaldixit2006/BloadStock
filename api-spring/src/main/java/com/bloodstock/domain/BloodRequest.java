package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.mapping.Field;

import java.time.Instant;

@Document(collection = "blood_requests")
public class BloodRequest {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String id;

    @Indexed
    private String hospitalId;

    private Component component;

    @Field("group")
    private BloodGroup group;

    private int unitsNeeded = 1;

    @Indexed
    private Instant neededBy;

    @Indexed
    private UrgencyLevel urgency = UrgencyLevel.ROUTINE;

    @Indexed
    private String status = "OPEN";

    private Instant createdAt = Instant.now();

    private String clinicalContext;

    public BloodRequest() {}

    public BloodRequest(String id, String hospitalId, Component component, BloodGroup group,
                        int unitsNeeded, Instant neededBy, UrgencyLevel urgency, String status,
                        Instant createdAt, String clinicalContext) {
        this.id = id;
        this.hospitalId = hospitalId;
        this.component = component;
        this.group = group;
        this.unitsNeeded = unitsNeeded;
        this.neededBy = neededBy;
        this.urgency = urgency;
        this.status = status;
        this.createdAt = createdAt;
        this.clinicalContext = clinicalContext;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getHospitalId() { return hospitalId; }
    public void setHospitalId(String hospitalId) { this.hospitalId = hospitalId; }

    public Component getComponent() { return component; }
    public void setComponent(Component component) { this.component = component; }

    public BloodGroup getGroup() { return group; }
    public void setGroup(BloodGroup group) { this.group = group; }

    public int getUnitsNeeded() { return unitsNeeded; }
    public void setUnitsNeeded(int unitsNeeded) { this.unitsNeeded = unitsNeeded; }

    public Instant getNeededBy() { return neededBy; }
    public void setNeededBy(Instant neededBy) { this.neededBy = neededBy; }

    public UrgencyLevel getUrgency() { return urgency; }
    public void setUrgency(UrgencyLevel urgency) { this.urgency = urgency; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public String getClinicalContext() { return clinicalContext; }
    public void setClinicalContext(String clinicalContext) { this.clinicalContext = clinicalContext; }
}
