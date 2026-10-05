package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.security.AdminAccess;
import com.maxsolch.shop.security.AdminTokenValidator;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The rules of the «Админы» section: never yourself, never the last super admin, code for danger, journal. */
class AdminTeamServiceTest {

    private static final String JWT_SECRET = "ZTJlLW9ubHktand0LXNlY3JldC1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLTAwMDAwMDA=";
    private static final ClientInfo CLIENT = new ClientInfo("198.51.100.4", "Mozilla/5.0 (Windows NT 10.0) Chrome/130");
    private static final long BOSS = 1L;
    private static final long HELPER = 2L;

    MutableClock clock;
    FakeAdmins admins;
    InMemoryInviteStore store;
    AdminInviteService invites;
    AdminSessions sessions;
    TrustedDeviceService trustedDevices;
    AdminTeamFacts facts;
    AdminAuditService audit;
    AdminTeamMessenger messenger;
    AdminTeamService team;
    SecretCipher cipher;
    byte[] bossSecret;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-05T10:00:00Z"));
        admins = new FakeAdmins();
        store = new InMemoryInviteStore();
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret(JWT_SECRET);
        cipher = new AdminAuthKeys(props).cipher();
        bossSecret = Totp.newSecret();
        admins.add(BOSS, "boss", AdminRole.SUPER_ADMIN, cipher.encrypt(bossSecret, BOSS));
        admins.add(HELPER, "helper", AdminRole.ADMIN, cipher.encrypt(Totp.newSecret(), HELPER));

