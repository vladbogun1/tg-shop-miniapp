package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionOperations;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.OptionalLong;
import java.util.regex.Pattern;

/**
 * Invite links to the admin panel (stage 2).
 *
 * <p><b>Created</b> by the super admin («Пригласить», «Сбросить пароль», «Отправить заново»): a random
 * 256-bit token, of which only the SHA-256 is stored; valid {@value #TTL_HOURS} h; any earlier open
 * invite of the same Telegram user is revoked. The shop bot sends the link with a button; when it
 * cannot (no bot, the person never pressed /start) the link goes back to the super admin.
 *
 * <p><b>Accepted</b> on /invite/&lt;token&gt; without signing in, in two steps:
 * <ol>
 *   <li>{@link #accept}: login (unique, {@code [A-Za-z0-9._-]{3,32}}) and password (≥ 10) are kept on
 *       the invite row, not on the account; for an account without 2FA a new TOTP secret is made;</li>
 *   <li>{@link #complete}: a code from the new secret (or, for an account that already has 2FA, the
 *       current code). Only then the invite is burnt (atomically — a second tab loses), the account is
 *       created / updated, every other session of it ends, and the person is signed in.</li>
 * </ol>
 * {@value #MAX_CODE_FAILURES} wrong codes revoke the invite. Unknown, used, revoked and expired
 * tokens all get the same answer.
 */
@Slf4j
@Service
public class AdminInviteService {

    public static final int TTL_HOURS = 48;
    public static final int MAX_CODE_FAILURES = 5;
    /** Login + password typed but no code yet: after this the first step starts over. */
    static final Duration PENDING_TTL = Duration.ofMinutes(30);
    static final Pattern USERNAME = Pattern.compile("^[A-Za-z0-9._-]{3,32}$");
    /** base64url of 32 bytes. */
    private static final Pattern TOKEN = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    static final String INVALID = "Ссылка недействительна или устарела — попросите главного админа прислать новую";

    /** What /invite shows before the form. */
    public record InviteInfo(String kind, String name, String role, String username, boolean loginEditable,
                             boolean twoFactorSetup, Instant expiresAt) {
    }

    /** Step 1 done: {@code SETUP} (QR in {@code setup}) or {@code VERIFY} (the current code). */
    public record AcceptResult(String next, AdminAuthService.SetupInfo setup) {
    }

    /** A new invite: {@code link} / {@code path} only when the bot did NOT deliver it. */
    public record Created(long inviteId, AdminInvite.Kind kind, boolean delivered, String link, String path,
                          Instant expiresAt) {
    }

    private final AdminInviteStore store;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final AdminTotp totp;
    private final AdminSessions sessions;
    private final AdminTokenValidator adminTokenValidator;
    private final AdminAuthService authService;
    private final AdminAuditService audit;
    private final AdminTeamMessenger messenger;
    private final TransactionOperations tx;
    private final String adminBaseUrl;
    private final Clock clock;

    @Autowired
    public AdminInviteService(AdminInviteStore store, AdminUserRepository adminUserRepository,
                              PasswordEncoder passwordEncoder, AdminTotp totp, AdminSessions sessions,
                              AdminTokenValidator adminTokenValidator, AdminAuthService authService,
                              AdminAuditService audit, @Lazy AdminTeamMessenger messenger,
                              PlatformTransactionManager txManager, AppProperties props) {
        this(store, adminUserRepository, passwordEncoder, totp, sessions, adminTokenValidator, authService, audit,
                messenger, new TransactionTemplate(txManager), props.getAdminBaseUrl(), Clock.systemUTC());
    }

    AdminInviteService(AdminInviteStore store, AdminUserRepository adminUserRepository,
                       PasswordEncoder passwordEncoder, AdminTotp totp, AdminSessions sessions,
                       AdminTokenValidator adminTokenValidator, AdminAuthService authService,
                       AdminAuditService audit, AdminTeamMessenger messenger, TransactionOperations tx,
                       String adminBaseUrl, Clock clock) {
        this.store = store;
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
        this.totp = totp;
        this.sessions = sessions;
        this.adminTokenValidator = adminTokenValidator;
        this.authService = authService;
        this.audit = audit;
        this.messenger = messenger;
        this.tx = tx;
        this.adminBaseUrl = adminBaseUrl == null ? "" : adminBaseUrl.trim().replaceAll("/+$", "");
        this.clock = clock;
    }

    // ================================================================== creation (super admin)

