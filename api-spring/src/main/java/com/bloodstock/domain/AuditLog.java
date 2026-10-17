package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.Map;

@Document(collection = "audit_logs")
public class AuditLog {

    @Id
    private String mongoId;

    @Indexed(unique = true)
    private long seq;

    @Indexed
    private Instant timestamp;

    private Actor actor;

    @Indexed
    private String action;

    @Indexed
    private String entity;

    @Indexed
    private String entityId;

    private Map<String, Object> diff;

    private String prevHash;
    private String hash;

    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record Actor(String id, String role, String hospitalId) {
        public Actor(String id, String role) {
            this(id, role, null);
        }
    }

    public AuditLog() {}

    public AuditLog(long seq, Instant timestamp, Actor actor, String action, String entity,
                    String entityId, Map<String, Object> diff, String prevHash, String hash) {
        this.seq = seq;
        this.timestamp = timestamp;
        this.actor = actor;
        this.action = action;
        this.entity = entity;
        this.entityId = entityId;
        this.diff = diff;
        this.prevHash = prevHash;
        this.hash = hash;
    }

    public String getMongoId() { return mongoId; }
    public void setMongoId(String mongoId) { this.mongoId = mongoId; }

    public long getSeq() { return seq; }
    public void setSeq(long seq) { this.seq = seq; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    public Actor getActor() { return actor; }
    public void setActor(Actor actor) { this.actor = actor; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getEntity() { return entity; }
    public void setEntity(String entity) { this.entity = entity; }

    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }

    public Map<String, Object> getDiff() { return diff; }
    public void setDiff(Map<String, Object> diff) { this.diff = diff; }

    public String getPrevHash() { return prevHash; }
    public void setPrevHash(String prevHash) { this.prevHash = prevHash; }

    public String getHash() { return hash; }
    public void setHash(String hash) { this.hash = hash; }
}
