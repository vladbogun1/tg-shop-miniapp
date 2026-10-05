package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.UnauthorizedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.OptionalLong;

/**
 * «Мой аккаунт»: what a signed-in admin can do with their own account.
 *
 * <p>Wrong passwords / codes here are 400 (not 401/403 — the panel treats those as «session gone»
 * and logs out) and count towards the same per-account lock as the sign-in. Password change and
 * 2FA re-setup end every other session and forget every trusted device; the caller gets a fresh
 * access token so this one device stays signed in.
 */
@Service
public class AdminAccountService {

    public static final int MIN_PASSWORD_LENGTH = 10;
    /** BCrypt only looks at the first 72 bytes (and Spring refuses longer input). */
    public static final int MAX_PASSWORD_BYTES = 72;
    public static final int HISTORY_SIZE = 20;

    public record Profile(long telegramUserId, String name, String username, String role, boolean superAdmin,
                          boolean passwordSet, Instant passwordChangedAt, boolean totpEnabled, Instant totpEnabledAt,
                          int trustedDevices, int trustedDeviceDays) {
    }

    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminTotp totp;
    private final AdminLockout lockout;
    private final AdminSessions sessions;
    private final TrustedDeviceService trustedDevices;
    private final AdminLoginLogService loginLog;
    private final AdminAuditService audit;
    private final JwtService jwtService;
    private final AdminTokenValidator adminTokenValidator;

    public AdminAccountService(AdminUserRepository adminUserRepository, PasswordEncoder passwordEncoder,
                               AdminTotp totp, AdminLockout lockout, AdminSessions sessions,
                               TrustedDeviceService trustedDevices, AdminLoginLogService loginLog,
                               AdminAuditService audit, JwtService jwtService,
                               AdminTokenValidator adminTokenValidator) {
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.totp = totp;
        this.lockout = lockout;
        this.sessions = sessions;
        this.trustedDevices = trustedDevices;
        this.loginLog = loginLog;
        this.audit = audit;
        this.jwtService = jwtService;
        this.adminTokenValidator = adminTokenValidator;
    }

    public Profile profile(long adminId) {
        AdminUser a = admin(adminId);
        return new Profile(a.getTelegramUserId(), a.getName(), a.getUsername(), a.getRole().name(),
                a.isSuperAdmin(), a.getPasswordHash() != null, a.getPasswordChangedAt(), a.isTotpEnabled(),
                a.getTotpEnabledAt(), trustedDevices.countActive(adminId, a.getTokenVersion()),
                trustedDevices.days());
    }

    public List<AdminLoginLogService.Entry> history(long adminId) {
        return loginLog.recent(adminId, HISTORY_SIZE);
    }

    /** @return a new access token for the calling device (all other sessions are gone) */
    public String changePassword(long adminId, String currentPassword, String newPassword, String code,
                                 ClientInfo client) {
        AdminUser a = admin(adminId);
        if (a.getPasswordHash() == null || a.getUsername() == null) {
            throw new BadRequestException("У этой учётки нет входа по паролю — только через Telegram",
                    "NO_PASSWORD_LOGIN");
        }
        validateNewPassword(newPassword, currentPassword);
        if (!passwordEncoder.matches(currentPassword == null ? "" : currentPassword, a.getPasswordHash())) {
            fail(adminId, client, "неверный текущий пароль при смене пароля");
            throw new BadRequestException("Текущий пароль неверный", "BAD_PASSWORD");
        }
        requireCode(a, code, client, "смена пароля");

        AdminUser fresh = admin(adminId);
        fresh.setPasswordHash(passwordEncoder.encode(newPassword));
        fresh.setPasswordChangedAt(Instant.now());
        adminUserRepository.save(fresh);
        int devices = sessions.revokeEverything(adminId);
        lockout.reset(adminId);
        audit.recordFor(adminId, "ADMIN_PASSWORD_CHANGE", "AUTH", fresh.getUsername(),
                "пароль изменён; другие сессии завершены, забыто доверенных устройств: " + devices
                        + ", IP " + client.ip());
        return newToken(adminId);
    }

