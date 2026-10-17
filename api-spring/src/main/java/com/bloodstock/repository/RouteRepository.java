package com.bloodstock.repository;

import com.bloodstock.domain.Route;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RouteRepository extends MongoRepository<Route, String> {
    Optional<Route> findByFromIdAndToId(String fromId, String toId);
    List<Route> findByFromId(String fromId);
    List<Route> findByToId(String toId);
}
