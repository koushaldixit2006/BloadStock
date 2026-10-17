package com.bloodstock.repository;

import com.bloodstock.domain.Reservation;
import com.bloodstock.domain.ReservationStatus;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ReservationRepository extends MongoRepository<Reservation, String> {
    Optional<Reservation> findById(String id);
    List<Reservation> findByIsActiveTrue();
    List<Reservation> findByUnitIdAndIsActiveTrue(String unitId);
    List<Reservation> findByRequestId(String requestId);
    List<Reservation> findByRequestIdAndIsActiveTrue(String requestId);
    List<Reservation> findByIdempotencyKey(String idempotencyKey);
    List<Reservation> findByStatus(ReservationStatus status);
}
