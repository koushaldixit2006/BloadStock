package com.bloodstock.repository;

import com.bloodstock.domain.BloodRequest;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BloodRequestRepository extends MongoRepository<BloodRequest, String> {
    @org.springframework.data.mongodb.repository.Query("{'id': ?0}")
    Optional<BloodRequest> findById(String id);
    List<BloodRequest> findByStatus(String status);
    List<BloodRequest> findByStatusIn(List<String> statuses);
    List<BloodRequest> findByHospitalId(String hospitalId);
}
