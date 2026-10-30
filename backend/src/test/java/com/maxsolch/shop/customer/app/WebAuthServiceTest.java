package com.maxsolch.shop.customer.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.customer.infra.CustomerProperties;
import com.maxsolch.shop.customer.domain.WebLoginStatus;
import com.maxsolch.shop.customer.domain.WebLoginToken;
import com.maxsolch.shop.customer.domain.WebSession;
import com.maxsolch.shop.customer.infra.UserRepository;
import com.maxsolch.shop.customer.infra.WebLoginTokenRepository;
import com.maxsolch.shop.customer.infra.WebSessionRepository;
import com.maxsolch.shop.platform.security.JwtService;
import com.maxsolch.shop.platform.security.WebSessionValidator;
import com.maxsolch.shop.customer.app.WebLoginBotFlow.BotDecision;
import com.maxsolch.shop.customer.app.WebLoginBotFlow.BotPrompt;
import com.maxsolch.shop.customer.app.WebAuthService.StartResult;
import com.maxsolch.shop.customer.app.WebAuthService.Tokens;
import com.maxsolch.shop.customer.domain.WebLoginCompleted;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.maxsolch.shop.platform.tx.DomainEvents;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * State machine of the website login through the bot, and refresh-token rotation. Repositories
 * are in-memory fakes (maps behind Mockito answers) so the service runs its real logic end to end.
 */
@ExtendWith(MockitoExtension.class)
class WebAuthServiceTest {

    private static final long USER = 593289478L;
    private static final long STRANGER = 111L;
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0 Safari/537.36";

    @Mock
    WebLoginTokenRepository tokenRepository;
    @Mock
    WebSessionRepository sessionRepository;
    @Mock
    UserRepository userRepository;
    @Mock
    AdminCheck adminUserRepository;
    @Mock
    JwtService jwtService;
    @Mock
    WebSessionValidator sessionValidator;
    @Mock
    DomainEvents events;

    final Map<String, WebLoginToken> tokens = new HashMap<>();
    final Map<String, WebSession> sessions = new HashMap<>();
    Instant now = Instant.parse("2026-10-03T12:00:00Z");
    WebAuthService service;
    WebLoginBotFlow bot;

    @BeforeEach
    void setUp() {
        CustomerProperties props = new CustomerProperties();
        props.getTelegram().setBotUsername("@maxsolch_bot");
        MutableClock clock = new MutableClock();
        org.springframework.cache.support.SimpleCacheManager caches = new org.springframework.cache.support.SimpleCacheManager();
        caches.setCaches(java.util.List.of(com.maxsolch.shop.platform.cache.CacheConfig.onClock(CustomerCaches.ROTATED_REFRESH, clock)));
        caches.initializeCaches();
        service = new WebAuthService(tokenRepository, sessionRepository, userRepository, adminUserRepository,
                jwtService, props, sessionValidator, events, clock, caches);

        bot = new WebLoginBotFlow(tokenRepository, sessionRepository, sessionValidator, clock);
        lenient().when(tokenRepository.save(any())).thenAnswer(inv -> {
            WebLoginToken t = inv.getArgument(0);
            tokens.put(hex(t.getId()), t);
            return t;
        });
        lenient().when(tokenRepository.findById(any())).thenAnswer(inv ->
                Optional.ofNullable(tokens.get(hex(inv.getArgument(0)))));
        lenient().when(tokenRepository.findByNonceHash(anyString())).thenAnswer(inv ->
                tokens.values().stream().filter(t -> t.getNonceHash().equals(inv.getArgument(0))).findFirst());

        lenient().when(sessionRepository.save(any())).thenAnswer(inv -> {
            WebSession s = inv.getArgument(0);
            sessions.put(hex(s.getId()), s);
            return s;
        });
        lenient().when(sessionRepository.findById(any())).thenAnswer(inv ->
                Optional.ofNullable(sessions.get(hex(inv.getArgument(0)))));
        lenient().when(sessionRepository.findByIdForUpdate(any())).thenAnswer(inv ->
                Optional.ofNullable(sessions.get(hex(inv.getArgument(0)))));

        lenient().when(userRepository.existsById(anyLong())).thenReturn(true);
        lenient().when(jwtService.issueWebToken(anyLong(), anyString(), anyLong())).thenReturn("jwt");
    }

    // ================================================================== start

