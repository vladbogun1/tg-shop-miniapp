package com.maxsolch.shop.adminauth;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shop.adminauth.AdminLoginLogService.Result;
import com.maxsolch.shop.adminauth.AdminLoginLogService.SecondFactor;
import com.maxsolch.shop.adminauth.PreAuthTokens.PreAuth;
import com.maxsolch.shop.adminauth.PreAuthTokens.Stage;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.InitDataException;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.security.TelegramUser;
import com.maxsolch.shop.security.TgInitDataValidator;
import com.maxsolch.shop.service.AuthService;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.UnauthorizedException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Two-step admin sign-in.
 *
 * <pre>
 *  1. POST /api/auth/admin/login     {username, password}  ─┐
 *     POST /api/auth/admin/telegram  {initData}             ─┴→ first factor
 *        → OK            (trusted device cookie for this admin: access token right away)
 *        → TOTP_REQUIRED (pre-auth token, 5 min)
 *        → SETUP_REQUIRED(pre-auth token; 2FA is mandatory and not set up yet)
 *  2. POST /api/auth/admin/2fa/verify   {preAuthToken, code, trustDevice} → access token
 *     POST /api/auth/admin/2fa/setup    {preAuthToken}                    → secret + otpauth URI
 *     POST /api/auth/admin/2fa/confirm  {preAuthToken, code, trustDevice} → access token
 * </pre>
 *
 * Wrong passwords and codes count towards the per-account lock ({@link AdminLockout}); every attempt
 * goes to the sign-in history ({@link AdminLoginLogService}) and the audit log; a finished sign-in
 * from a new device triggers a Telegram alert.
 */
@Slf4j
@Service
public class AdminAuthService {

    public enum Status { OK, TOTP_REQUIRED, SETUP_REQUIRED }

    /** What a sign-in step produced. {@code trustedDeviceToken} goes into the cookie, never the body. */
    public record Outcome(Status status, String accessToken, String preAuthToken, String trustedDeviceToken,
                          String adminName) {

        static Outcome needs(Status status, String preAuthToken, String name) {
            return new Outcome(status, null, preAuthToken, null, name);
        }
    }

    public record SetupInfo(String secret, String otpauthUri, String account, String issuer) {
    }

    private static final String BAD_CREDENTIALS = "Неверный логин или пароль";
    private static final String PREAUTH_EXPIRED = "Время на ввод кода вышло — войдите заново";

    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final TgInitDataValidator initDataValidator;
    private final AuthService authService;
    private final JwtService jwtService;
    private final PreAuthTokens preAuthTokens;
    private final AdminTotp totp;
    private final AdminLockout lockout;
    private final TrustedDeviceService trustedDevices;
    private final AdminLoginLogService loginLog;
    private final AdminAuditService audit;
    private final AdminSecurityAlerts alerts;

    /** Compared against for an unknown login, so its timing matches a wrong password. */
    private final String dummyPasswordHash;

    /**
     * Failures per unknown login name: after {@value AdminLockout#MAX_FAILURES} the answer becomes the
     * same «locked» one a real account gets, so the lock does not reveal which logins exist.
     */
    private final Cache<String, AtomicInteger> unknownLoginFailures = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(AdminLockout.LOCK_DURATION)
            .build();

    public AdminAuthService(AdminUserRepository adminUserRepository,
                            PasswordEncoder passwordEncoder,
                            TgInitDataValidator initDataValidator,
                            @Lazy AuthService authService,
                            JwtService jwtService,
                            PreAuthTokens preAuthTokens,
                            AdminTotp totp,
                            AdminLockout lockout,
                            TrustedDeviceService trustedDevices,
                            AdminLoginLogService loginLog,
                            AdminAuditService audit,
                            AdminSecurityAlerts alerts) {
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.initDataValidator = initDataValidator;
        this.authService = authService;
        this.jwtService = jwtService;
        this.preAuthTokens = preAuthTokens;
        this.totp = totp;
        this.lockout = lockout;
        this.trustedDevices = trustedDevices;
        this.loginLog = loginLog;
        this.audit = audit;
        this.alerts = alerts;
        this.dummyPasswordHash = passwordEncoder.encode("no-such-admin-" + UUID.randomUUID());
    }

