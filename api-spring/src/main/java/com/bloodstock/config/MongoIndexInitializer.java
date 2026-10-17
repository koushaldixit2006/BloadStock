package com.bloodstock.config;

import com.bloodstock.domain.AuditLog;
import com.bloodstock.domain.BloodRequest;
import com.bloodstock.domain.Hospital;
import com.bloodstock.domain.Plan;
import com.bloodstock.domain.Reservation;
import com.bloodstock.domain.Route;
import com.bloodstock.domain.Unit;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.index.CompoundIndexDefinition;
import org.springframework.data.mongodb.core.index.Index;
import org.springframework.data.mongodb.core.index.PartialIndexFilter;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.stereotype.Component;

@Component
public class MongoIndexInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(MongoIndexInitializer.class);

    private final MongoTemplate mongoTemplate;

    public MongoIndexInitializer(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("Initializing programmatic MongoDB indexes...");

        initializeReservationIndexes();
        initializePlanIndexes();
        initializeAuditLogIndexes();
        initializeUnitIndexes();
        initializeBloodRequestIndexes();
        initializeHospitalAndRouteIndexes();

        log.info("MongoDB indexes successfully initialized.");
    }

    public void initializeReservationIndexes() {
        // 1. UNIQUE PARTIAL INDEX on { unitId: 1 } where { isActive: true }
        // Hard constraint: No unit can ever be in more than one active reservation
        Index activeResUniqueIdx = new Index()
                .on("unitId", Sort.Direction.ASC)
                .unique()
                .partial(PartialIndexFilter.of(Criteria.where("isActive").is(true)))
                .named("idx_reservations_unitId_active_unique");
        mongoTemplate.indexOps(Reservation.class).ensureIndex(activeResUniqueIdx);
        log.info("Ensured unique partial index on reservations { unitId: 1, isActive: true }");

        // 2. UNIQUE SPARSE INDEX on { idempotencyKey: 1 }
        Index idempIdx = new Index()
                .on("idempotencyKey", Sort.Direction.ASC)
                .unique()
                .sparse()
                .named("idx_reservations_idempotency_key_sparse_unique");
        mongoTemplate.indexOps(Reservation.class).ensureIndex(idempIdx);

        // 3. Query indexes
        mongoTemplate.indexOps(Reservation.class).ensureIndex(
                new Index().on("id", Sort.Direction.ASC).unique().named("idx_reservations_id_unique")
        );
        mongoTemplate.indexOps(Reservation.class).ensureIndex(
                new Index().on("requestId", Sort.Direction.ASC).named("idx_reservations_requestId")
        );
        mongoTemplate.indexOps(Reservation.class).ensureIndex(
                new Index().on("status", Sort.Direction.ASC).named("idx_reservations_status")
        );
    }

    public void initializePlanIndexes() {
        mongoTemplate.indexOps(Plan.class).ensureIndex(
                new Index().on("planId", Sort.Direction.ASC).unique().named("idx_plans_planId_unique")
        );
        // TTL Index on expiresAt (expireAfterSeconds: 0)
        mongoTemplate.indexOps(Plan.class).ensureIndex(
                new Index().on("expiresAt", Sort.Direction.ASC).expire(0).named("idx_plans_expiresAt_ttl")
        );
        log.info("Ensured TTL index on plans { expiresAt: 1 }");
    }

    public void initializeAuditLogIndexes() {
        mongoTemplate.indexOps(AuditLog.class).ensureIndex(
                new Index().on("seq", Sort.Direction.ASC).unique().named("idx_audit_logs_seq_unique")
        );
        mongoTemplate.indexOps(AuditLog.class).ensureIndex(
                new Index().on("timestamp", Sort.Direction.ASC).named("idx_audit_logs_timestamp")
        );
        mongoTemplate.indexOps(AuditLog.class).ensureIndex(
                new Index().on("action", Sort.Direction.ASC).named("idx_audit_logs_action")
        );
        mongoTemplate.indexOps(AuditLog.class).ensureIndex(
                new Index().on("entity", Sort.Direction.ASC).named("idx_audit_logs_entity")
        );
        mongoTemplate.indexOps(AuditLog.class).ensureIndex(
                new Index().on("entityId", Sort.Direction.ASC).named("idx_audit_logs_entityId")
        );
        log.info("Ensured unique index on audit_logs { seq: 1 }");
    }

    public void initializeUnitIndexes() {
        mongoTemplate.indexOps(Unit.class).ensureIndex(
                new Index().on("id", Sort.Direction.ASC).unique().named("idx_units_id_unique")
        );
        mongoTemplate.indexOps(Unit.class).ensureIndex(
                new CompoundIndexDefinition(new Document("status", 1).append("component", 1).append("group", 1))
                        .named("idx_units_status_component_group")
        );
        mongoTemplate.indexOps(Unit.class).ensureIndex(
                new CompoundIndexDefinition(new Document("hospitalId", 1).append("status", 1))
                        .named("idx_units_hospitalId_status")
        );
        mongoTemplate.indexOps(Unit.class).ensureIndex(
                new Index().on("expiresAt", Sort.Direction.ASC).named("idx_units_expiresAt")
        );
    }

    public void initializeBloodRequestIndexes() {
        mongoTemplate.indexOps(BloodRequest.class).ensureIndex(
                new Index().on("id", Sort.Direction.ASC).unique().named("idx_blood_requests_id_unique")
        );
        mongoTemplate.indexOps(BloodRequest.class).ensureIndex(
                new Index().on("hospitalId", Sort.Direction.ASC).named("idx_blood_requests_hospitalId")
        );
        mongoTemplate.indexOps(BloodRequest.class).ensureIndex(
                new Index().on("neededBy", Sort.Direction.ASC).named("idx_blood_requests_neededBy")
        );
        mongoTemplate.indexOps(BloodRequest.class).ensureIndex(
                new Index().on("urgency", Sort.Direction.ASC).named("idx_blood_requests_urgency")
        );
        mongoTemplate.indexOps(BloodRequest.class).ensureIndex(
                new Index().on("status", Sort.Direction.ASC).named("idx_blood_requests_status")
        );
    }

    public void initializeHospitalAndRouteIndexes() {
        mongoTemplate.indexOps(Hospital.class).ensureIndex(
                new Index().on("id", Sort.Direction.ASC).unique().named("idx_hospitals_id_unique")
        );
        mongoTemplate.indexOps(Route.class).ensureIndex(
                new CompoundIndexDefinition(new Document("fromId", 1).append("toId", 1))
                        .named("idx_routes_fromId_toId")
        );
    }
}
