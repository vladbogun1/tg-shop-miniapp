package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.OrderMessage;
import com.maxsolch.shop.domain.SenderType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface OrderMessageRepository extends JpaRepository<OrderMessage, Long> {

    List<OrderMessage> findByOrderIdOrderByCreatedAtAsc(byte[] orderId);

    /**
     * Newest page of an order's chat, optionally everything before a given message id.
     *
     * <p>The chat used to fetch the entire history on open — fine for a three-message order, not
     * for a long-running dispute. Ordered descending so the database can stop at the page size;
     * the service flips it back for display.
     */
    @Query("select m from OrderMessage m where m.order.id = :orderId "
            + "and (:beforeId is null or m.id < :beforeId) "
            + "order by m.id desc")
    List<OrderMessage> findPage(@Param("orderId") byte[] orderId,
                                @Param("beforeId") Long beforeId,
                                Pageable pageable);

    /** Most recent message of an order (any sender) — for conversation previews. */
    OrderMessage findFirstByOrderIdOrderByCreatedAtDescIdDesc(byte[] orderId);

    long countByOrderIdAndSenderTypeAndReadAtIsNull(byte[] orderId, SenderType senderType);

    /**
     * Unread counts for every order in one grouped query: {@code [orderId, count]}.
     *
     * <p>The board rendered up to 300 cards per column and asked for each card's unread count
     * separately — about 1500 COUNT queries per refresh, every ten seconds.
     */
    @Query("select m.order.id, count(m) from OrderMessage m "
            + "where m.senderType = :senderType and m.readAt is null group by m.order.id")
    List<Object[]> unreadCountsBySender(@Param("senderType") SenderType senderType);

    /** Order ids that have at least one unread message of the given sender type (admin inbox). */
    @Query("select distinct m.order.id from OrderMessage m where m.senderType = :senderType and m.readAt is null")
    List<byte[]> orderIdsWithUnread(@Param("senderType") SenderType senderType);

    /** Same, scoped to one customer's orders (customer inbox). */
    @Query("select distinct m.order.id from OrderMessage m "
            + "where m.senderType = :senderType and m.readAt is null and m.order.userId = :userId")
    List<byte[]> orderIdsWithUnreadForUser(@Param("userId") Long userId,
                                           @Param("senderType") SenderType senderType);

    /** Mark ALL unread messages of a sender type read (admin "read all"). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update OrderMessage m set m.readAt = :now where m.senderType = :senderType and m.readAt is null")
    int markAllRead(@Param("senderType") SenderType senderType, @Param("now") Instant now);

    /** Total unread messages of a sender type across ALL orders (admin bell). */
    @Query("select count(m) from OrderMessage m where m.senderType = :senderType and m.readAt is null")
    long countUnreadBySenderType(@Param("senderType") SenderType senderType);

    /** Total unread messages of a sender type across one user's orders (customer bell). */
    @Query("select count(m) from OrderMessage m where m.senderType = :senderType "
            + "and m.readAt is null and m.order.userId = :userId")
    long countUnreadForUser(@Param("userId") Long userId, @Param("senderType") SenderType senderType);

    // clear/flush so the persistence context does not keep serving pre-update copies of these rows.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update OrderMessage m set m.readAt = :now "
            + "where m.order.id = :orderId and m.senderType = :senderType and m.readAt is null")
    int markRead(@Param("orderId") byte[] orderId,
                 @Param("senderType") SenderType senderType,
                 @Param("now") Instant now);
}
