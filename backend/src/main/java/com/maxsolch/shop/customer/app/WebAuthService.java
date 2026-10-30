package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.customer.domain.CustomerError;
import com.maxsolch.shop.customer.domain.WebLoginCompleted;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.web.UserAgents;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.customer.infra.CustomerProperties;
import com.maxsolch.shop.customer.domain.User;
import com.maxsolch.shop.customer.domain.WebLoginStatus;
import com.maxsolch.shop.customer.domain.WebLoginToken;
import com.maxsolch.shop.customer.domain.WebSession;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.customer.infra.WebLoginTokenRepository;
import com.maxsolch.shop.customer.infra.WebSessionRepository;
import com.maxsolch.shop.platform.security.JwtService;
import com.maxsolch.shop.platform.security.WebSessionValidator;
import com.maxsolch.shop.customer.app.WebAuthDtos.WebSessionDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

import static com.maxsolch.shop.customer.app.WebTokens.constantTimeEquals;
import static com.maxsolch.shop.customer.app.WebTokens.sessionIdOf;
import static com.maxsolch.shop.platform.util.Texts.cut;

/**
 * Logging in to the public site through the Telegram bot, and the site sessions that follow.
 *
 * <pre>
 *  browser                         backend                          bot (Telegram)
 *  POST start ─────────────────▶  token PENDING, login_bind cookie
 *   shows matchCode + deep link    t.me/bot?start=login_&lt;nonce&gt; ───▶ /start login_&lt;nonce&gt;
 *                                                                    3 numbers + "not me"
 *  GET status (poll) ◀──────────  CONFIRMED  ◀───────────────────── right number picked
 *  POST complete (login_bind) ──▶ USED, web_sessions row, access + refresh cookies
 *                                  "you are logged in" + [end session] ──▶
 * </pre>
 *
 * <p>Why each piece exists:
 * <ul>
 *   <li><b>nonce</b> (deep link) ties the bot conversation to one login attempt; only its hash is stored.</li>
 *   <li><b>login_bind</b> (HttpOnly cookie) ties completion to the browser that started it: someone
 *       who gets hold of the deep link or the loginId cannot finish the login in their own browser.</li>
 *   <li><b>matchCode</b> defeats "click this link" phishing: the victim confirming in Telegram must
 *       see the same number as the browser that is about to be logged in. One attempt only.</li>
 *   <li><b>refresh rotation</b>: every refresh issues a new token; presenting an old one (outside
 *       a few-seconds race window) is treated as theft and ends the whole session.</li>
 * </ul>
 */
@Slf4j
@Service
public class WebAuthService {

    private static final int NONCE_BYTES = 32;
    private static final int SECRET_BYTES = 32;
    /** Concurrent refreshes (two tabs) inside this window are a race, not token theft. */
    static final Duration ROTATION_GRACE = Duration.ofSeconds(20);

    private final WebLoginTokenRepository tokenRepository;
    private final WebSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final AdminCheck adminCheck;
    private final JwtService jwtService;
    private final CustomerProperties props;
    private final WebSessionValidator sessionValidator;
    private final DomainEvents events;

    private final SecureRandom random = new SecureRandom();
    /** Hashes of refresh tokens rotated away in the last {@link #ROTATION_GRACE} (ticks on {@link #clock}). */
    private final Cache recentlyRotated;
    private final Clock clock;

    public WebAuthService(WebLoginTokenRepository tokenRepository,
                          WebSessionRepository sessionRepository,
                          UserRepository userRepository,
                          AdminCheck adminCheck,
                          JwtService jwtService,
                          CustomerProperties props,
                          WebSessionValidator sessionValidator,
                          DomainEvents events,
                          Clock clock,
                          CacheManager caches) {
        this.tokenRepository = tokenRepository;
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.adminCheck = adminCheck;
        this.jwtService = jwtService;
        this.props = props;
        this.sessionValidator = sessionValidator;
        this.events = events;
        this.clock = clock;
        this.recentlyRotated = CacheConfig.require(caches, CustomerCaches.WEB_ROTATED_REFRESH);
    }

    // ================================================================== results / events

    /** {@code bindSecret} goes into the {@code login_bind} cookie, never into the response body. */
    public record StartResult(String loginId, String deepLink, int matchCode, Instant expiresAt,
                              String bindSecret) {
    }

    /** Tokens for the {@code access} / {@code refresh} cookies plus the body. */
    public record Tokens(AuthUserDto user, String accessJwt, String refreshToken, String sessionId) {
    }

    // ================================================================== browser side

    @Transactional
    public StartResult start(String userAgent, String ip) {
        Instant now = now();
        String nonce = randomToken(NONCE_BYTES);
        String bind = randomToken(SECRET_BYTES);

        WebLoginToken t = new WebLoginToken();
        t.setId(UuidUtil.randomBytes());
        t.setNonceHash(sha256(nonce));
        t.setBindHash(sha256(bind));
        t.setMatchCode(10 + random.nextInt(90));
        t.setStatus(WebLoginStatus.PENDING);
        t.setUserAgent(cut(userAgent, 512));
        t.setIp(cut(ip, 64));
        t.setCreatedAt(now);
        t.setExpiresAt(now.plus(Duration.ofMinutes(props.getSite().getLoginMinutes())));
        tokenRepository.save(t);

        String deepLink = "https://t.me/" + botUsername() + "?start=login_" + nonce;
        return new StartResult(UuidUtil.toString(t.getId()), deepLink, t.getMatchCode(), t.getExpiresAt(), bind);
    }

