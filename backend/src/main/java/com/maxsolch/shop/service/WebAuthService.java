package com.maxsolch.shop.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.maxsolch.shop.common.UserAgents;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.domain.WebLoginStatus;
import com.maxsolch.shop.domain.WebLoginToken;
import com.maxsolch.shop.domain.WebSession;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.repository.WebLoginTokenRepository;
import com.maxsolch.shop.repository.WebSessionRepository;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.WebSessionValidator;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.UnauthorizedException;
import com.maxsolch.shop.web.dto.AuthUserDto;
import com.maxsolch.shop.web.dto.WebAuthDtos.WebSessionDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
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
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

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

    /** Message of the 401 for a refresh that lost a race with a parallel one (cookies are kept). */
    public static final String REFRESH_RACE = "refresh token already rotated";

    private static final int NONCE_BYTES = 32;
    private static final int SECRET_BYTES = 32;
    /** Concurrent refreshes (two tabs) inside this window are a race, not token theft. */
    private static final Duration ROTATION_GRACE = Duration.ofSeconds(20);

    private final WebLoginTokenRepository tokenRepository;
    private final WebSessionRepository sessionRepository;
    private final UserRepository userRepository;
    private final AdminUserRepository adminUserRepository;
    private final JwtService jwtService;
    private final AppProperties props;
    private final WebSessionValidator sessionValidator;
    private final ApplicationEventPublisher events;

    private final SecureRandom random = new SecureRandom();
    /** Hashes of refresh tokens rotated away in the last {@link #ROTATION_GRACE} (ticks on {@link #clock}). */
    private final Cache<String, String> recentlyRotated = Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(ROTATION_GRACE)
            .ticker(() -> java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(this.clock.millis()))
            .build();
    private Clock clock = Clock.systemUTC();

    public WebAuthService(WebLoginTokenRepository tokenRepository,
                          WebSessionRepository sessionRepository,
                          UserRepository userRepository,
                          AdminUserRepository adminUserRepository,
                          JwtService jwtService,
                          AppProperties props,
                          WebSessionValidator sessionValidator,
                          ApplicationEventPublisher events) {
        this.tokenRepository = tokenRepository;
        this.sessionRepository = sessionRepository;
        this.userRepository = userRepository;
        this.adminUserRepository = adminUserRepository;
        this.jwtService = jwtService;
        this.props = props;
        this.sessionValidator = sessionValidator;
        this.events = events;
    }

    /** Tests move time. */
    void setClock(Clock clock) {
        this.clock = clock;
    }

    // ================================================================== results / events

    /** {@code bindSecret} goes into the {@code login_bind} cookie, never into the response body. */
    public record StartResult(String loginId, String deepLink, int matchCode, Instant expiresAt,
                              String bindSecret) {
    }

    /** Tokens for the {@code access} / {@code refresh} cookies plus the body. */
    public record Tokens(AuthUserDto user, String accessJwt, String refreshToken, String sessionId) {
    }

    /** What the bot shows after {@code /start login_<nonce>}. */
    public record BotPrompt(String loginId, List<Integer> choices, String deviceLabel) {
    }

    public enum BotDecision { CONFIRMED, REJECTED, EXPIRED, INVALID }

    /** Published after a successful login so the bot can tell the user (and offer "end session"). */
    public record WebLoginCompletedEvent(String sessionId, long telegramUserId, String deviceLabel) {
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
                .orElseThrow(() -> new NotFoundException("login not found"));
        return expireIfDue(t);
    }

    /**
     * Finishes a CONFIRMED login in the browser that started it: creates the session.
     *
     * @throws UnauthorizedException the {@code login_bind} cookie is missing or belongs to another login
     * @throws BadRequestException   unknown, not (yet) confirmed, rejected, expired or already used
     */
    @Transactional
    public Tokens complete(String loginId, String bindSecret, String userAgent, String ip) {
        WebLoginToken t = tokenRepository.findById(idBytes(loginId))
                .orElseThrow(() -> new BadRequestException("login not found"));
        if (bindSecret == null || bindSecret.isBlank() || !constantTimeEquals(sha256(bindSecret), t.getBindHash())) {
            throw new UnauthorizedException("login was started in another browser");
        }
        WebLoginStatus status = expireIfDue(t);
        if (status != WebLoginStatus.CONFIRMED || t.getTelegramUserId() == null) {
            throw new BadRequestException("login is " + status.name().toLowerCase());
        }
        t.setStatus(WebLoginStatus.USED);
        t.setUsedAt(now());
        tokenRepository.save(t);
        ensureUser(t.getTelegramUserId());

        Tokens tokens = openSession(t.getTelegramUserId(), userAgent, ip);
        events.publishEvent(new WebLoginCompletedEvent(tokens.sessionId(), t.getTelegramUserId(),
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
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public Tokens refresh(String refreshToken, String userAgent, String ip) {
        byte[] sid = sessionIdOf(refreshToken);
        if (sid == null) {
            throw new UnauthorizedException("no refresh token");
        }
        Instant now = now();
        WebSession s = sessionRepository.findByIdForUpdate(sid)
                .orElseThrow(() -> new UnauthorizedException("session not found"));
        if (!s.isActive(now)) {
            throw new UnauthorizedException("session ended");
        }
        String presented = sha256(refreshToken);
        if (!constantTimeEquals(presented, s.getRefreshHash())) {
            if (recentlyRotated.getIfPresent(presented) != null) {
                throw new UnauthorizedException(REFRESH_RACE);
            }
            log.warn("Refresh token reuse for web session {} (user {}) — revoking the session",
                    UuidUtil.toString(s.getId()), s.getUserId());
            s.setRevokedAt(now);
            sessionRepository.save(s);
            sessionValidator.invalidate(UuidUtil.toString(s.getId()));
            throw new UnauthorizedException("refresh token reused");
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

    /** @throws NotFoundException not one of this user's sessions */
    @Transactional
    public void revokeSession(long userId, String sessionId) {
        WebSession s = sessionRepository.findById(idBytes(sessionId))
                .filter(x -> x.getUserId() == userId)
                .orElseThrow(() -> new NotFoundException("session not found"));
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

    // ================================================================== bot side

    /**
     * {@code /start login_<nonce>}: the prompt to show, or empty when the link is unknown,
     * expired or already answered. Remembers which chat it was shown in — only that person may
     * answer it.
     */
    @Transactional
    public Optional<BotPrompt> openFromBot(String nonce, long chatId) {
        if (nonce == null || nonce.isBlank() || nonce.length() > 128) {
            return Optional.empty();
        }
        Optional<WebLoginToken> found = tokenRepository.findByNonceHash(sha256(nonce.trim()));
        if (found.isEmpty()) {
            return Optional.empty();
        }
        WebLoginToken t = found.get();
        if (expireIfDue(t) != WebLoginStatus.PENDING) {
            return Optional.empty();
        }
        if (t.getBotChatId() != null && t.getBotChatId() != chatId) {
            // Someone else already opened this link: a forwarded link must not be answerable twice.
            return Optional.empty();
        }
        t.setBotChatId(chatId);
        tokenRepository.save(t);
        return Optional.of(new BotPrompt(UuidUtil.toString(t.getId()), choices(t.getMatchCode()),
                UserAgents.describe(t.getUserAgent())));
    }

    @Transactional
    public void attachBotMessage(String loginId, long chatId, int messageId) {
        tokenRepository.findById(idBytes(loginId)).ifPresent(t -> {
            if (t.getBotChatId() != null && t.getBotChatId() == chatId) {
                t.setBotMessageId(messageId);
                tokenRepository.save(t);
            }
        });
    }

    /**
     * A button press in the bot. {@code chosen == null} is "it's not me". The right number confirms,
     * anything else rejects — one attempt, there is no retry.
     */
    @Transactional
    public BotDecision decideFromBot(String loginId, long fromUserId, Integer chosen) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(loginId);
        } catch (IllegalArgumentException e) {
            return BotDecision.INVALID;
        }
        Optional<WebLoginToken> found = tokenRepository.findById(id);
        if (found.isEmpty()) {
            return BotDecision.INVALID;
        }
        WebLoginToken t = found.get();
        // In a private chat the chat id IS the user id: only the person the prompt was sent to.
        if (t.getBotChatId() == null || t.getBotChatId() != fromUserId) {
            return BotDecision.INVALID;
        }
        WebLoginStatus status = expireIfDue(t);
        if (status == WebLoginStatus.EXPIRED) {
            return BotDecision.EXPIRED;
        }
        if (status != WebLoginStatus.PENDING) {
            return BotDecision.INVALID;
        }
        Instant now = now();
        if (chosen != null && chosen == t.getMatchCode()) {
            t.setStatus(WebLoginStatus.CONFIRMED);
            t.setTelegramUserId(fromUserId);
            t.setConfirmedAt(now);
            tokenRepository.save(t);
            return BotDecision.CONFIRMED;
        }
        t.setStatus(WebLoginStatus.REJECTED);
        tokenRepository.save(t);
        return BotDecision.REJECTED;
    }

    /**
     * "End this session" button under the login notification.
     *
     * @return the device label of the ended session, or empty if it is not this user's session
     */
    @Transactional
    public Optional<String> revokeFromBot(String sessionId, long fromUserId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(sessionId);
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
        Optional<WebSession> s = sessionRepository.findById(id).filter(x -> x.getUserId() == fromUserId);
        if (s.isEmpty()) {
            return Optional.empty();
        }
        if (s.get().getRevokedAt() == null) {
            s.get().setRevokedAt(now());
            sessionRepository.save(s.get());
        }
        sessionValidator.invalidate(sessionId);
        return Optional.of(UserAgents.describe(s.get().getUserAgent()));
    }

    // ================================================================== housekeeping

    /** Hourly: login requests a day past expiry, sessions expired or revoked over 30 days ago. */
    @Scheduled(cron = "${app.site.cleanup-cron:0 7 * * * *}")
    @Transactional
    public void cleanup() {
        Instant now = now();
        int tokens = tokenRepository.deleteExpiredBefore(now.minus(Duration.ofDays(1)));
        int sessions = sessionRepository.deleteStale(now, now.minus(Duration.ofDays(30)));
        if (tokens + sessions > 0) {
            log.info("Web auth cleanup: {} login requests, {} sessions removed", tokens, sessions);
        }
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
        boolean admin = adminUserRepository.existsByTelegramUserIdAndActiveTrue(telegramUserId);
        return new AuthUserDto(telegramUserId,
                u == null ? null : u.getUsername(),
                u == null ? null : u.getFirstName(),
                u == null ? null : u.getLastName(),
                admin);
    }

    private WebLoginStatus expireIfDue(WebLoginToken t) {
        if ((t.getStatus() == WebLoginStatus.PENDING || t.getStatus() == WebLoginStatus.CONFIRMED)
                && t.isExpired(now())) {
            t.setStatus(WebLoginStatus.EXPIRED);
            tokenRepository.save(t);
        }
        return t.getStatus();
    }

    /** The right number and two distinct decoys from 10–99, shuffled. */
    private List<Integer> choices(int matchCode) {
        Set<Integer> set = new LinkedHashSet<>();
        set.add(matchCode);
        while (set.size() < 3) {
            set.add(10 + random.nextInt(90));
        }
        List<Integer> list = new ArrayList<>(set);
        Collections.shuffle(list, random);
        return list;
    }

    /** {@code <base64url(session id)>.<base64url(32 random bytes)>}. */
    private String newRefreshToken(byte[] sessionId) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(sessionId) + "." + randomToken(SECRET_BYTES);
    }

    /** Session id encoded in a refresh token, or null if it is not one of ours. */
    static byte[] sessionIdOf(String refreshToken) {
        if (refreshToken == null) {
            return null;
        }
        int dot = refreshToken.indexOf('.');
        if (dot <= 0 || dot == refreshToken.length() - 1 || refreshToken.length() > 200) {
            return null;
        }
        try {
            byte[] id = Base64.getUrlDecoder().decode(refreshToken.substring(0, dot));
            return id.length == 16 ? id : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
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
            throw new BadRequestException("invalid id");
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

    private static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) {
            return false;
        }
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.US_ASCII), b.getBytes(StandardCharsets.US_ASCII));
    }

    private static String cut(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() > max ? s.substring(0, max) : s;
    }
}