    /** Re-setup, step 1: the current code proves the old phone; returns the new secret. */
    public AdminTotp.NewSecret startTotpReset(long adminId, String currentCode, ClientInfo client) {
        AdminUser a = admin(adminId);
        if (!a.isTotpEnabled()) {
            throw new BadRequestException("Двухфакторная защита ещё не настроена", "TOTP_NOT_SET");
        }
        requireCode(a, currentCode, client, "перенастройка 2FA");
        AdminUser fresh = admin(adminId);
        AdminTotp.NewSecret secret = totp.createPending(fresh);
        adminUserRepository.save(fresh);
        return secret;
    }

    /** Re-setup, step 2: a code from the NEW secret switches over. */
    public String confirmTotpReset(long adminId, String newCode, ClientInfo client) {
        AdminUser a = admin(adminId);
        if (!totp.hasFreshPending(a)) {
            throw new BadRequestException("Перенастройка устарела — начните заново", "TOTP_SETUP_EXPIRED");
        }
        OptionalLong step = totp.verifyPending(a, newCode);
        if (step.isEmpty()) {
            fail(adminId, client, "неверный код при перенастройке 2FA");
            throw new BadRequestException("Неверный код из приложения", "BAD_CODE");
        }
        totp.activatePending(a, step.getAsLong());
        adminUserRepository.save(a);
        int devices = sessions.revokeEverything(adminId);
        lockout.reset(adminId);
        audit.recordFor(adminId, "ADMIN_2FA_RESET", "AUTH", String.valueOf(adminId),
                "2FA перенастроена на новое устройство; другие сессии завершены, забыто доверенных устройств: "
                        + devices + ", IP " + client.ip());
        return newToken(adminId);
    }

    public int forgetDevices(long adminId) {
        int n = trustedDevices.revokeAll(adminId);
        audit.recordFor(adminId, "ADMIN_DEVICES_FORGET", "AUTH", String.valueOf(adminId),
                "«Забыть все устройства»: забыто " + n);
        return n;
    }

    /** «Выйти на всех устройствах»: every token, half-finished sign-in and trusted device. */
    public void logoutEverywhere(long adminId) {
        int n = sessions.revokeEverything(adminId);
        audit.recordFor(adminId, "ADMIN_LOGOUT_ALL", "ADMIN", String.valueOf(adminId),
                "выход на всех устройствах, забыто доверенных устройств: " + n);
    }

    static void validateNewPassword(String newPassword, String currentPassword) {
        if (newPassword == null || newPassword.codePointCount(0, newPassword.length()) < MIN_PASSWORD_LENGTH) {
            throw new BadRequestException("Новый пароль — минимум " + MIN_PASSWORD_LENGTH + " символов",
                    "PASSWORD_TOO_SHORT");
        }
        if (newPassword.getBytes(StandardCharsets.UTF_8).length > MAX_PASSWORD_BYTES) {
            throw new BadRequestException("Новый пароль слишком длинный (до 72 байт)", "PASSWORD_TOO_LONG");
        }
        if (newPassword.isBlank() || newPassword.strip().length() != newPassword.length()) {
            throw new BadRequestException("Пароль не должен начинаться или заканчиваться пробелом", "PASSWORD_SPACES");
        }
        if (newPassword.equals(currentPassword)) {
            throw new BadRequestException("Новый пароль совпадает с текущим", "PASSWORD_SAME");
        }
    }

    private void requireCode(AdminUser a, String code, ClientInfo client, String what) {
        if (!totp.verifyActive(a, code)) {
            fail(a.getTelegramUserId(), client, "неверный код 2FA: " + what);
            throw new BadRequestException("Неверный код из приложения", "BAD_CODE");
        }
    }

    private void fail(long adminId, ClientInfo client, String details) {
        audit.recordFor(adminId, "ADMIN_ACCOUNT_FAIL", "AUTH", String.valueOf(adminId), details + ", IP " + client.ip());
        lockout.registerFailure(adminId, LoginMethod.PASSWORD, client);
    }

    private String newToken(long adminId) {
        adminTokenValidator.invalidate(adminId);
        AdminUser a = admin(adminId);
        return jwtService.issueToken(adminId, Role.ADMIN, a.getTokenVersion());
    }

    private AdminUser admin(long adminId) {
        return adminUserRepository.findByTelegramUserIdAndActiveTrue(adminId)
                .orElseThrow(() -> new UnauthorizedException("not authenticated"));
    }
}
