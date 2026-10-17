package com.bloodstock.repository;

import com.bloodstock.domain.SequenceCounter;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SequenceCounterRepository extends MongoRepository<SequenceCounter, String> {
    Optional<SequenceCounter> findById(String id);
}
