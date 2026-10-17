package com.bloodstock;

import com.bloodstock.domain.Reservation;
import com.bloodstock.domain.ReservationStatus;
import com.bloodstock.repository.ReservationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("test")
public class ReservationPartialIndexTest {

    @Autowired
    private ReservationRepository reservationRepository;

    @Autowired
    private MongoTemplate mongoTemplate;

    private final String testUnitId = "U-PARTIAL-IDX-TEST-" + UUID.randomUUID().toString().substring(0, 8);

    @BeforeEach
    @AfterEach
    void cleanUp() {
        mongoTemplate.getCollection("reservations").deleteMany(
                new org.bson.Document("unitId", testUnitId)
        );
    }

    @Test
    @DisplayName("Unique partial index: two active reservations for the same unitId fails with DuplicateKeyException; a DELIVERED reservation succeeds")
    void testUniquePartialIndexOnActiveReservations() {
        // 1. First active reservation (RESERVED, isActive=true) -> Must succeed
        Reservation res1 = new Reservation(
                "RSV-TEST-1",
                testUnitId,
                "R-TEST-1",
                "H1",
                "H3",
                Instant.now(),
                Instant.now().plusSeconds(1800),
                30,
                ReservationStatus.RESERVED,
                true,
                "idemp-key-1"
        );
        Reservation saved1 = reservationRepository.save(res1);
        assertThat(saved1.getId()).isEqualTo("RSV-TEST-1");
        assertThat(saved1.isActive()).isTrue();

        // 2. Second active reservation for the SAME unitId (RESERVED, isActive=true) -> Must FAIL with DuplicateKeyException (code 11000)
        Reservation res2 = new Reservation(
                "RSV-TEST-2",
                testUnitId,
                "R-TEST-2",
                "H2",
                "H3",
                Instant.now(),
                Instant.now().plusSeconds(2400),
                40,
                ReservationStatus.RESERVED,
                true,
                "idemp-key-2"
        );
        assertThatThrownBy(() -> reservationRepository.save(res2))
                .isInstanceOf(DuplicateKeyException.class);

        // 3. A non-active reservation (DELIVERED, isActive=false) for the SAME unitId -> Must SUCCEED
        Reservation res3 = new Reservation(
                "RSV-TEST-3",
                testUnitId,
                "R-TEST-3",
                "H1",
                "H4",
                Instant.now().minusSeconds(7200),
                Instant.now().minusSeconds(5400),
                30,
                ReservationStatus.DELIVERED,
                false,
                "idemp-key-3"
        );
        Reservation saved3 = reservationRepository.save(res3);
        assertThat(saved3.getId()).isEqualTo("RSV-TEST-3");
        assertThat(saved3.isActive()).isFalse();

        // 4. Assert that database contains exactly 1 active and 1 delivered reservation for this unit
        long activeCount = reservationRepository.findByUnitIdAndIsActiveTrue(testUnitId).size();
        assertThat(activeCount).isEqualTo(1);
    }
}
