package com.maxsolch.shop.delivery.infra;

import com.maxsolch.shop.delivery.domain.OrderShipment;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OrderShipmentRepository extends JpaRepository<OrderShipment, byte[]> {

    Optional<OrderShipment> findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(byte[] orderId);

    List<OrderShipment> findByOrderIdInAndActiveTrue(Collection<byte[]> orderIds);

    List<OrderShipment> findByTtnAndActiveTrue(String ttn);

    /** Active, non-final shipments least recently polled first (the tracking job takes a page). */
    @Query("select s from OrderShipment s where s.active = true and s.stage not in :done "
            + "and (s.lastPolledAt is null or s.lastPolledAt < :before) and s.createdAt > :since "
            + "order by s.lastPolledAt asc nulls first")
    List<OrderShipment> findDueForPoll(@Param("done") Collection<String> doneStages,
                                       @Param("before") Instant before,
                                       @Param("since") Instant since,
                                       Pageable page);

    /**
     * Picked up after {@code since} and not polled since {@code before}: one more look — a webhook «received» carries
     * neither what NP collected nor the recipient's phone of a typed-in number.
     */
    @Query("select s from OrderShipment s where s.active = true and s.stage = :stage and s.receivedAt > :since "
            + "and (s.lastPolledAt is null or s.lastPolledAt < :before) order by s.lastPolledAt asc nulls first")
    List<OrderShipment> findReceivedSince(@Param("stage") String stage,
                                          @Param("since") Instant since,
                                          @Param("before") Instant before,
                                          Pageable page);

    /** Rows of the «Внимание → Посылки» group. */
    @Query("select s from OrderShipment s where s.active = true and s.stage in :stages")
    List<OrderShipment> findActiveInStages(@Param("stages") Collection<String> stages);

    /** «Журнал упаковки»: active waybills made since {@code since}, newest first (a page). */
    List<OrderShipment> findByActiveTrueAndCreatedAtAfterOrderByCreatedAtDesc(Instant since, Pageable page);
}