    // ------------------------------------------------------------------ first factor

    public Outcome passwordLogin(String username, String password, String deviceCookie, ClientInfo client) {
        String login = username == null ? "" : username.trim();
        String unknownKey = login.toLowerCase(Locale.ROOT);
        AtomicInteger unknownFailures = unknownLoginFailures.getIfPresent(unknownKey);
        if (unknownFailures != null && unknownFailures.get() >= AdminLockout.MAX_FAILURES) {
            loginLog.record(null, login, LoginMethod.PASSWORD, Result.LOCKED, null, client);
            throw lockout.lockedError(Instant.now().plus(Duration.ofMinutes(15)));
        }
        AdminUser admin = adminUserRepository.findByUsername(login).filter(AdminUser::isActive).orElse(null);
        if (admin != null && lockout.isLocked(admin)) {
            loginLog.record(admin.getTelegramUserId(), login, LoginMethod.PASSWORD, Result.LOCKED, null, client);
            audit.recordLogin(false, "пароль (учётка заблокирована)", admin.getTelegramUserId(), login, client.ip());
            throw lockout.lockedError(admin.getLockedUntil());
        }
        String hash = admin == null || admin.getPasswordHash() == null ? dummyPasswordHash : admin.getPasswordHash();
        boolean matches = passwordEncoder.matches(password == null ? "" : password, hash);
        if (admin == null || admin.getPasswordHash() == null || !matches) {
            audit.recordLogin(false, "пароль", admin == null ? null : admin.getTelegramUserId(), login, client.ip());
            if (admin == null) {
                unknownLoginFailures.get(unknownKey, k -> new AtomicInteger()).incrementAndGet();
                loginLog.record(null, login, LoginMethod.PASSWORD, Result.UNKNOWN_LOGIN, null, client);
                throw new UnauthorizedException(BAD_CREDENTIALS);
            }
            loginLog.record(admin.getTelegramUserId(), login, LoginMethod.PASSWORD, Result.BAD_PASSWORD, null, client);
            lockout.registerFailure(admin.getTelegramUserId(), LoginMethod.PASSWORD, client)
                    .ifPresent(until -> {
                        throw lockout.lockedError(until);
                    });
            throw new UnauthorizedException(BAD_CREDENTIALS);
        }
        return afterFirstFactor(admin, LoginMethod.PASSWORD, deviceCookie, client);
    }

    public Outcome telegramLogin(String initData, String deviceCookie, ClientInfo client) {
        TelegramUser tgUser;
        try {
            tgUser = initDataValidator.validateForAdmin(initData);
        } catch (InitDataException e) {
            loginLog.record(null, null, LoginMethod.TELEGRAM, Result.BAD_TELEGRAM, null, client);
            audit.recordLogin(false, "telegram", null, null, client.ip());
            throw e;
        }
        AdminUser admin = adminUserRepository.findByTelegramUserIdAndActiveTrue(tgUser.id()).orElse(null);
        if (admin == null) {
            loginLog.record(null, "tg:" + tgUser.id(), LoginMethod.TELEGRAM, Result.NOT_ADMIN, null, client);
            audit.recordLogin(false, "telegram", null, "tg:" + tgUser.id(), client.ip());
            throw new InitDataException("not an admin");
        }
        if (lockout.isLocked(admin)) {
            loginLog.record(admin.getTelegramUserId(), null, LoginMethod.TELEGRAM, Result.LOCKED, null, client);
            audit.recordLogin(false, "telegram (учётка заблокирована)", admin.getTelegramUserId(), null, client.ip());
            throw lockout.lockedError(admin.getLockedUntil());
        }
        try {
            authService.recordBotUser(tgUser); // keep the profile snapshot fresh
        } catch (Exception e) {
            log.debug("Admin profile refresh failed: {}", e.getMessage());
        }
        return afterFirstFactor(admin, LoginMethod.TELEGRAM, deviceCookie, client);
    }