    /** Current state; a timed-out PENDING/CONFIRMED request reads (and is stored) as EXPIRED. */
    @Transactional
    public WebLoginStatus status(String loginId) {
        WebLoginToken t = tokenRepository.findById(idBytes(loginId))
                .orElseThrow(() -> new DomainException.NotFound(CustomerError.LOGIN_NOT_FOUND));
        return expireIfDue(t);
    }

    /**
     * Finishes a CONFIRMED login in the browser that started it: creates the session.
     *
     * @throws DomainException.Unauthorized the {@code login_bind} cookie is missing or belongs to another login
     * @throws DomainException.BadRequest   unknown, not (yet) confirmed, rejected, expired or already used
     */
    @Transactional
    public Tokens complete(String loginId, String bindSecret, String userAgent, String ip) {
        WebLoginToken t = tokenRepository.findById(idBytes(loginId))
                .orElseThrow(() -> new DomainException.BadRequest(CustomerError.LOGIN_NOT_FOUND));
        if (bindSecret == null || bindSecret.isBlank() || !constantTimeEquals(sha256(bindSecret), t.getBindHash())) {
            throw new DomainException.Unauthorized(CustomerError.LOGIN_OTHER_BROWSER);
        }
        WebLoginStatus status = expireIfDue(t);
        if (status != WebLoginStatus.CONFIRMED || t.getTelegramUserId() == null) {
            throw new DomainException.BadRequest(CustomerError.LOGIN_BAD_STATE, status.name().toLowerCase());
        }
        t.setStatus(WebLoginStatus.USED);
        t.setUsedAt(now());
        tokenRepository.save(t);
        ensureUser(t.getTelegramUserId());

        Tokens tokens = openSession(t.getTelegramUserId(), userAgent, ip);
        events.publish(new WebLoginCompleted(tokens.sessionId(), t.getTelegramUserId(),
                UserAgents.describe(userAgent)));
        return tokens;
    }

    /** Dev profile only (see DevWebLoginController): a session without Telegram. */
    @Transactional
    public Tokens devLogin(long telegramUserId, String userAgent, String ip) {
        ensureUser(telegramUserId);
        return openSession(telegramUserId, userAgent, ip);
    }

    /**
     * {@code web_sessions.user_id} references {@code users}. The bot records the user when they
     * confirm, but that write is best-effort — make sure the row exists before the session does.
     */
    private void ensureUser(long telegramUserId) {
        if (!userRepository.existsById(telegramUserId)) {
            User u = new User();
            u.setTelegramUserId(telegramUserId);
            u.setLastSeenAt(now());
            userRepository.save(u);
        }
    }

    /**
     * Rotates the refresh token. A token that is valid in shape but no longer the session's current
     * one was either already used (theft: the session is revoked) or lost a race with a parallel
     * refresh of the same browser (within {@link #ROTATION_GRACE}: plain 401, session kept).
     */
    @Transactional(noRollbackFor = DomainException.Unauthorized.class)
    public Tokens refresh(String refreshToken, String userAgent, String ip) {
        byte[] sid = sessionIdOf(refreshToken);
        if (sid == null) {
            throw new DomainException.Unauthorized(CustomerError.NO_REFRESH_TOKEN);
        }
        Instant now = now();
        WebSession s = sessionRepository.findByIdForUpdate(sid)
                .orElseThrow(() -> new DomainException.Unauthorized(CustomerError.SESSION_NOT_FOUND));
        if (!s.isActive(now)) {
            throw new DomainException.Unauthorized(CustomerError.SESSION_ENDED);
        }
        String presented = sha256(refreshToken);
        if (!constantTimeEquals(presented, s.getRefreshHash())) {
            if (recentlyRotated.get(presented) != null) {
                throw new DomainException.Unauthorized(CustomerError.REFRESH_TOKEN_ROTATED);
            }
            log.warn("Refresh token reuse for web session {} (user {}) — revoking the session",
                    UuidUtil.toString(s.getId()), s.getUserId());
            s.setRevokedAt(now);
            sessionRepository.save(s);
            sessionValidator.invalidate(UuidUtil.toString(s.getId()));
            throw new DomainException.Unauthorized(CustomerError.REFRESH_TOKEN_REUSED);
        }

        String sessionId = UuidUtil.toString(s.getId());
        String next = newRefreshToken(s.getId());
        recentlyRotated.put(presented, sessionId);
        s.setRefreshHash(sha256(next));
        s.setLastUsedAt(now);
        s.setExpiresAt(now.plus(Duration.ofDays(props.getSite().getSessionDays())));
        if (userAgent != null) {
            s.setUserAgent(cut(userAgent, 512));
        }
        if (ip != null) {
            s.setIp(cut(ip, 64));
        }
        sessionRepository.save(s);
        return new Tokens(userDto(s.getUserId()), accessJwt(s.getUserId(), sessionId), next, sessionId);
    }