        AdminTotp totp = new AdminTotp(cipher, admins.repo, "ChiSetup Admin", clock);
        audit = mock(AdminAuditService.class);
        AdminLoginLogService loginLog = mock(AdminLoginLogService.class);
        when(loginLog.record(any(), any(), any(), any(), any(), any()))
                .thenReturn(new AdminLoginLogService.Recorded("Киев", "Windows · Chrome", false, false));
        AdminLockout lockout = new AdminLockout(admins.repo, audit, loginLog, mock(AdminSecurityAlerts.class),
                ZoneId.of("Europe/Kyiv"), clock);
        sessions = mock(AdminSessions.class);
        when(sessions.revokeEverything(anyLong())).thenAnswer(i -> {
            admins.repo.bumpTokenVersion(i.getArgument(0));
            return 1;
        });
        trustedDevices = mock(TrustedDeviceService.class);
        facts = mock(AdminTeamFacts.class);
        when(facts.history(anyLong())).thenReturn(List.of());
        when(facts.telegramLabels(any())).thenReturn(Map.of());
        when(facts.lastLogins()).thenReturn(Map.of());
        when(facts.trustedDevices()).thenReturn(Map.of());
        messenger = mock(AdminTeamMessenger.class);
        invites = new AdminInviteService(store, admins.repo, new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder(4),
                totp, sessions, mock(AdminTokenValidator.class), mock(AdminAuthService.class), audit, messenger,
                org.springframework.transaction.support.TransactionOperations.withoutTransaction(), "", clock);
        team = new AdminTeamService(admins.repo, invites, store, totp, lockout, sessions, trustedDevices,
                mock(AdminTokenValidator.class), facts, audit, messenger, clock);
    }

    /** A code of the boss's authenticator not used yet (each code is accepted once). */
    private String code() {
        clock.advance(java.time.Duration.ofSeconds(30)); // the next 30-second step
        return Totp.codeAt(bossSecret, Totp.stepAt(clock.instant().getEpochSecond()));
    }

    private static void assertConflict(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String code) {
        assertThatThrownBy(call).isInstanceOf(ConflictException.class)
                .extracting(e -> ((ConflictException) e).getCode()).isEqualTo(code);
    }

    // ------------------------------------------------------------------ never yourself

    @Test
    void nothingInThisSectionActsOnYourself() {
        admins.add(3L, "second-boss", AdminRole.SUPER_ADMIN, cipher.encrypt(Totp.newSecret(), 3L));
        assertConflict(() -> team.block(BOSS, BOSS, code(), CLIENT), "SELF");
        assertConflict(() -> team.resetTwoFactor(BOSS, BOSS, code(), CLIENT), "SELF");
        assertConflict(() -> team.resetPassword(BOSS, BOSS, code(), CLIENT), "SELF");
        assertConflict(() -> team.delete(BOSS, BOSS, code(), CLIENT), "SELF");
        assertConflict(() -> team.forgetDevices(BOSS, BOSS), "SELF");
        assertConflict(() -> team.update(BOSS, BOSS, "Новое имя", null, null, CLIENT), "SELF");
        assertConflict(() -> team.update(BOSS, BOSS, null, "ADMIN", code(), CLIENT), "SELF");
        assertConflict(() -> team.invite(BOSS, BOSS, "Я", "ADMIN", code(), CLIENT), "SELF");
        AdminUser boss = admins.rows.get(BOSS);
        assertThat(boss.isActive()).isTrue();
        assertThat(boss.isSuperAdmin()).isTrue();
        assertThat(boss.isTotpEnabled()).isTrue();
        verify(sessions, never()).revokeEverything(BOSS);
    }

    // ------------------------------------------------------------------ the last super admin

    @Test
    void theLastSuperAdminIsNeverDemotedBlockedResetOrDeleted() {
        assertConflict(() -> team.update(BOSS, BOSS, null, "ADMIN", code(), CLIENT), "LAST_SUPER_ADMIN");
        assertConflict(() -> team.block(BOSS, BOSS, code(), CLIENT), "LAST_SUPER_ADMIN");
        assertConflict(() -> team.resetTwoFactor(BOSS, BOSS, code(), CLIENT), "LAST_SUPER_ADMIN");
        assertConflict(() -> team.delete(BOSS, BOSS, code(), CLIENT), "LAST_SUPER_ADMIN");
        assertThat(admins.rows.get(BOSS).isSuperAdmin()).isTrue();
    }

    @Test
    void guardCountsOnlyActiveSuperAdminsWithTwoFactor() {
        // Another super admin exists, but blocked / without 2FA does not count.
        AdminUser other = admins.add(3L, "other", AdminRole.SUPER_ADMIN, null);
        AdminUser boss = admins.rows.get(BOSS);
        assertConflict(() -> team.guard(99L, boss, true), "LAST_SUPER_ADMIN");
        other.setTotpSecretEnc(cipher.encrypt(Totp.newSecret(), 3L));
        other.setActive(false);
        assertConflict(() -> team.guard(99L, boss, true), "LAST_SUPER_ADMIN");
        other.setActive(true);
        team.guard(99L, boss, true); // now someone else can manage admins
    }

    @Test
    void anotherSuperAdminCanBeDemotedWhileOneRemains() {
        admins.add(3L, "second-boss", AdminRole.SUPER_ADMIN, cipher.encrypt(Totp.newSecret(), 3L));
        team.update(BOSS, 3L, null, "ADMIN", code(), CLIENT);
        assertThat(admins.rows.get(3L).getRole()).isEqualTo(AdminRole.ADMIN);
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_UPDATE"), eq("ADMIN"), eq("3"), contains("роль: главный админ → админ"));
    }

    // ------------------------------------------------------------------ the caller's code

    @Test
    void dangerousActionsNeedTheCallersCode() {
        assertThatThrownBy(() -> team.block(BOSS, HELPER, null, CLIENT)).isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo("CODE_REQUIRED");
        assertThatThrownBy(() -> team.block(BOSS, HELPER, "000000", CLIENT)).isInstanceOf(BadRequestException.class)
                .extracting(e -> ((BadRequestException) e).getCode()).isEqualTo("BAD_CODE");
        assertThatThrownBy(() -> team.update(BOSS, HELPER, null, "SUPER_ADMIN", null, CLIENT))
                .isInstanceOf(BadRequestException.class);
        assertThat(admins.rows.get(HELPER).isActive()).isTrue();
        assertThat(admins.rows.get(HELPER).getRole()).isEqualTo(AdminRole.ADMIN);
        // A wrong code counts towards the caller's lock, like everywhere else.
        assertThat(admins.rows.get(BOSS).getFailedAttempts()).isEqualTo(1);
        // Renaming is not dangerous.
        team.update(BOSS, HELPER, "Помощник", null, null, CLIENT);
        assertThat(admins.rows.get(HELPER).getName()).isEqualTo("Помощник");
    }

    @Test
    void theSameCodeIsNotAcceptedTwice() {
        String c = code();
        team.forgetDevices(BOSS, HELPER);
        team.resetTwoFactor(BOSS, HELPER, c, CLIENT);
        assertThatThrownBy(() -> team.block(BOSS, HELPER, c, CLIENT)).isInstanceOf(BadRequestException.class);
    }

    // ------------------------------------------------------------------ actions

    @Test
    void blockEndsEverythingAndUnblockRestores() {
        int versionBefore = admins.rows.get(HELPER).getTokenVersion();
        team.block(BOSS, HELPER, code(), CLIENT);
        AdminUser helper = admins.rows.get(HELPER);
        assertThat(helper.isActive()).isFalse();
        assertThat(helper.getTokenVersion()).isEqualTo(versionBefore + 1);
        verify(sessions).revokeEverything(HELPER);
        verify(facts).deletePushSubscriptions(HELPER);
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_BLOCKED"), eq("ADMIN"), eq("2"), anyString());
        verify(messenger).accountNotice(eq(HELPER), contains("заблокирован"));
        // A blocked admin can neither sign in (findByTelegramUserIdAndActiveTrue) nor get a login link.
        assertThat(admins.repo.findByTelegramUserIdAndActiveTrue(HELPER)).isEmpty();
        assertConflict(() -> team.resetPassword(BOSS, HELPER, code(), CLIENT), "BLOCKED");

        team.unblock(BOSS, HELPER, code(), CLIENT);
        assertThat(admins.rows.get(HELPER).isActive()).isTrue();
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_UNBLOCKED"), eq("ADMIN"), eq("2"), anyString());
    }

    @Test
    void resetTwoFactorWipesTheSecretAndEndsSessions() {
        team.resetTwoFactor(BOSS, HELPER, code(), CLIENT);
        AdminUser helper = admins.rows.get(HELPER);
        assertThat(helper.isTotpEnabled()).isFalse();
        assertThat(helper.getTotpEnabledAt()).isNull();
        verify(sessions).revokeEverything(HELPER);
        verify(messenger).accountNotice(eq(HELPER), contains("сброшена"));
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_2FA_RESET_BY"), eq("ADMIN"), eq("2"), anyString());
    }

    @Test
    void resetPasswordKillsTheOldOneAndCreatesALink() {
        AdminInviteService.Created c = team.resetPassword(BOSS, HELPER, code(), CLIENT);
        assertThat(admins.rows.get(HELPER).getPasswordHash()).isNull();
        assertThat(c.kind()).isEqualTo(AdminInvite.Kind.PASSWORD_RESET);
        assertThat(c.path()).startsWith("/invite/");
        verify(sessions).revokeEverything(HELPER);
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_PASSWORD_RESET_BY"), eq("ADMIN"), eq("2"), anyString());
    }

    @Test
    void deleteOnlyWithoutHistory() {
        when(facts.history(HELPER)).thenReturn(List.of("записей в журнале: 3"));
        assertConflict(() -> team.delete(BOSS, HELPER, code(), CLIENT), "HAS_HISTORY");
        assertThat(admins.rows).containsKey(HELPER);

        when(facts.history(HELPER)).thenReturn(List.of());
        team.delete(BOSS, HELPER, code(), CLIENT);
        assertThat(admins.rows).doesNotContainKey(HELPER);
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_DELETED"), eq("ADMIN"), eq("2"), anyString());
    }

    @Test
    void invitesNewExistingAndRefusesDuplicates() {
        AdminInviteService.Created fresh = team.invite(BOSS, 500L, "Новичок", "ADMIN", code(), CLIENT);
        assertThat(fresh.kind()).isEqualTo(AdminInvite.Kind.NEW);
        verify(audit).recordFor(eq(BOSS), eq("ADMIN_INVITE"), eq("ADMIN"), eq("500"), anyString());

        // Has login + password already → «Сбросить пароль» instead.
        assertConflict(() -> team.invite(BOSS, HELPER, "x", "ADMIN", code(), CLIENT), "HAS_LOGIN");
        // Telegram-only admin (like 977067472): a login link, not a second row.
        admins.add(977L, null, AdminRole.ADMIN, null);
        assertThat(team.invite(BOSS, 977L, null, null, code(), CLIENT).kind()).isEqualTo(AdminInvite.Kind.CREDENTIALS);
        assertThat(admins.rows).hasSize(3);
        // A NEW invite needs a name and a valid role.
        assertThatThrownBy(() -> team.invite(BOSS, 600L, " ", "ADMIN", code(), CLIENT)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> team.invite(BOSS, 600L, "Имя", "ROOT", code(), CLIENT)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> team.invite(BOSS, -5L, "Имя", "ADMIN", code(), CLIENT)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void listShowsAdminsAndOpenInvites() {
        team.invite(BOSS, 500L, "Новичок", "ADMIN", code(), CLIENT);
        AdminTeamService.Team t = team.team(BOSS);
        assertThat(t.admins()).extracting(AdminTeamService.AdminRow::telegramUserId).containsExactly(BOSS, HELPER);
        assertThat(t.admins().get(0).self()).isTrue();
        assertThat(t.admins().get(0).status()).isEqualTo("SUPER_ADMIN");
        assertThat(t.invites()).hasSize(1);
        assertThat(t.invites().get(0).name()).isEqualTo("Новичок");

        team.revokeInvite(BOSS, t.invites().get(0).id());
        assertThat(team.team(BOSS).invites()).isEmpty();
    }

    // ------------------------------------------------------------------ role from the database

    @Test
    void demotionTakesEffectOnTheNextRequest() {
        admins.add(3L, "second-boss", AdminRole.SUPER_ADMIN, cipher.encrypt(Totp.newSecret(), 3L));
        AdminAccess access = new AdminAccess(admins.repo);
        var auth = new UsernamePasswordAuthenticationToken(new AuthPrincipal(3L, Role.ADMIN, 0), null, List.of());
        assertThat(access.isSuperAdmin(auth)).isTrue();
        team.update(BOSS, 3L, null, "ADMIN", code(), CLIENT);
        assertThat(access.isSuperAdmin(auth)).isFalse(); // no cache window
        team.block(BOSS, HELPER, code(), CLIENT);
        assertThat(access.isSuperAdmin(new UsernamePasswordAuthenticationToken(
                new AuthPrincipal(HELPER, Role.ADMIN, 0), null, List.of()))).isFalse();
    }
}