    private Outcome afterFirstFactor(AdminUser admin, LoginMethod method, String deviceCookie, ClientInfo client) {
        String name = displayName(admin);
        if (!admin.isTotpEnabled()) {
            return Outcome.needs(Status.SETUP_REQUIRED,
                    preAuthTokens.issue(admin.getTelegramUserId(), admin.getTokenVersion(), method, Stage.SETUP), name);
        }
        if (trustedDevices.isTrusted(admin.getTelegramUserId(), admin.getTokenVersion(), deviceCookie)) {
            return complete(admin.getTelegramUserId(), method, SecondFactor.TRUSTED_DEVICE, false, client);
        }
        return Outcome.needs(Status.TOTP_REQUIRED,
                preAuthTokens.issue(admin.getTelegramUserId(), admin.getTokenVersion(), method, Stage.VERIFY), name);
    }

    // ------------------------------------------------------------------ second factor

    public Outcome verify(String preAuthToken, String code, boolean trustDevice, ClientInfo client) {
        PreAuth pre = preAuth(preAuthToken, Stage.VERIFY);
        AdminUser admin = activeAdmin(pre);
        lockout.ensureNotLocked(admin);
        if (!admin.isTotpEnabled()) {
            throw new UnauthorizedException(PREAUTH_EXPIRED);
        }
        if (!totp.verifyActive(admin, code)) {
            failCode(admin.getTelegramUserId(), pre.method(), client);
        }
        preAuthTokens.consume(pre);
        return complete(admin.getTelegramUserId(), pre.method(), SecondFactor.TOTP, trustDevice, client);
    }

    /** First-time setup: a new secret for the QR (replaces an unconfirmed one). */
    public SetupInfo setup(String preAuthToken) {
        PreAuth pre = preAuth(preAuthToken, Stage.SETUP);
        AdminUser admin = activeAdmin(pre);
        lockout.ensureNotLocked(admin);
        if (admin.isTotpEnabled()) {
            throw new ConflictException("Двухфакторная защита уже настроена — войдите заново", "TOTP_ALREADY_SET");
        }
        AdminTotp.NewSecret secret = totp.createPending(admin);
        adminUserRepository.save(admin);
        return new SetupInfo(secret.secret(), secret.otpauthUri(), AdminTotp.accountLabel(admin), totp.issuer());
    }

    public Outcome confirmSetup(String preAuthToken, String code, boolean trustDevice, ClientInfo client) {
        PreAuth pre = preAuth(preAuthToken, Stage.SETUP);
        AdminUser admin = activeAdmin(pre);
        lockout.ensureNotLocked(admin);
        if (admin.isTotpEnabled()) {
            throw new ConflictException("Двухфакторная защита уже настроена — войдите заново", "TOTP_ALREADY_SET");
        }
        if (!totp.hasFreshPending(admin)) {
            throw new ConflictException("Настройка устарела — начните заново", "TOTP_SETUP_EXPIRED");
        }
        OptionalLong step = totp.verifyPending(admin, code);
        if (step.isEmpty()) {
            failCode(admin.getTelegramUserId(), pre.method(), client);
        }
        totp.activatePending(admin, step.getAsLong());
        adminUserRepository.save(admin);
        preAuthTokens.consume(pre);
        audit.recordFor(admin.getTelegramUserId(), "ADMIN_2FA_SETUP", "AUTH", String.valueOf(admin.getTelegramUserId()),
                "двухфакторная защита включена (приложение-аутентификатор), IP " + client.ip());
        return complete(admin.getTelegramUserId(), pre.method(), SecondFactor.SETUP, trustDevice, client);
    }