    /** Ends the session behind the refresh cookie and/or the access token's {@code sid}. */
    @Transactional
    public void logout(String refreshToken, String accessSessionId) {
        List<byte[]> ids = new ArrayList<>();
        byte[] fromRefresh = sessionIdOf(refreshToken);
        if (fromRefresh != null) {
            // Only if the cookie really is this session's — a stale cookie must not log out others.
            sessionRepository.findById(fromRefresh)
                    .filter(s -> constantTimeEquals(sha256(refreshToken), s.getRefreshHash()))
                    .ifPresent(s -> ids.add(s.getId()));
        }
        if (accessSessionId != null) {
            try {
                ids.add(UuidUtil.toBytes(accessSessionId));
            } catch (IllegalArgumentException ignored) {
                // malformed sid claim: nothing to revoke
            }
        }
        Instant now = now();
        for (byte[] id : ids) {
            sessionRepository.findById(id).ifPresent(s -> {
                if (s.getRevokedAt() == null) {
                    s.setRevokedAt(now);
                    sessionRepository.save(s);
                }
                sessionValidator.invalidate(UuidUtil.toString(s.getId()));
            });
        }
    }

    @Transactional(readOnly = true)
    public List<WebSessionDto> listSessions(long userId, String currentSessionId) {
        return sessionRepository.findActiveByUser(userId, now()).stream()
                .map(s -> {
                    String id = UuidUtil.toString(s.getId());
                    return new WebSessionDto(id, UserAgents.describe(s.getUserAgent()), s.getIp(),
                            s.getCreatedAt(), s.getLastUsedAt(), id.equals(currentSessionId));
                })
                .toList();
    }

    /** @throws DomainException.NotFound not one of this user's sessions */
    @Transactional
    public void revokeSession(long userId, String sessionId) {
        WebSession s = sessionRepository.findById(idBytes(sessionId))
                .filter(x -> x.getUserId() == userId)
                .orElseThrow(() -> new DomainException.NotFound(CustomerError.SESSION_NOT_FOUND));
        if (s.getRevokedAt() == null) {
            s.setRevokedAt(now());
            sessionRepository.save(s);
        }
        sessionValidator.invalidate(sessionId);
    }

    @Transactional
    public void revokeAll(long userId) {
        sessionRepository.revokeAllForUser(userId, now());
        sessionValidator.invalidateAll();
    }

    // ================================================================== internals

    /** Second precision — what the TIMESTAMP columns store, so responses match the database. */
    private Instant now() {
        return clock.instant().truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
    }

    private Tokens openSession(long telegramUserId, String userAgent, String ip) {
        Instant now = now();
        WebSession s = new WebSession();
        s.setId(UuidUtil.randomBytes());
        s.setUserId(telegramUserId);
        String refresh = newRefreshToken(s.getId());
        s.setRefreshHash(sha256(refresh));
        s.setUserAgent(cut(userAgent, 512));
        s.setIp(cut(ip, 64));
        s.setCreatedAt(now);
        s.setLastUsedAt(now);
        s.setExpiresAt(now.plus(Duration.ofDays(props.getSite().getSessionDays())));
        sessionRepository.save(s);
        String sessionId = UuidUtil.toString(s.getId());
        return new Tokens(userDto(telegramUserId), accessJwt(telegramUserId, sessionId), refresh, sessionId);
    }

    private String accessJwt(long telegramUserId, String sessionId) {
        return jwtService.issueWebToken(telegramUserId, sessionId, props.getSite().getAccessMinutes());
    }

    private AuthUserDto userDto(long telegramUserId) {
        User u = userRepository.findById(telegramUserId).orElse(null);
        boolean admin = adminCheck.isActive(telegramUserId);
        return new AuthUserDto(telegramUserId,
                u == null ? null : u.getUsername(),
                u == null ? null : u.getFirstName(),
                u == null ? null : u.getLastName(),
                admin);
    }

    private WebLoginStatus expireIfDue(WebLoginToken t) {
        return WebLoginBotFlow.expireIfDue(tokenRepository, t, now());
    }

    /** {@code <base64url(session id)>.<base64url(32 random bytes)>}. */
    private String newRefreshToken(byte[] sessionId) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(sessionId) + "." + randomToken(SECRET_BYTES);
    }

    private String randomToken(int bytes) {
        byte[] b = new byte[bytes];
        random.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    private String botUsername() {
        String u = props.getTelegram().getBotUsername();
        if (u == null || u.isBlank()) {
            return "bot";
        }
        return u.startsWith("@") ? u.substring(1) : u.trim();
    }

    private static byte[] idBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new DomainException.BadRequest(CustomerError.INVALID_ID);
        }
    }

    public static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
