package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;

/**
 * Per-account lockout: {@value #MAX_FAILURES} wrong passwords or codes in a row lock the admin
 * out for {@link #LOCK_DURATION}, whatever the IP (the per-IP limit in RateLimitFilter stays on top).
 * Counted in the database, so a restart does not reset it. Only a finished sign-in clears the count
 * — a right password alone does not, otherwise password + 4 guesses, again and again, would
 * brute-force the code.
 */
@Slf4j
@Component
public class AdminLockout {

    public static final int MAX_FAILURES = 5;
    public static final Duration LOCK_DURATION = Duration.ofMinutes(15);
    private static final DateTimeFormatter HHMM = DateTimeFormatter.ofPattern("HH:mm");

    private final AdminUserRepository adminUserRepository;
    private final AdminAuditService audit;
    private final AdminLoginLogService loginLog;
    private final AdminSecurityAlerts alerts;
    private final ZoneId zone;
    private final Clock clock;

    @Autowired
    public AdminLockout(AdminUserRepository adminUserRepository, AdminAuditService audit,
                        AdminLoginLogService loginLog, AdminSecurityAlerts alerts, AppProperties props) {
        this(adminUserRepository, audit, loginLog, alerts, ZoneId.of(props.getTimezone()), Clock.systemUTC());
    }

    AdminLockout(AdminUserRepository adminUserRepository, AdminAuditService audit, AdminLoginLogService loginLog,
                 AdminSecurityAlerts alerts, ZoneId zone, Clock clock) {
        this.adminUserRepository = adminUserRepository;
        this.audit = audit;
        this.loginLog = loginLog;
        this.alerts = alerts;
        this.zone = zone;
        this.clock = clock;
    }

    public boolean isLocked(AdminUser admin) {
        return admin.getLockedUntil() != null && admin.getLockedUntil().isAfter(clock.instant());
    }

    /** Throws the «locked» error when the account is locked right now. */
    public void ensureNotLocked(AdminUser admin) {
        if (isLocked(admin)) {
            throw lockedError(admin.getLockedUntil());
        }
    }

    /**
     * One more wrong password / code. Locks the account on the {@value #MAX_FAILURES}th.
     *
     * @return the lock end when this failure locked the account
     */
    public Optional<Instant> registerFailure(long adminId, LoginMethod method, ClientInfo client) {
        adminUserRepository.incrementFailures(adminId);
        int failures = adminUserRepository.failuresOf(adminId).orElse(0);
        if (failures < MAX_FAILURES) {
            return Optional.empty();
        }
        Instant until = clock.instant().plus(LOCK_DURATION);
        adminUserRepository.lockUntil(adminId, until);
        log.warn("Admin {} locked until {} after {} failed sign-in attempts (last from {})",
                adminId, until, failures, client.ip());
        AdminLoginLogService.Recorded rec = loginLog.record(adminId, null, method,
                AdminLoginLogService.Result.LOCKED, null, client);
        audit.recordFor(adminId, "ADMIN_LOCKED", "AUTH", String.valueOf(adminId),
                MAX_FAILURES + " неверных паролей/кодов подряд — вход заблокирован до " + time(until)
                        + " (IP " + client.ip() + ", " + rec.place() + ", " + rec.device() + ")");
        try {
            alerts.accountLocked(adminId, rec.place(), rec.device(), client.ip(), until);
        } catch (Exception e) {
            log.debug("Lock alert failed: {}", e.getMessage());
        }
        return Optional.of(until);
    }

    public void reset(long adminId) {
        adminUserRepository.resetFailures(adminId);
    }

    public ResponseStatusException lockedError(Instant until) {
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Слишком много неверных попыток — вход заблокирован до " + time(until) + ". Попробуйте позже.");
    }

    String time(Instant at) {
        return HHMM.format(at.atZone(zone));
    }
}
