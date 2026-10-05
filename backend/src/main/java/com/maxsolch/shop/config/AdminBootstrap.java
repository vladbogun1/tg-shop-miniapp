package com.maxsolch.shop.config;

import com.maxsolch.shop.adminauth.AdminAuthKeys;
import com.maxsolch.shop.adminauth.AdminTotp;
import com.maxsolch.shop.adminauth.TrustedDeviceService;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * First admin and the emergency door, driven by {@code ADMIN_LOGIN} / {@code ADMIN_PASSWORD} /
 * {@code ADMIN_BOOTSTRAP_TG_ID}.
 *
 * <ul>
 *   <li><b>Bootstrap.</b> Only while there is NO active admin with a password: the row
 *       {@code ADMIN_BOOTSTRAP_TG_ID} gets the login and password (SUPER_ADMIN when new). After that
 *       the env password is never applied again — it used to be rewritten on every start, so the
 *       password could only ever be the one in {@code .env}, and changing it in the panel was
 *       impossible.</li>
 *   <li><b>Emergency reset</b> ({@code ADMIN_EMERGENCY_RESET=true}, docs/ADMIN-2FA.md): the bootstrap
 *       admin gets {@code ADMIN_PASSWORD} back, loses 2FA, every session and trusted device, and is
 *       unlocked; the next sign-in sets 2FA up again. Done once per {@code ADMIN_PASSWORD} value
 *       (an HMAC fingerprint goes to {@code admin_emergency_resets}), so a flag forgotten in
 *       {@code .env} does not wipe 2FA on every restart.</li>
 * </ul>
 */
@Slf4j
@Component
public class AdminBootstrap implements CommandLineRunner {

    private final AppProperties props;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminTokenValidator adminTokenValidator;
    private final TrustedDeviceService trustedDevices;
    private final AdminAuthKeys keys;
    private final AdminAuditService audit;
    private final JdbcTemplate jdbc;

    public AdminBootstrap(AppProperties props,
                          AdminUserRepository adminUserRepository,
                          PasswordEncoder passwordEncoder,
                          AdminTokenValidator adminTokenValidator,
                          TrustedDeviceService trustedDevices,
                          AdminAuthKeys keys,
                          AdminAuditService audit,
                          JdbcTemplate jdbc) {
        this.props = props;
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminTokenValidator = adminTokenValidator;
        this.trustedDevices = trustedDevices;
        this.keys = keys;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    @Override
    public void run(String... args) {
        String login = trimToNull(props.getSecurity().getAdminLogin());
        String password = props.getSecurity().getAdminPassword();
        boolean hasCredentials = login != null && password != null && !password.isBlank();
        if (props.getSecurity().isAdminEmergencyReset()) {
            if (!hasCredentials) {
                log.error("ADMIN_EMERGENCY_RESET=true, но ADMIN_LOGIN / ADMIN_PASSWORD не заданы — сброс не выполнен");
                return;
            }
            emergencyReset(login, password);
            return;
        }
        if (!hasCredentials) {
            log.info("Admin bootstrap skipped (ADMIN_LOGIN / ADMIN_PASSWORD not set)");
            return;
        }
        if (adminUserRepository.existsByActiveTrueAndPasswordHashIsNotNull()) {
            log.info("Admin bootstrap: an admin with a password exists — ADMIN_PASSWORD is not applied "
                    + "(the password is changed in «Мой аккаунт»; lost access: ADMIN_EMERGENCY_RESET, docs/ADMIN-2FA.md)");
            return;
        }
        long tgId = props.getSecurity().getAdminBootstrapTgId();
        AdminUser admin = adminUserRepository.findById(tgId).orElseGet(() -> newAdmin(tgId));
        admin.setUsername(login);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setPasswordChangedAt(Instant.now());
        admin.setActive(true);
        admin.setTokenVersion(admin.getTokenVersion() + 1);
        adminUserRepository.save(admin);
        adminTokenValidator.invalidate(tgId);
        log.info("Admin bootstrap: login '{}' created (tg id {}); 2FA is set up at the first sign-in", login, tgId);
    }

    private void emergencyReset(String login, String password) {
        long tgId = props.getSecurity().getAdminBootstrapTgId();
        String marker = keys.fingerprint("emergency-reset:" + tgId + ":" + password);
        Integer done = jdbc.queryForObject("SELECT COUNT(*) FROM admin_emergency_resets WHERE marker = ?",
                Integer.class, marker);
        if (done != null && done > 0) {
            log.warn("ADMIN_EMERGENCY_RESET=true: сброс с этим ADMIN_PASSWORD уже выполнялся — повторно не делаю. "
                    + "Уберите ADMIN_EMERGENCY_RESET из .env (для нового сброса задайте новый ADMIN_PASSWORD).");
            return;
        }
        var clash = adminUserRepository.findByUsername(login).filter(a -> a.getTelegramUserId() != tgId);
        if (clash.isPresent()) {
            log.error("ADMIN_EMERGENCY_RESET: логин '{}' уже занят другим админом (tg {}) — сброс не выполнен. "
                    + "Укажите в ADMIN_LOGIN логин главного админа.", login, clash.get().getTelegramUserId());
            return;
        }
        AdminUser admin = adminUserRepository.findById(tgId).orElseGet(() -> newAdmin(tgId));
        admin.setUsername(login);
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setPasswordChangedAt(Instant.now());
        admin.setActive(true);
        AdminTotp.clear(admin);
        admin.setFailedAttempts(0);
        admin.setLockedUntil(null);
        admin.setTokenVersion(admin.getTokenVersion() + 1);
        adminUserRepository.save(admin);
        int devices = trustedDevices.revokeAll(tgId);
        adminTokenValidator.invalidate(tgId);
        jdbc.update("INSERT INTO admin_emergency_resets (admin_id, marker) VALUES (?, ?)", tgId, marker);
        audit.recordFor(tgId, "ADMIN_EMERGENCY_RESET", "AUTH", login,
                "аварийный сброс при старте (ADMIN_EMERGENCY_RESET): пароль из ADMIN_PASSWORD, 2FA сброшена, "
                        + "все сессии завершены, забыто доверенных устройств: " + devices);
        log.warn("╔══════════════════════════════════════════════════════════════════════╗");
        log.warn("║  АВАРИЙНЫЙ СБРОС АДМИНА ВЫПОЛНЕН (ADMIN_EMERGENCY_RESET=true)        ║");
        log.warn("║  login '{}' (tg {}): пароль = ADMIN_PASSWORD, 2FA сброшена,", login, tgId);
        log.warn("║  все сессии и доверенные устройства завершены.                       ║");
        log.warn("║  Войдите и настройте 2FA заново, затем УБЕРИТЕ флаг из .env.         ║");
        log.warn("╚══════════════════════════════════════════════════════════════════════╝");
    }

    private static AdminUser newAdmin(long tgId) {
        AdminUser a = new AdminUser();
        a.setTelegramUserId(tgId);
        a.setRole(AdminRole.SUPER_ADMIN);
        a.setActive(true);
        a.setName("Bootstrap admin");
        return a;
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
