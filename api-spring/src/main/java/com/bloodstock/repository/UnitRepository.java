package com.bloodstock.repository;

import com.bloodstock.domain.Unit;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UnitRepository extends MongoRepository<Unit, String> {
    @org.springframework.data.mongodb.repository.Query("{'id': ?0}")
    Optional<Unit> findById(String id);
    List<Unit> findByStatus(String status);
    List<Unit> findByHospitalId(String hospitalId);
    List<Unit> findByHospitalIdAndStatus(String hospitalId, String status);
}