    /** Revokes older open invites of {@code telegramUserId}, makes a new one and tries the bot. */
    public Created create(AdminInvite.Kind kind, long telegramUserId, String name, AdminRole role, long invitedBy) {
        Instant now = clock.instant();
        store.revokeOpenFor(telegramUserId, now);
        String token = newToken();
        Instant expires = now.plus(Duration.ofHours(TTL_HOURS));
        long id = store.insert(new AdminInvite.Draft(hash(token), kind, telegramUserId, name, role, invitedBy, expires));
        String path = "/invite/" + token;
        String link = adminBaseUrl.isEmpty() ? null : adminBaseUrl + path;
        boolean delivered = false;
        if (link != null && link.startsWith("https://")) {
            try {
                delivered = messenger.sendInvite(telegramUserId, link, kind, roleLabel(role), inviterName(invitedBy),
                        expires);
            } catch (Exception e) {
                log.info("Invite {} for {} not delivered by the bot: {}", id, telegramUserId, e.getMessage());
            }
        }
        store.markDelivered(id, delivered);
        return delivered
                ? new Created(id, kind, true, null, null, expires)
                : new Created(id, kind, false, link, path, expires);
    }

    // ================================================================== acceptance (public)

    public InviteInfo check(String token) {
        AdminInvite inv = liveInvite(token);
        AdminUser target = targetOf(inv);
        String username = target == null ? null : target.getUsername();
        boolean editable = inv.kind() != AdminInvite.Kind.PASSWORD_RESET || username == null;
        String name = inv.kind() == AdminInvite.Kind.NEW || target == null ? inv.name() : AdminAuthService.displayName(target);
        AdminRole role = target == null ? inv.role() : target.getRole();
        return new InviteInfo(inv.kind().name(), name, roleLabel(role), editable ? null : username, editable,
                needsSetup(target), inv.expiresAt());
    }

    /** Step 1: login and password (kept on the invite until the code) → SETUP with a QR, or VERIFY. */
    public AcceptResult accept(String token, String username, String password) {
        AdminInvite inv = liveInvite(token);
        AdminUser target = targetOf(inv);
        String login;
        if (inv.kind() == AdminInvite.Kind.PASSWORD_RESET && target != null && target.getUsername() != null) {
            login = target.getUsername();
        } else {
            login = validUsername(username);
            ensureUsernameFree(login, inv);
        }
        AdminAccountService.validateNewPassword(password, null);
        String hash = passwordEncoder.encode(password);
        if (!needsSetup(target)) {
            store.savePending(inv.id(), login, hash, null, clock.instant());
            return new AcceptResult("VERIFY", null);
        }
        AdminTotp.Detached secret = totp.createDetached(inv.telegramUserId(), login);
        store.savePending(inv.id(), login, hash, secret.encrypted(), clock.instant());
        return new AcceptResult("SETUP",
                new AdminAuthService.SetupInfo(secret.secret(), secret.otpauthUri(), login, totp.issuer()));
    }

    /** Step 2: the code. Burns the invite, activates the account and signs the person in. */
    public AdminAuthService.Outcome complete(String token, String code, boolean trustDevice, ClientInfo client) {
        AdminInvite inv = liveInvite(token);
        Instant now = clock.instant();
        if (inv.pendingPasswordHash() == null || inv.pendingUsername() == null || inv.pendingAt() == null
                || inv.pendingAt().plus(PENDING_TTL).isBefore(now)) {
            throw new BadRequestException("Шаг с логином и паролем устарел — начните заново", "INVITE_STEP_EXPIRED");
        }
        AdminUser target = targetOf(inv);
        boolean setup = needsSetup(target);
        long id = inv.telegramUserId();
        long step;
        if (setup) {
            OptionalLong s = totp.verifyEncrypted(inv.pendingTotpEnc(), id, code);
            if (s.isEmpty()) {
                wrongCode(inv, client);
            }
            step = s.orElseThrow();
        } else {
            if (!totp.verifyActive(target, code)) { // records the step itself (replay protection)
                wrongCode(inv, client);
            }
            step = -1;
        }

        tx.executeWithoutResult(status -> apply(inv, step, setup, now));
        sessions.revokeEverything(id);
        adminTokenValidator.invalidate(id);
        audit.recordFor(id, "ADMIN_INVITE_ACCEPTED", "ADMIN", String.valueOf(id),
                switch (inv.kind()) {
                    case NEW -> "приглашение принято: новый админ «" + inv.pendingUsername() + "»";
                    case CREDENTIALS -> "приглашение принято: выдан логин «" + inv.pendingUsername() + "»";
                    case PASSWORD_RESET -> "пароль задан по ссылке сброса";
                } + (setup ? ", 2FA настроена" : "") + ", IP " + client.ip());
        return authService.completeInvite(id, setup, trustDevice, client);
    }

