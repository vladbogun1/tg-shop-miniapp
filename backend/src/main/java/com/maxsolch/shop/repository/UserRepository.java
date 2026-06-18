package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.web.dto.UserCardDto;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface UserRepository extends JpaRepository<User, Long> {

    // ---- Admin Users list ----

    @Query("""
            SELECT new com.maxsolch.shop.web.dto.UserCardDto(
                u.telegramUserId, u.username, u.firstName, u.lastName,
                u.languageCode, u.premium, u.botBlocked,
                (SELECT COUNT(o) FROM Order o WHERE o.tgUserId = u.telegramUserId),
                (SELECT COALESCE(SUM(o2.totalMinor), 0) FROM Order o2
                    WHERE o2.tgUserId = u.telegramUserId AND o2.status <> com.maxsolch.shop.domain.OrderStatus.REJECTED),
                u.createdAt, u.lastSeenAt)
            FROM User u
            WHERE (:like IS NULL
                OR LOWER(COALESCE(u.username, '')) LIKE :like
                OR LOWER(COALESCE(u.firstName, '')) LIKE :like
                OR LOWER(COALESCE(u.lastName, '')) LIKE :like
                OR CAST(u.telegramUserId AS string) LIKE :like)
              AND (:blockedOnly = false OR u.botBlocked = true)
            """)
    Page<UserCardDto> search(@Param("like") String like,
                             @Param("blockedOnly") boolean blockedOnly,
                             Pageable pageable);

    // ---- Block tracking ----

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.botBlocked = true, u.botBlockedAt = :now WHERE u.telegramUserId = :id")
    void markBotBlocked(@Param("id") long id, @Param("now") Instant now);

    // ---- Metrics ----

    long countByBotBlockedTrue();

    long countByPremiumTrue();

    @Query("SELECT u.createdAt FROM User u WHERE :from IS NULL OR u.createdAt >= :from")
    List<Instant> createdAtsSince(@Param("from") Instant from);

    @Query("SELECT COALESCE(u.languageCode, '—'), COUNT(u) FROM User u GROUP BY u.languageCode ORDER BY COUNT(u) DESC")
    List<Object[]> languageCounts();

    @Query("SELECT COUNT(DISTINCT o.tgUserId) FROM Order o WHERE o.tgUserId IS NOT NULL AND o.tgUserId > 0")
    long countUsersWithOrders();

    @Query("""
            SELECT o.tgUserId, MAX(o.customerName), COUNT(o), COALESCE(SUM(o.totalMinor), 0)
            FROM Order o
            WHERE o.tgUserId IS NOT NULL AND o.tgUserId > 0
              AND o.status <> com.maxsolch.shop.domain.OrderStatus.REJECTED
            GROUP BY o.tgUserId
            ORDER BY SUM(o.totalMinor) DESC
            """)
    List<Object[]> topCustomers(Pageable pageable);

    // ---- Broadcast audiences (tg ids only, reachable users) ----

    @Query("SELECT u.telegramUserId FROM User u WHERE u.telegramUserId > 0 AND u.botBlocked = false")
    List<Long> audienceAll();

    @Query("SELECT u.telegramUserId FROM User u WHERE u.telegramUserId > 0 AND u.botBlocked = false AND u.premium = true")
    List<Long> audiencePremium();

    @Query("""
            SELECT u.telegramUserId FROM User u
            WHERE u.telegramUserId > 0 AND u.botBlocked = false
              AND EXISTS (SELECT 1 FROM Order o WHERE o.tgUserId = u.telegramUserId)
            """)
    List<Long> audienceActive();

    @Query("""
            SELECT u.telegramUserId FROM User u
            WHERE u.telegramUserId > 0 AND u.botBlocked = false
              AND NOT EXISTS (SELECT 1 FROM Order o WHERE o.tgUserId = u.telegramUserId)
            """)
    List<Long> audienceInactive();
}
