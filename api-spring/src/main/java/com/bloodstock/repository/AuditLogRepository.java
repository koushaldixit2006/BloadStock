package com.bloodstock.repository;

import com.bloodstock.domain.AuditLog;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AuditLogRepository extends MongoRepository<AuditLog, String> {
    Optional<AuditLog> findBySeq(long seq);
    Optional<AuditLog> findTopByOrderBySeqDesc();
    List<AuditLog> findAllByOrderBySeqAsc();
    List<AuditLog> findByEntityAndEntityIdOrderBySeqAsc(String entity, String entityId);
}
