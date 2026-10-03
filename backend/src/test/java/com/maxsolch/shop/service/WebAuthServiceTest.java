package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.WebLoginStatus;
import com.maxsolch.shop.domain.WebLoginToken;
import com.maxsolch.shop.domain.WebSession;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.repository.WebLoginTokenRepository;
import com.maxsolch.shop.repository.WebSessionRepository;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.WebSessionValidator;
import com.maxsolch.shop.service.WebAuthService.BotDecision;
import com.maxsolch.shop.service.WebAuthService.BotPrompt;
import com.maxsolch.shop.service.WebAuthService.StartResult;
import com.maxsolch.shop.service.WebAuthService.Tokens;
import com.maxsolch.shop.service.WebAuthService.WebLoginCompletedEvent;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.UnauthorizedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

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
    AdminUserRepository adminUserRepository;
    @Mock
    JwtService jwtService;
    @Mock
    WebSessionValidator sessionValidator;
    @Mock
    ApplicationEventPublisher events;

    final Map<String, WebLoginToken> tokens = new HashMap<>();
    final Map<String, WebSession> sessions = new HashMap<>();
    Instant now = Instant.parse("2026-10-03T12:00:00Z");
    WebAuthService service;

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.getTelegram().setBotUsername("@maxsolch_bot");
        service = new WebAuthService(tokenRepository, sessionRepository, userRepository, adminUserRepository,
                jwtService, props, sessionValidator, events);
        service.setClock(new MutableClock());

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
        BotPrompt prompt = service.openFromBot(nonceOf(r), USER).orElseThrow();

        assertThat(prompt.choices()).hasSize(3).doesNotHaveDuplicates().contains(r.matchCode());
        assertThat(prompt.deviceLabel()).isEqualTo("Chrome, Windows");

        assertThat(service.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.CONFIRMED);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.CONFIRMED);

        Tokens t = service.complete(r.loginId(), r.bindSecret(), UA, "1.2.3.4");

        assertThat(t.accessJwt()).isEqualTo("jwt");
        assertThat(t.user().userId()).isEqualTo(USER);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.USED);
        WebSession s = sessions.get(hex(UuidUtil.toBytes(t.sessionId())));
        assertThat(s.getUserId()).isEqualTo(USER);
        assertThat(s.getRefreshHash()).isEqualTo(WebAuthService.sha256(t.refreshToken()));
        assertThat(s.getExpiresAt()).isEqualTo(now.plus(Duration.ofDays(30)));
        verify(events).publishEvent(new WebLoginCompletedEvent(t.sessionId(), USER, "Chrome, Windows"));
    }

    // ================================================================== failures

    @Test
    void expiredLoginCannotBeConfirmedOrCompleted() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();

        now = now.plus(Duration.ofMinutes(6));

        assertThat(service.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.EXPIRED);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.EXPIRED);
        assertThat(service.openFromBot(nonceOf(r), USER)).isEmpty();
        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void confirmedButExpiredBeforeCompleteIsRefused() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();
        service.decideFromBot(r.loginId(), USER, r.matchCode());

        now = now.plus(Duration.ofMinutes(5));

        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(BadRequestException.class);
        verify(sessionRepository, never()).save(any());
    }

    @Test
    void wrongBindCookieIsUnauthorizedAndLeavesTheLoginUsable() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();
        service.decideFromBot(r.loginId(), USER, r.matchCode());

        assertThatThrownBy(() -> service.complete(r.loginId(), "someone-elses-bind", UA, "ip"))
                .isInstanceOf(UnauthorizedException.class);
        assertThatThrownBy(() -> service.complete(r.loginId(), null, UA, "ip"))
                .isInstanceOf(UnauthorizedException.class);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.CONFIRMED);
        verify(sessionRepository, never()).save(any());

        // The real browser can still finish.
        assertThat(service.complete(r.loginId(), r.bindSecret(), UA, "ip").sessionId()).isNotBlank();
    }

    @Test
    void wrongNumberRejectsWithNoSecondAttempt() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();
        int wrong = r.matchCode() == 99 ? 10 : r.matchCode() + 1;

        assertThat(service.decideFromBot(r.loginId(), USER, wrong)).isEqualTo(BotDecision.REJECTED);
        assertThat(service.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.INVALID);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.REJECTED);
        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void notMeRejects() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();

        assertThat(service.decideFromBot(r.loginId(), USER, null)).isEqualTo(BotDecision.REJECTED);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.REJECTED);
    }

    @Test
    void usedLoginCannotBeCompletedTwice() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();
        service.decideFromBot(r.loginId(), USER, r.matchCode());
        service.complete(r.loginId(), r.bindSecret(), UA, "ip");

        assertThatThrownBy(() -> service.complete(r.loginId(), r.bindSecret(), UA, "ip"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("used");
        assertThat(sessions).hasSize(1);
        assertThat(service.decideFromBot(r.loginId(), USER, r.matchCode())).isEqualTo(BotDecision.INVALID);
    }

    @Test
    void onlyThePersonTheLinkWasOpenedByCanAnswer() {
        StartResult r = service.start(UA, "1.2.3.4");
        service.openFromBot(nonceOf(r), USER).orElseThrow();

        // A forwarded link opened in a second chat gets nothing to press...
        assertThat(service.openFromBot(nonceOf(r), STRANGER)).isEmpty();
        // ...and a forged callback from another account is ignored.
        assertThat(service.decideFromBot(r.loginId(), STRANGER, r.matchCode())).isEqualTo(BotDecision.INVALID);
        assertThat(service.status(r.loginId())).isEqualTo(WebLoginStatus.PENDING);
    }

    @Test
    void unknownNonceOrLoginIdIsHarmless() {
        assertThat(service.openFromBot("not-a-real-nonce", USER)).isEmpty();
        assertThat(service.decideFromBot("garbage", USER, 42)).isEqualTo(BotDecision.INVALID);
        assertThat(service.decideFromBot(UuidUtil.toString(UuidUtil.randomBytes()), USER, 42))
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
                .isInstanceOf(UnauthorizedException.class)
                .hasMessageContaining("reused");

        WebSession s = sessions.get(hex(UuidUtil.toBytes(first.sessionId())));
        assertThat(s.getRevokedAt()).isNotNull();
        verify(sessionValidator).invalidate(first.sessionId());
        // The legitimate holder of the newest token is logged out too — that is the point.
        assertThatThrownBy(() -> service.refresh(second.refreshToken(), UA, "ip"))
                .isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void aParallelRefreshInsideTheGraceWindowIsNotTreatedAsTheft() {
        Tokens first = service.devLogin(USER, UA, "ip");
        Tokens second = service.refresh(first.refreshToken(), UA, "ip");
        now = now.plus(Duration.ofSeconds(3));

        assertThatThrownBy(() -> service.refresh(first.refreshToken(), UA, "ip"))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage(WebAuthService.REFRESH_RACE);

        assertThat(sessions.get(hex(UuidUtil.toBytes(first.sessionId()))).getRevokedAt()).isNull();
        assertThat(service.refresh(second.refreshToken(), UA, "ip").refreshToken()).isNotBlank();
    }

    @Test
    void refreshOfAnExpiredOrMalformedTokenIsUnauthorized() {
        Tokens first = service.devLogin(USER, UA, "ip");

        assertThatThrownBy(() -> service.refresh("garbage", UA, "ip")).isInstanceOf(UnauthorizedException.class);
        assertThatThrownBy(() -> service.refresh(null, UA, "ip")).isInstanceOf(UnauthorizedException.class);

        now = now.plus(Duration.ofDays(31));
        assertThatThrownBy(() -> service.refresh(first.refreshToken(), UA, "ip"))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessageContaining("ended");
    }

    @Test
    void botEndSessionOnlyForTheOwner() {
        Tokens t = service.devLogin(USER, UA, "ip");

        assertThat(service.revokeFromBot(t.sessionId(), STRANGER)).isEmpty();
        assertThat(sessions.get(hex(UuidUtil.toBytes(t.sessionId()))).getRevokedAt()).isNull();

        assertThat(service.revokeFromBot(t.sessionId(), USER)).contains("Chrome, Windows");
        assertThat(sessions.get(hex(UuidUtil.toBytes(t.sessionId()))).getRevokedAt()).isNotNull();
        assertThatThrownBy(() -> service.refresh(t.refreshToken(), UA, "ip"))
                .isInstanceOf(UnauthorizedException.class);
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