    @Test
    void startStoresOnlyHashesAndBuildsDeepLink() {
        StartResult r = service.start(UA, "1.2.3.4");

        assertThat(r.deepLink()).startsWith("https://t.me/maxsolch_bot?start=login_");
        String nonce = nonceOf(r);
        assertThat(nonce).hasSize(43).matches("[A-Za-z0-9_-]+");
        assertThat(r.matchCode()).isBetween(10, 99);
        assertThat(r.expiresAt()).isEqualTo(now.plus(Duration.ofMinutes(5)));

        WebLoginToken t = tokens.values().iterator().next();
        assertThat(t.getStatus()).isEqualTo(WebLoginStatus.PENDING);
        assertThat(t.getNonceHash()).isEqualTo(WebAuthService.sha256(nonce)).isNotEqualTo(nonce);
        assertThat(t.getBindHash()).isEqualTo(WebAuthService.sha256(r.bindSecret()));
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.PENDING);
    }

    // ================================================================== happy path

    @Test
    void rightNumberConfirmsAndCompleteOpensASession() {
        StartResult r = service.start(UA, "1.2.3.4");
        BotPrompt prompt = bot.openFromBot(nonceOf(r), USER).orElseThrow();

        assertThat(prompt.choices()).hasSize(3).doesNotHaveDuplicates().contains(r.matchCode());
        assertThat(prompt.deviceLabel()).isEqualTo("Chrome, Windows");

        assertThat(bot.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.CONFIRMED);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.CONFIRMED);

        Tokens t = service.complete(r.loginId(), r.bindSecret(), UA, "1.2.3.4");

        assertThat(t.accessJwt()).isEqualTo("jwt");
        assertThat(t.user().userId()).isEqualTo(USER);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.USED);
        WebSession s = sessions.get(hex(UuidUtil.toBytes(t.sessionId())));
        assertThat(s.getUserId()).isEqualTo(USER);
        assertThat(s.getRefreshHash()).isEqualTo(WebAuthService.sha256(t.refreshToken()));
        assertThat(s.getExpiresAt()).isEqualTo(now.plus(Duration.ofDays(30)));
        verify(events).publish(new WebLoginCompleted(t.sessionId(), USER, "Chrome, Windows"));
    }

    // ================================================================== failures

    @Test
    void expiredLoginCannotBeConfirmedOrCompleted() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();

        now = now.plus(Duration.ofMinutes(6));

        assertThat(bot.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.EXPIRED);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.EXPIRED);
        assertThat(bot.openFromBot(nonceOf(r), USER)).isEmpty();
        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void confirmedButExpiredBeforeCompleteIsRefused() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();
        bot.decideFromBot(r.loginId(), USER, r.matchCode());

        now = now.plus(Duration.ofMinutes(5));

        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(DomainException.BadRequest.class);
        verify(sessionRepository, never()).save(any());
    }

    @Test
    void wrongBindCookieIsUnauthorizedAndLeavesTheLoginUsable() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();
        bot.decideFromBot(r.loginId(), USER, r.matchCode());

        assertThatThrownBy(() -> service.complete(r.loginId(), "someone-elses-bind", UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class);
        assertThatThrownBy(() -> service.complete(r.loginId(), null, UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.CONFIRMED);
        verify(sessionRepository, never()).save(any());

        // The real browser can still finish.
        assertThat(service.complete(r.loginId(), r.bindSecret(), UA, "ip").sessionId()).isNotBlank();
    }

    @Test
    void wrongNumberRejectsWithNoSecondAttempt() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();
        int wrong = r.matchCode() == 99 ? 10 : r.matchCode() + 1;

        assertThat(bot.decideFromBot(r.loginId(), USER, wrong)).isEqualTo(BotDecision.REJECTED);
        assertThat(bot.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.INVALID);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.REJECTED);
        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void notMeRejects() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();

        assertThat(bot.decideFromBot(r.loginId(), USER, null)).isEqualTo(BotDecision.REJECTED);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.REJECTED);
    }

    @Test
    void usedLoginCannotBeCompletedTwice() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();
        bot.decideFromBot(r.loginId(), USER, r.matchCode());
        service.complete(r.loginId(), r.bindSecret(), UA, "ip");

        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("used");
        assertThat(sessions).hasSize(1);
        assertThat(bot.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.INVALID);
    }

    @Test
    void onlyThePersonTheLinkWasOpenedByCanAnswer() {
        StartResult r = service.start(UA, "1.2.3.4");
        bot.openFromBot(nonceOf(r), USER).orElseThrow();

        // A forwarded link opened in a second chat gets nothing to press...
        assertThat(bot.openFromBot(nonceOf(r), STRANGER)).isEmpty();
        // ...and a forged callback from another account is ignored.
        assertThat(bot.decideFromBot(r.loginId(), STRANGER, r.matchCode())).isEqualTo(BotDecision.INVALID);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.PENDING);
    }

    @Test
    void unknownNonceOrLoginIdIsHarmless() {
        assertThat(bot.openFromBot("not-a-real-nonce", USER)).isEmpty();
        assertThat(bot.decideFromBot("garbage", USER, 42)).isEqualTo(BotDecision.INVALID);
        assertThat(bot.decideFromBot(UuidUtil.toString(UuidUtil.randomBytes()), USER, 42))
                .isEqualTo(BotDecision.INVALID);
    }

    // ================================================================== refresh rotation

    @Test
    void refreshRotatesTheToken() {
        Tokens first = service.devLogin(USER, UA, "ip");
        now = now.plus(Duration.ofMinutes(20));

        Tokens second = service.refresh(first.refreshToken(), UA, "ip2");

        assertThat(second.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThat(second.sessionId()).isEqualTo(first.sessionId());
        WebSession s = sessions.get(hex(UuidUtil.toBytes(first.sessionId())));
        assertThat(s.getRefreshHash()).isEqualTo(WebAuthService.sha256(second.refreshToken()));
        assertThat(s.getLastUsedAt()).isEqualTo(now);
        assertThat(s.getRevokedAt()).isNull();
    }

    @Test
    void reusingARotatedRefreshTokenRevokesTheSession() {
        Tokens first = service.devLogin(USER, UA, "ip");
        Tokens second = service.refresh(first.refreshToken(), UA, "ip");
        now = now.plus(Duration.ofMinutes(1)); // well past the parallel-tab grace window

        assertThatThrownBy(() -> service.refresh(first.refreshToken(), UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class)
                .hasMessageContaining("reused");

        WebSession s = sessions.get(hex(UuidUtil.toBytes(first.sessionId())));
        assertThat(s.getRevokedAt()).isNotNull();
        verify(sessionValidator).invalidate(first.sessionId());
        // The legitimate holder of the newest token is logged out too — that is the point.
        assertThatThrownBy(() -> service.refresh(second.refreshToken(), UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class);
    }

    @Test
    void aParallelRefreshInsideTheGraceWindowIsNotTreatedAsTheft() {
        Tokens first = service.devLogin(USER, UA, "ip");
        Tokens second = service.refresh(first.refreshToken(), UA, "ip");
        now = now.plus(Duration.ofSeconds(3));

        assertThatThrownBy(() -> service.refresh(first.refreshToken(), UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class)
                .satisfies(e -> assertThat(((DomainException) e).errorCode()).isEqualTo(com.maxsolch.shop.customer.domain.CustomerError.REFRESH_TOKEN_ROTATED));

        assertThat(sessions.get(hex(UuidUtil.toBytes(first.sessionId()))).getRevokedAt()).isNull();
        assertThat(service.refresh(second.refreshToken(), UA, "ip").refreshToken()).isNotBlank();
    }

    @Test
    void refreshOfAnExpiredOrMalformedTokenIsUnauthorized() {
        Tokens first = service.devLogin(USER, UA, "ip");

        assertThatThrownBy(() -> service.refresh("garbage", UA, "ip")).isInstanceOf(DomainException.Unauthorized.class);
        assertThatThrownBy(() -> service.refresh(null, UA, "ip")).isInstanceOf(DomainException.Unauthorized.class);

        now = now.plus(Duration.ofDays(31));
        assertThatThrownBy(() -> service.refresh(first.refreshToken(), UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class)
                .hasMessageContaining("ended");
    }

    @Test
    void botEndSessionOnlyForTheOwner() {
        Tokens t = service.devLogin(USER, UA, "ip");

        assertThat(bot.revokeFromBot(t.sessionId(), STRANGER)).isEmpty();
        assertThat(sessions.get(hex(UuidUtil.toBytes(t.sessionId()))).getRevokedAt()).isNull();

        assertThat(bot.revokeFromBot(t.sessionId(), USER)).contains("Chrome, Windows");
        assertThat(sessions.get(hex(UuidUtil.toBytes(t.sessionId()))).getRevokedAt()).isNotNull();
        assertThatThrownBy(() -> service.refresh(t.refreshToken(), UA, "ip"))
                .isInstanceOf(DomainException.Unauthorized.class);
    }

    // ================================================================== helpers

    private static String nonceOf(StartResult r) {
        return r.deepLink().substring(r.deepLink().indexOf("login_") + "login_".length());
    }

    private static String hex(Object id) {
        return HexFormat.of().formatHex((byte[]) id);
    }

    /** Reads {@link #now} on every call, so a test moves time by reassigning it. */
    private final class MutableClock extends Clock {
        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