    /**
     * The /invite page finished (password set, 2FA set up or the current code given): the same
     * finish as a normal sign-in — token, history, trusted device, new-device alert.
     */
    public Outcome completeInvite(long adminId, boolean setUpTwoFactor, boolean trustDevice, ClientInfo client) {
        return complete(adminId, LoginMethod.INVITE, setUpTwoFactor ? SecondFactor.SETUP : SecondFactor.TOTP,
                trustDevice, client);
    }

    // ------------------------------------------------------------------ helpers

    private Outcome complete(long adminId, LoginMethod method, SecondFactor second, boolean trustDevice,
                             ClientInfo client) {
        lockout.reset(adminId);
        // Fresh read: earlier bulk updates (replay step, failure count) detached the old entity.
        AdminUser admin = adminUserRepository.findByTelegramUserIdAndActiveTrue(adminId)
                .orElseThrow(() -> new UnauthorizedException(PREAUTH_EXPIRED));
        String accessToken = jwtService.issueToken(adminId, Role.ADMIN, admin.getTokenVersion());
        AdminLoginLogService.Recorded rec = loginLog.record(adminId, admin.getUsername(), method, Result.OK,
                second, client);
        String deviceToken = null;
        if (trustDevice && second != SecondFactor.TRUSTED_DEVICE) {
            deviceToken = trustedDevices.issue(adminId, admin.getTokenVersion(), client, rec.place());
        }
        String how = method.label() + switch (second) {
            case TOTP -> " + код";
            case SETUP -> " + настройка 2FA";
            case TRUSTED_DEVICE -> " + доверенное устройство";
        } + (deviceToken != null ? ", устройство запомнено" : "");
        audit.recordFor(adminId, "ADMIN_LOGIN_OK", "AUTH", admin.getUsername(),
                "способ: " + how + ", IP " + client.ip() + ", " + rec.place() + ", " + rec.device());
        if (rec.newDevice()) {
            try {
                alerts.newDeviceLogin(adminId, method, rec.place(), rec.device(), client.ip(), Instant.now());
            } catch (Exception e) {
                log.debug("New-device alert failed: {}", e.getMessage());
            }
        }
        return new Outcome(Status.OK, accessToken, null, deviceToken, displayName(admin));
    }

    /** Records a wrong code and throws (the «locked» error when this one locked the account). */
    private void failCode(long adminId, LoginMethod method, ClientInfo client) {
        loginLog.record(adminId, null, method, Result.BAD_CODE, null, client);
        audit.recordFor(adminId, "ADMIN_LOGIN_FAIL", "AUTH", null,
                "способ: " + method.label() + ", неверный код 2FA, IP " + client.ip());
        lockout.registerFailure(adminId, method, client).ifPresent(until -> {
            throw lockout.lockedError(until);
        });
        throw new UnauthorizedException("Неверный код");
    }

    private PreAuth preAuth(String token, Stage expected) {
        return preAuthTokens.parse(token)
                .filter(p -> p.stage() == expected)
                .orElseThrow(() -> new UnauthorizedException(PREAUTH_EXPIRED));
    }

    /** The admin behind a pre-auth token, still active and with the same token version. */
    private AdminUser activeAdmin(PreAuth pre) {
        return adminUserRepository.findByTelegramUserIdAndActiveTrue(pre.adminId())
                .filter(a -> a.getTokenVersion() == pre.tokenVersion())
                .orElseThrow(() -> new UnauthorizedException(PREAUTH_EXPIRED));
    }

    static String displayName(AdminUser admin) {
        if (admin.getName() != null && !admin.getName().isBlank()) {
            return admin.getName().trim();
        }
        if (admin.getUsername() != null && !admin.getUsername().isBlank()) {
            return admin.getUsername().trim();
        }
        return "Админ";
    }
}
