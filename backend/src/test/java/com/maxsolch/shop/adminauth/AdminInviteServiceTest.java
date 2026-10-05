package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionOperations;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Invite links: only the hash is stored, 48 h, single use (burnt only by a correct code), reuse and
 * guessing get the same «invalid» answer, 5 wrong codes revoke the link.
 */
class AdminInviteServiceTest {

    private static final String JWT_SECRET = "ZTJlLW9ubHktand0LXNlY3JldC1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLTAwMDAwMDA=";
    private static final ClientInfo CLIENT = new ClientInfo("203.0.113.9", "Mozilla/5.0 (iPhone) Safari/17");
    private static final long BOSS = 1L;
    private static final long NEWBIE = 500L;

    MutableClock clock;
    FakeAdmins admins;
    InMemoryInviteStore store;
    AdminTeamMessenger messenger;
    AdminAuthService authService;
    AdminSessions sessions;
    AdminAuditService audit;
    SecretCipher cipher;
    AdminTotp totp;
    BCryptPasswordEncoder encoder;
    AdminInviteService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-05T10:00:00Z"));
        admins = new FakeAdmins();
        store = new InMemoryInviteStore();
        messenger = mock(AdminTeamMessenger.class);
        authService = mock(AdminAuthService.class);
        when(authService.completeInvite(anyLong(), anyBoolean(), anyBoolean(), any())).thenReturn(
                new AdminAuthService.Outcome(AdminAuthService.Status.OK, "access-token", null, null, "Newbie"));
        sessions = mock(AdminSessions.class);
        audit = mock(AdminAuditService.class);
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret(JWT_SECRET);
        cipher = new AdminAuthKeys(props).cipher();
        totp = new AdminTotp(cipher, admins.repo, "ChiSetup Admin", clock);
        encoder = new BCryptPasswordEncoder(4);
        admins.add(BOSS, "boss", AdminRole.SUPER_ADMIN, cipher.encrypt(Totp.newSecret(), BOSS));
        service = service("https://admin.example.com/");
    }

    private AdminInviteService service(String base) {
        return new AdminInviteService(store, admins.repo, encoder, totp, sessions, mock(AdminTokenValidator.class),
                authService, audit, messenger, TransactionOperations.withoutTransaction(), base, clock);
    }

    /** Creates an invite and returns the raw token (from the link shown when the bot fails). */
    private String invite(AdminInvite.Kind kind, long tgId) {
        AdminInviteService.Created c = service.create(kind, tgId, "Newbie", AdminRole.ADMIN, BOSS);
        assertThat(c.delivered()).isFalse();
        return c.path().substring("/invite/".length());
    }

    private static String codeFor(byte[] secret, Instant at) {
        return Totp.codeAt(secret, Totp.stepAt(at.getEpochSecond()));
    }

    @Test
    void onlyTheHashOfTheTokenIsStored() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        AdminInvite row = store.rows.values().iterator().next();
        assertThat(token).hasSize(43);
        assertThat(row.tokenHash()).hasSize(64).isNotEqualTo(token).doesNotContain(token)
                .isEqualTo(AdminInviteService.hash(token));
        assertThat(row.expiresAt()).isEqualTo(clock.instant().plus(Duration.ofHours(48)));
        assertThat(row.invitedBy()).isEqualTo(BOSS);
    }

    @Test
    void botDeliveryHidesTheLinkAndFailureShowsIt() {
        when(messenger.sendInvite(eq(NEWBIE), anyString(), any(), anyString(), anyString(), any())).thenReturn(true);
        AdminInviteService.Created sent = service.create(AdminInvite.Kind.NEW, NEWBIE, "N", AdminRole.ADMIN, BOSS);
        assertThat(sent.delivered()).isTrue();
        assertThat(sent.link()).isNull();
        assertThat(sent.path()).isNull();

        when(messenger.sendInvite(eq(NEWBIE), anyString(), any(), anyString(), anyString(), any())).thenReturn(false);
        AdminInviteService.Created notSent = service.create(AdminInvite.Kind.NEW, NEWBIE, "N", AdminRole.ADMIN, BOSS);
        assertThat(notSent.delivered()).isFalse();
        assertThat(notSent.link()).startsWith("https://admin.example.com/invite/");
        // A new invite revokes the previous one of the same person.
        assertThat(store.byId(sent.inviteId()).orElseThrow().revokedAt()).isNotNull();
    }

    @Test
    void withoutAnHttpsAdminUrlTheBotIsNotTried() {
        service = service("");
        AdminInviteService.Created c = service.create(AdminInvite.Kind.NEW, NEWBIE, "N", AdminRole.ADMIN, BOSS);
        assertThat(c.delivered()).isFalse();
        assertThat(c.link()).isNull();
        assertThat(c.path()).startsWith("/invite/");
        verify(messenger, never()).sendInvite(anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void fullFlowCreatesTheAdminAndTheLinkIsSingleUse() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        AdminInviteService.InviteInfo info = service.check(token);
        assertThat(info.kind()).isEqualTo("NEW");
        assertThat(info.loginEditable()).isTrue();
        assertThat(info.twoFactorSetup()).isTrue();

        AdminInviteService.AcceptResult step1 = service.accept(token, "new.admin", "long-enough-pass");
        assertThat(step1.next()).isEqualTo("SETUP");
        // Nothing is active before the code.
        assertThat(admins.rows).doesNotContainKey(NEWBIE);

        byte[] secret = Base32.decode(step1.setup().secret());
        AdminAuthService.Outcome done = service.complete(token, codeFor(secret, clock.instant()), false, CLIENT);
        assertThat(done.accessToken()).isEqualTo("access-token");

        AdminUser created = admins.rows.get(NEWBIE);
        assertThat(created.getUsername()).isEqualTo("new.admin");
        assertThat(created.getRole()).isEqualTo(AdminRole.ADMIN);
        assertThat(created.isActive()).isTrue();
        assertThat(created.isTotpEnabled()).isTrue();
        assertThat(encoder.matches("long-enough-pass", created.getPasswordHash())).isTrue();
        assertThat(created.getTotpLastStep()).isEqualTo(Totp.stepAt(clock.instant().getEpochSecond()));
        verify(sessions).revokeEverything(NEWBIE);
        verify(authService).completeInvite(NEWBIE, true, false, CLIENT);

        // Reuse: every step now answers «invalid».
        assertInvalid(() -> service.check(token));
        assertInvalid(() -> service.accept(token, "other.login", "long-enough-pass"));
        assertInvalid(() -> service.complete(token, codeFor(secret, clock.instant()), false, CLIENT));
        AdminInvite row = store.rows.values().iterator().next();
        assertThat(row.usedAt()).isNotNull();
        assertThat(row.pendingPasswordHash()).isNull();
        assertThat(row.pendingTotpEnc()).isNull();
    }

    @Test
    void expiresAfter48Hours() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        clock.advance(Duration.ofHours(48).minusSeconds(1));
        service.check(token);
        clock.advance(Duration.ofSeconds(2));
        assertInvalid(() -> service.check(token));
    }

    @Test
    void revokedAndUnknownAndMalformedTokensLookTheSame() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        store.revoke(store.rows.keySet().iterator().next(), clock.instant());
        assertInvalid(() -> service.check(token));
        assertInvalid(() -> service.check(AdminInviteService.newToken()));
        assertInvalid(() -> service.check("short"));
        assertInvalid(() -> service.check(null));
        assertInvalid(() -> service.check(token + "x"));
    }

    @Test
    void guessingTokensFindsNothing() {
        invite(AdminInvite.Kind.NEW, NEWBIE);
        Set<String> tried = new HashSet<>();
        for (int i = 0; i < 2_000; i++) {
            String guess = AdminInviteService.newToken();
            tried.add(guess);
            assertInvalid(() -> service.check(guess));
        }
        assertThat(tried).hasSize(2_000); // 256-bit tokens never repeat
    }

    @Test
    void theCodeStepNeedsTheFirstStepAndTheLinkSurvivesAWrongCode() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        assertThatThrownBy(() -> service.complete(token, "123456", false, CLIENT))
                .isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo("INVITE_STEP_EXPIRED");

        AdminInviteService.AcceptResult step1 = service.accept(token, "new.admin", "long-enough-pass");
        byte[] secret = Base32.decode(step1.setup().secret());
        String wrong = Totp.codeAt(secret, Totp.stepAt(clock.instant().getEpochSecond()) + 5);
        assertThatThrownBy(() -> service.complete(token, wrong, false, CLIENT))
                .isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo("BAD_CODE");
        assertThat(admins.rows).doesNotContainKey(NEWBIE);
        service.complete(token, codeFor(secret, clock.instant()), false, CLIENT);
        assertThat(admins.rows).containsKey(NEWBIE);
    }

    @Test
    void fiveWrongCodesRevokeTheLink() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        AdminInviteService.AcceptResult step1 = service.accept(token, "new.admin", "long-enough-pass");
        byte[] secret = Base32.decode(step1.setup().secret());
        String wrong = Totp.codeAt(secret, Totp.stepAt(clock.instant().getEpochSecond()) + 7);
        for (int i = 1; i < AdminInviteService.MAX_CODE_FAILURES; i++) {
            assertThatThrownBy(() -> service.complete(token, wrong, false, CLIENT)).isInstanceOf(BadRequestException.class);
        }
        assertThatThrownBy(() -> service.complete(token, wrong, false, CLIENT))
                .isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo("INVITE_REVOKED");
        assertInvalid(() -> service.complete(token, codeFor(secret, clock.instant()), false, CLIENT));
        assertThat(admins.rows).doesNotContainKey(NEWBIE);
    }

    @Test
    void theFirstStepExpiresAfter30Minutes() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        AdminInviteService.AcceptResult step1 = service.accept(token, "new.admin", "long-enough-pass");
        clock.advance(Duration.ofMinutes(31));
        byte[] secret = Base32.decode(step1.setup().secret());
        assertThatThrownBy(() -> service.complete(token, codeFor(secret, clock.instant()), false, CLIENT))
                .isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo("INVITE_STEP_EXPIRED");
    }

    @Test
    void loginAndPasswordRules() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        assertCode(() -> service.accept(token, "ab", "long-enough-pass"), "BAD_USERNAME");
        assertCode(() -> service.accept(token, "кириллица", "long-enough-pass"), "BAD_USERNAME");
        assertCode(() -> service.accept(token, "x".repeat(33), "long-enough-pass"), "BAD_USERNAME");
        assertCode(() -> service.accept(token, "has space", "long-enough-pass"), "BAD_USERNAME");
        assertCode(() -> service.accept(token, "new.admin", "short"), "PASSWORD_TOO_SHORT");
        assertThatThrownBy(() -> service.accept(token, "BOSS", "long-enough-pass"))
                .isInstanceOf(ConflictException.class)
                .extracting(e -> ((ConflictException) e).getCode()).isEqualTo("USERNAME_TAKEN");
        assertThat(service.accept(token, "Ok_name-1.x", "long-enough-pass").next()).isEqualTo("SETUP");
    }

    @Test
    void existingTelegramOnlyAdminGetsALoginNotADuplicate() {
        admins.add(977L, null, AdminRole.ADMIN, null);
        String token = invite(AdminInvite.Kind.CREDENTIALS, 977L);
        AdminInviteService.AcceptResult step1 = service.accept(token, "helper", "long-enough-pass");
        assertThat(step1.next()).isEqualTo("SETUP");
        service.complete(token, codeFor(Base32.decode(step1.setup().secret()), clock.instant()), false, CLIENT);
        assertThat(admins.rows).hasSize(2);
        assertThat(admins.rows.get(977L).getUsername()).isEqualTo("helper");
        assertThat(admins.rows.get(977L).getRole()).isEqualTo(AdminRole.ADMIN);
        assertThat(admins.rows.get(977L).isTotpEnabled()).isTrue();
    }

    @Test
    void passwordResetWithTwoFactorAsksForTheCurrentCode() {
        byte[] secret = Totp.newSecret();
        AdminUser helper = admins.add(42L, "helper", AdminRole.ADMIN, cipher.encrypt(secret, 42L));
        helper.setPasswordHash(null); // reset: the old password is already gone
        String token = invite(AdminInvite.Kind.PASSWORD_RESET, 42L);
        AdminInviteService.InviteInfo info = service.check(token);
        assertThat(info.loginEditable()).isFalse();
        assertThat(info.username()).isEqualTo("helper");
        assertThat(info.twoFactorSetup()).isFalse();

        AdminInviteService.AcceptResult step1 = service.accept(token, "ignored", "brand-new-password");
        assertThat(step1.next()).isEqualTo("VERIFY");
        assertThat(step1.setup()).isNull();
        String code = codeFor(secret, clock.instant());
        service.complete(token, code, true, CLIENT);
        assertThat(admins.rows.get(42L).getUsername()).isEqualTo("helper");
        assertThat(encoder.matches("brand-new-password", admins.rows.get(42L).getPasswordHash())).isTrue();
        verify(authService).completeInvite(42L, false, true, CLIENT);
    }

    @Test
    void inviteForABlockedOrAlreadyCreatedAccountStopsWorking() {
        String token = invite(AdminInvite.Kind.NEW, NEWBIE);
        admins.add(NEWBIE, "someone", AdminRole.ADMIN, null); // became an admin another way meanwhile
        assertInvalid(() -> service.check(token));

        AdminUser helper = admins.add(43L, null, AdminRole.ADMIN, null);
        String token2 = invite(AdminInvite.Kind.CREDENTIALS, 43L);
        helper.setActive(false);
        assertInvalid(() -> service.check(token2));
    }

    private static void assertInvalid(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertCode(call, "INVITE_INVALID");
    }

    private static void assertCode(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo(code);
    }
}
