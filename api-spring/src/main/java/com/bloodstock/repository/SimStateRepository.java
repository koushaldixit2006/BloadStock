package com.bloodstock.repository;

import com.bloodstock.domain.SimState;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SimStateRepository extends MongoRepository<SimState, String> {
    Optional<SimState> findByKey(String key);
}
