package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.AdminUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface AdminUserRepository extends JpaRepository<AdminUser, Long> {

    Optional<AdminUser> findByTelegramUserIdAndActiveTrue(Long telegramUserId);

    boolean existsByTelegramUserIdAndActiveTrue(Long telegramUserId);

    Optional<AdminUser> findByUsername(String username);

    List<AdminUser> findAllByActiveTrue();

    /**
     * Active SUPER_ADMINs with 2FA other than {@code exceptId} — the «Админы» section never lets this
     * drop to zero (there must always be someone able to manage admins).
     */
    @Query("select count(a) from AdminUser a where a.active = true "
            + "and a.role = com.maxsolch.shop.domain.AdminRole.SUPER_ADMIN "
            + "and a.totpSecretEnc is not null and a.telegramUserId <> :exceptId")
    long countOtherActiveSupersWith2fa(@Param("exceptId") Long exceptId);

    /** Is there an active admin who can sign in with a password? (AdminBootstrap) */
    boolean existsByActiveTrueAndPasswordHashIsNotNull();

    /**
     * Accepts a TOTP step only if it is newer than the last accepted one — atomically, so two
     * requests racing with the same code cannot both pass. 1 = accepted, 0 = replay.
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AdminUser a set a.totpLastStep = :step where a.telegramUserId = :id "
            + "and (a.totpLastStep is null or a.totpLastStep < :step)")
    int acceptTotpStep(@Param("id") Long telegramUserId, @Param("step") long step);

    /** One more failure in a row; returns rows updated. */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AdminUser a set a.failedAttempts = a.failedAttempts + 1 where a.telegramUserId = :id")
    int incrementFailures(@Param("id") Long telegramUserId);

    /** Locks the account until {@code until} and restarts the count. */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AdminUser a set a.lockedUntil = :until, a.failedAttempts = 0 where a.telegramUserId = :id")
    int lockUntil(@Param("id") Long telegramUserId, @Param("until") java.time.Instant until);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AdminUser a set a.failedAttempts = 0 where a.telegramUserId = :id and a.failedAttempts <> 0")
    int resetFailures(@Param("id") Long telegramUserId);

    @Query("select a.failedAttempts from AdminUser a where a.telegramUserId = :id")
    Optional<Integer> failuresOf(@Param("id") Long telegramUserId);

    /** «Выйти на всех устройствах»: every token issued so far stops matching. */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update AdminUser a set a.tokenVersion = a.tokenVersion + 1 where a.telegramUserId = :id")
    int bumpTokenVersion(@Param("id") Long telegramUserId);
}
