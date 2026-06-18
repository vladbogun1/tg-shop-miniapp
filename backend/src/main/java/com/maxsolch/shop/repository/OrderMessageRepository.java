package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderMessage;
import com.maxsolch.shop.domain.SenderType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OrderMessageRepository extends JpaRepository<OrderMessage, Long> {

    List<OrderMessage> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);

    long countByOrderIdAndSenderTypeAndReadAtIsNull(byte[] orderId, SenderType senderType);

    /** Total unread messages of a sender type across ALL orders (admin bell). */
    @Query("select count(m) from OrderMessage m where m.senderType = :senderType and m.readAt is null")
    long countUnreadBySenderType(@Param("senderType") SenderType senderType);

    /** Total unread messages of a sender type across one user's orders (customer bell). */
    @Query("select count(m) from OrderMessage m where m.senderType = :senderType "
            + "and m.readAt is null and m.order.userId = :userId")
    long countUnreadForUser(@Param("userId") Long userId, @Param("senderType") SenderType senderType);

    @Modifying
    @Query("update OrderMessage m set m.readAt = :now "
            + "where m.order.id = :orderId and m.senderType = :senderType and m.readAt is null")
    int markRead(@Param("orderId") byte[] orderId,
                 @Param("senderType") SenderType senderType,
                 @Param("now") Instant now);
}
