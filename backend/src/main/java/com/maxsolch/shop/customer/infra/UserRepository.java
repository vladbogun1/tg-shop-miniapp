package com.maxsolch.shop.customer.infra;

import com.maxsolch.shop.customer.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface UserRepository extends JpaRepository<User, Long> {

    // ---- Block tracking ----

    @Modifying
    @Query("UPDATE User u SET u.botBlocked = true, u.botBlockedAt = :now WHERE u.telegramUserId = :id")
    void markBotBlocked(@Param("id") long id, @Param("now") Instant now);

    // ---- Metrics ----

    long countByBotBlockedTrue();

    long countByPremiumTrue();

    @Query("SELECT u.createdAt FROM User u WHERE :from IS NULL OR u.createdAt >= :from")
    List<Instant> createdAtsSince(@Param("from") Instant from);

    /**
     * Languages chosen in the shop (users.locale, V17) — what the customer actually reads. The
     * Telegram interface language (language_code) said nothing about that.
     */
    @Query("SELECT COALESCE(u.locale, '—'), COUNT(u) FROM User u GROUP BY u.locale ORDER BY COUNT(u) DESC")
    List<Object[]> languageCounts();

    /**
     * {@code [telegramUserId, locale, languageCode]} of everyone a broadcast can reach — the
     * language split (R9) is resolved in memory, like {@code Messages.localeOf(User)}.
     */
    @Query("SELECT u.telegramUserId, u.locale, u.languageCode FROM User u "
            + "WHERE u.telegramUserId > 0 AND u.botBlocked = false")
    List<Object[]> reachableLanguages();

    /** users.locale of one customer (uk/ru/en), empty when unknown or never chosen. */
    @Query("SELECT u.locale FROM User u WHERE u.telegramUserId = :id AND u.locale IS NOT NULL")
    java.util.Optional<String> localeOf(@Param("id") long id);

    // ---- Broadcast audiences (tg ids only, reachable users) ----

    @Query("SELECT u.telegramUserId FROM User u WHERE u.telegramUserId > 0 AND u.botBlocked = false")
    List<Long> audienceAll();

    // Sizes for the compose screen. Previously the four id lists above were fetched in full just
    // to call .size() on them — four table scans materialised into memory to show four numbers.
    @Query("SELECT COUNT(u) FROM User u WHERE u.telegramUserId > 0 AND u.botBlocked = false")
    long audienceAllCount();

    @Query("SELECT COUNT(u) FROM User u WHERE u.telegramUserId > 0 AND u.botBlocked = false "
            + "AND u.premium = true")
    long audiencePremiumCount();

    @Query("SELECT u.telegramUserId FROM User u WHERE u.telegramUserId > 0 AND u.botBlocked = false AND u.premium = true")
    List<Long> audiencePremium();
}
