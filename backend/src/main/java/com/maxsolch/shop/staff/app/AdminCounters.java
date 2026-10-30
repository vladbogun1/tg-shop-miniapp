package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.infra.AdminUserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * The single-row atomic updates of an admin account that sign-in security depends on: failure counter, lock, accepted
 * TOTP step, token version. Each is one conditional {@code UPDATE} in its own (or the caller's) transaction, so two
 * parallel requests cannot both pass a TOTP code and a failure is never lost. The transaction boundary lives here, in
 * {@code app}; the repository only declares the queries.
 */
@Service
public class AdminCounters {

    private final AdminUserRepository repository;

    public AdminCounters(AdminUserRepository repository) {
        this.repository = repository;
    }

    /** 1 = the step is newer than the last accepted one and is now taken, 0 = replay. */
    @Transactional
    public int acceptTotpStep(Long telegramUserId, long step) {
        return repository.acceptTotpStep(telegramUserId, step);
    }

    /** One more failure in a row; returns rows updated. */
    @Transactional
    public int incrementFailures(Long telegramUserId) {
        return repository.incrementFailures(telegramUserId);
    }

    @Transactional(readOnly = true)
    public Optional<Integer> failuresOf(Long telegramUserId) {
        return repository.failuresOf(telegramUserId);
    }

    /** Locks the account until {@code until} and restarts the count. */
    @Transactional
    public int lockUntil(Long telegramUserId, Instant until) {
        return repository.lockUntil(telegramUserId, until);
    }

    @Transactional
    public int resetFailures(Long telegramUserId) {
        return repository.resetFailures(telegramUserId);
    }

    /** Every token issued so far stops matching. */
    @Transactional
    public int bumpTokenVersion(Long telegramUserId) {
        return repository.bumpTokenVersion(telegramUserId);
    }
}
