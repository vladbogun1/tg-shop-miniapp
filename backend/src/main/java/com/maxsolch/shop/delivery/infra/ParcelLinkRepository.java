package com.maxsolch.shop.delivery.infra;

import com.maxsolch.shop.delivery.domain.ParcelLink;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ParcelLinkRepository extends JpaRepository<ParcelLink, byte[]> {

    Optional<ParcelLink> findByTtn(String ttn);

    List<ParcelLink> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);

    /** Not final yet, made after {@code since}, not polled since {@code before}: least recently polled first. */
    @Query("select l from ParcelLink l where l.stage not in :done and l.createdAt > :since "
            + "and (l.lastPolledAt is null or l.lastPolledAt < :before) order by l.lastPolledAt asc nulls first")
    List<ParcelLink> findDueForPoll(@Param("done") Collection<String> doneStages,
                                    @Param("since") Instant since,
                                    @Param("before") Instant before,
                                    Pageable page);

    /** Rows «Внимание → Посылки» may show: made after {@code since}. */
    List<ParcelLink> findByCreatedAtAfter(Instant since);
}
