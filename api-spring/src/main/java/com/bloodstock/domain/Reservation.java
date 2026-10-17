package com.bloodstock.domain;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "reservations")
public class Reservation {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private String id;

    @Indexed
    private String unitId;

    @Indexed
    private String requestId;

    private String fromHospitalId;
    private String toHospitalId;

    private Instant dispatchAt;
    private Instant eta;
    private int transitMinutes;

    private ReservationStatus status = ReservationStatus.RESERVED;

    @Indexed
    private boolean isActive = true;

    private String idempotencyKey;

    @CreatedDate
    private Instant createdAt = Instant.now();

    @LastModifiedDate
    private Instant updatedAt = Instant.now();

    public Reservation() {}

    public Reservation(String id, String unitId, String requestId, String fromHospitalId,
                       String toHospitalId, Instant dispatchAt, Instant eta, int transitMinutes,
                       ReservationStatus status, boolean isActive, String idempotencyKey) {
        this.id = id;
        this.unitId = unitId;
        this.requestId = requestId;
        this.fromHospitalId = fromHospitalId;
        this.toHospitalId = toHospitalId;
        this.dispatchAt = dispatchAt;
        this.eta = eta;
        this.transitMinutes = transitMinutes;
        this.status = status;
        this.isActive = isActive;
        this.idempotencyKey = idempotencyKey;
    }

    public void syncIsActive() {
        this.isActive = (this.status == ReservationStatus.RESERVED || this.status == ReservationStatus.IN_TRANSIT);
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUnitId() { return unitId; }
    public void setUnitId(String unitId) { this.unitId = unitId; }

    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }

    public String getFromHospitalId() { return fromHospitalId; }
    public void setFromHospitalId(String fromHospitalId) { this.fromHospitalId = fromHospitalId; }

    public String getToHospitalId() { return toHospitalId; }
    public void setToHospitalId(String toHospitalId) { this.toHospitalId = toHospitalId; }

    public Instant getDispatchAt() { return dispatchAt; }
    public void setDispatchAt(Instant dispatchAt) { this.dispatchAt = dispatchAt; }

    public Instant getEta() { return eta; }
    public void setEta(Instant eta) { this.eta = eta; }

    public int getTransitMinutes() { return transitMinutes; }
    public void setTransitMinutes(int transitMinutes) { this.transitMinutes = transitMinutes; }

    public ReservationStatus getStatus() { return status; }
    public void setStatus(ReservationStatus status) {
        this.status = status;
        syncIsActive();
    }

    public boolean isActive() { return isActive; }
    public void setActive(boolean active) { isActive = active; }

    public String getIdempotencyKey() { return idempotencyKey; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
