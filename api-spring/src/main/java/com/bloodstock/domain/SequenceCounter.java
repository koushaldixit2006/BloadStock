package com.bloodstock.domain;

import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document(collection = "sequence_counters")
public class SequenceCounter {

    @Id
    private String id; // e.g. "audit_log_seq"

    private long seq;

    public SequenceCounter() {}

    public SequenceCounter(String id, long seq) {
        this.id = id;
        this.seq = seq;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public long getSeq() { return seq; }
    public void setSeq(long seq) { this.seq = seq; }
}