    private void apply(AdminInvite inv, long step, boolean setup, Instant now) {
        long id = inv.telegramUserId();
        // Fresh checks inside the transaction: somebody may have taken the login / made the account.
        AdminUser target = adminUserRepository.findById(id).orElse(null);
        if (inv.kind() == AdminInvite.Kind.NEW ? target != null : target == null || !target.isActive()) {
            throw new BadRequestException(INVALID, "INVITE_INVALID");
        }
        boolean keepsLogin = target != null && target.getUsername() != null
                && target.getUsername().equalsIgnoreCase(inv.pendingUsername());
        if (!keepsLogin) {
            adminUserRepository.findByUsername(inv.pendingUsername()).ifPresent(other -> {
                throw new ConflictException("Логин «" + inv.pendingUsername() + "» уже занят — выберите другой",
                        "USERNAME_TAKEN");
            });
        }
        if (!store.claim(inv.id(), now)) {
            throw new BadRequestException(INVALID, "INVITE_INVALID");
        }
        AdminUser admin = target;
        if (admin == null) {
            admin = new AdminUser();
            admin.setTelegramUserId(id);
            admin.setName(inv.name());
            admin.setRole(inv.role());
            admin.setActive(true);
        }
        admin.setUsername(inv.pendingUsername());
        admin.setPasswordHash(inv.pendingPasswordHash());
        admin.setPasswordChangedAt(now);
        admin.setFailedAttempts(0);
        admin.setLockedUntil(null);
        if (setup) {
            admin.setTotpSecretEnc(inv.pendingTotpEnc());
            admin.setTotpEnabledAt(now);
            admin.setTotpPendingEnc(null);
            admin.setTotpPendingAt(null);
            admin.setTotpLastStep(step);
        }
        try {
            adminUserRepository.saveAndFlush(admin);
        } catch (DataIntegrityViolationException e) {
            throw new ConflictException("Логин «" + inv.pendingUsername() + "» уже занят — выберите другой",
                    "USERNAME_TAKEN");
        }
    }

    private void wrongCode(AdminInvite inv, ClientInfo client) {
        int failures = store.incrementFailures(inv.id());
        audit.recordFor(inv.telegramUserId(), "ADMIN_INVITE_FAIL", "ADMIN", String.valueOf(inv.telegramUserId()),
                "неверный код на странице приглашения (" + failures + " из " + MAX_CODE_FAILURES + "), IP "
                        + client.ip());
        if (failures >= MAX_CODE_FAILURES) {
            store.revoke(inv.id(), clock.instant());
            throw new BadRequestException("Слишком много неверных кодов — ссылка больше не действует. "
                    + "Попросите главного админа прислать новую.", "INVITE_REVOKED");
        }
        throw new BadRequestException("Неверный код из приложения", "BAD_CODE");
    }

    // ================================================================== helpers

    /** Live invite behind the token whose account is in the state the invite expects — or INVITE_INVALID. */
    AdminInvite liveInvite(String token) {
        if (token == null || !TOKEN.matcher(token.trim()).matches()) {
            throw invalid();
        }
        AdminInvite inv = store.byHash(hash(token.trim())).orElseThrow(AdminInviteService::invalid);
        if (!inv.live(clock.instant())) {
            throw invalid();
        }
        AdminUser target = adminUserRepository.findById(inv.telegramUserId()).orElse(null);
        boolean ok = inv.kind() == AdminInvite.Kind.NEW ? target == null : target != null && target.isActive();
        if (!ok) {
            throw invalid();
        }
        return inv;
    }

    private AdminUser targetOf(AdminInvite inv) {
        return inv.kind() == AdminInvite.Kind.NEW ? null
                : adminUserRepository.findById(inv.telegramUserId()).orElse(null);
    }

    private static boolean needsSetup(AdminUser target) {
        return target == null || !target.isTotpEnabled();
    }

    static String validUsername(String username) {
        String u = username == null ? "" : username.trim();
        if (!USERNAME.matcher(u).matches()) {
            throw new BadRequestException("Логин: 3–32 символа, латиница, цифры, точка, дефис или подчёркивание",
                    "BAD_USERNAME");
        }
        return u;
    }

    private void ensureUsernameFree(String login, AdminInvite inv) {
        boolean takenByOther = adminUserRepository.findByUsername(login)
                .filter(a -> a.getTelegramUserId() != inv.telegramUserId())
                .isPresent();
        if (takenByOther || store.usernamePending(login, inv.id(), clock.instant())) {
            throw new ConflictException("Логин «" + login + "» уже занят — выберите другой", "USERNAME_TAKEN");
        }
    }

    private String inviterName(long adminId) {
        return adminUserRepository.findById(adminId).map(AdminAuthService::displayName).orElse("Главный админ");
    }

    public static String roleLabel(AdminRole role) {
        return role == AdminRole.SUPER_ADMIN ? "главный админ" : "админ";
    }

    private static BadRequestException invalid() {
        return new BadRequestException(INVALID, "INVITE_INVALID");
    }

    static String newToken() {
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Used / revoked / expired invites are kept 90 days for the record. */
    @Scheduled(cron = "0 50 4 * * *")
    public void purge() {
        try {
            int n = store.purge(clock.instant().minus(Duration.ofDays(90)));
            if (n > 0) {
                log.info("Admin invites: removed {} old rows", n);
            }
        } catch (Exception e) {
            log.warn("Admin invite purge failed: {}", e.getMessage());
        }
    }
}
