package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.adminauth.AdminAuthService.Outcome;
import com.maxsolch.shop.adminauth.AdminAuthService.Status;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.security.TgInitDataValidator;
import com.maxsolch.shop.service.AuthService;
import com.maxsolch.shop.web.UnauthorizedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The two-step sign-in end to end over real TOTP / pre-auth / lockout logic, with the database
 * replaced by one in-memory admin row.
 */
class AdminAuthServiceTest {

    private static final String JWT_SECRET = "ZTJlLW9ubHktand0LXNlY3JldC1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLTAwMDAwMDA=";
    private static final long ID = 7L;
    private static final ClientInfo CLIENT = new ClientInfo("203.0.113.5", "Mozilla/5.0 (Windows NT 10.0) Chrome/130");

    MutableClock clock;
    AdminUser admin;
    AdminUserRepository repo;
    TrustedDeviceService trustedDevices;
    AdminLoginLogService loginLog;
    AdminSecurityAlerts alerts;
    AdminAuditService audit;
    SecretCipher cipher;
    JwtService jwtService;
    AdminAuthService service;
    byte[] secret;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-05T09:12:00Z"));
        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
        admin = new AdminUser();
        admin.setTelegramUserId(ID);
        admin.setUsername("boss");
        admin.setPasswordHash(encoder.encode("right-password"));
        admin.setRole(AdminRole.SUPER_ADMIN);
        admin.setActive(true);
        admin.setTokenVersion(4);

        repo = mock(AdminUserRepository.class);
        lenient().when(repo.findByUsername("boss")).thenAnswer(i -> Optional.of(admin));
        lenient().when(repo.findByUsername(anyString())).thenAnswer(i ->
                "boss".equals(i.getArgument(0)) ? Optional.of(admin) : Optional.empty());
        lenient().when(repo.findByTelegramUserIdAndActiveTrue(ID)).thenAnswer(i -> Optional.of(admin));
        lenient().when(repo.save(any(AdminUser.class))).thenAnswer(i -> i.getArgument(0));
        lenient().when(repo.acceptTotpStep(eq(ID), anyLong())).thenAnswer(i -> {
            long step = i.getArgument(1);
            if (admin.getTotpLastStep() == null || admin.getTotpLastStep() < step) {
                admin.setTotpLastStep(step);
                return 1;
            }
            return 0;
        });
        lenient().when(repo.incrementFailures(ID)).thenAnswer(i -> {
            admin.setFailedAttempts(admin.getFailedAttempts() + 1);
            return 1;
        });
        lenient().when(repo.failuresOf(ID)).thenAnswer(i -> Optional.of(admin.getFailedAttempts()));
        lenient().when(repo.lockUntil(eq(ID), any())).thenAnswer(i -> {
            admin.setLockedUntil(i.getArgument(1));
            admin.setFailedAttempts(0);
            return 1;
        });
        lenient().when(repo.resetFailures(ID)).thenAnswer(i -> {
            admin.setFailedAttempts(0);
            return 1;
        });

        trustedDevices = mock(TrustedDeviceService.class);
        loginLog = mock(AdminLoginLogService.class);
        lenient().when(loginLog.record(any(), any(), any(), any(), any(), any()))
                .thenReturn(new AdminLoginLogService.Recorded("Киев", "Windows · Chrome", true, false));
        alerts = mock(AdminSecurityAlerts.class);
        audit = mock(AdminAuditService.class);

        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret(JWT_SECRET);
        jwtService = new JwtService(props);
        AdminAuthKeys keys = new AdminAuthKeys(props);
        cipher = keys.cipher();
        PreAuthTokens preAuth = new PreAuthTokens(keys.preAuthKey(), clock);
        AdminTotp totp = new AdminTotp(cipher, repo, "ChiSetup Admin", clock);
        AdminLockout lockout = new AdminLockout(repo, audit, loginLog, alerts, ZoneId.of("Europe/Kyiv"), clock);
        service = new AdminAuthService(repo, encoder, mock(TgInitDataValidator.class), mock(AuthService.class),
                jwtService, preAuth, totp, lockout, trustedDevices, loginLog, audit, alerts);
    }

    private void enable2fa() {
        secret = Totp.newSecret();
        admin.setTotpSecretEnc(cipher.encrypt(secret, ID));
        admin.setTotpEnabledAt(clock.instant());
    }

    private String code() {
        return Totp.codeAt(secret, Totp.stepAt(clock.instant().getEpochSecond()));
    }

    private String wrongCode() {
        String c = code();
        return c.equals("000000") ? "000001" : "000000";
    }

    @Test
    void withoutTwoFactor_thePasswordOnlyLeadsToSetup_neverToAnAccessToken() {
        Outcome o = service.passwordLogin("boss", "right-password", null, CLIENT);
        assertThat(o.status()).isEqualTo(Status.SETUP_REQUIRED);
        assertThat(o.accessToken()).isNull();
        assertThat(o.preAuthToken()).isNotBlank();
        // A SETUP pre-auth token cannot be used to verify.
        assertThatThrownBy(() -> service.verify(o.preAuthToken(), "123456", false, CLIENT))
                .isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void setupThenConfirm_enables2faAndSignsIn() {
        Outcome first = service.passwordLogin("boss", "right-password", null, CLIENT);
        AdminAuthService.SetupInfo setup = service.setup(first.preAuthToken());
        assertThat(setup.otpauthUri()).startsWith("otpauth://totp/ChiSetup%20Admin:boss?secret=" + setup.secret());
        assertThat(admin.isTotpEnabled()).isFalse();

        byte[] pending = Base32.decode(setup.secret());
        String code = Totp.codeAt(pending, Totp.stepAt(clock.instant().getEpochSecond()));
        Outcome done = service.confirmSetup(first.preAuthToken(), code, false, CLIENT);

        assertThat(done.status()).isEqualTo(Status.OK);
        AuthPrincipal p = jwtService.parse(done.accessToken());
        assertThat(p.role()).isEqualTo(Role.ADMIN);
        assertThat(p.tokenVersion()).isEqualTo(4);
        assertThat(admin.isTotpEnabled()).isTrue();
        assertThat(admin.getTotpPendingEnc()).isNull();
        assertThat(cipher.decrypt(admin.getTotpSecretEnc(), ID)).isEqualTo(pending);
        verify(audit).recordFor(eq(ID), eq("ADMIN_2FA_SETUP"), any(), any(), any());
        // The pre-auth token is spent.
        assertThatThrownBy(() -> service.confirmSetup(first.preAuthToken(), code, false, CLIENT))
                .isInstanceOf(UnauthorizedException.class);
    }

    @Test
    void passwordThenCode_signsIn_andANewDeviceTriggersTheAlert() {
        enable2fa();
        Outcome first = service.passwordLogin("boss", "right-password", null, CLIENT);
        assertThat(first.status()).isEqualTo(Status.TOTP_REQUIRED);
        assertThat(first.accessToken()).isNull();

        Outcome done = service.verify(first.preAuthToken(), code(), false, CLIENT);
        assertThat(done.status()).isEqualTo(Status.OK);
        assertThat(jwtService.parse(done.accessToken()).telegramUserId()).isEqualTo(ID);
        assertThat(done.trustedDeviceToken()).isNull();
        verify(alerts).newDeviceLogin(eq(ID), eq(LoginMethod.PASSWORD), eq("Киев"), eq("Windows · Chrome"),
                eq("203.0.113.5"), any());
    }

    @Test
    void theSameCodeIsNeverAcceptedTwice() {
        enable2fa();
        String code = code();
        Outcome a = service.passwordLogin("boss", "right-password", null, CLIENT);
        service.verify(a.preAuthToken(), code, false, CLIENT);

        Outcome b = service.passwordLogin("boss", "right-password", null, CLIENT);
        assertThatThrownBy(() -> service.verify(b.preAuthToken(), code, false, CLIENT))
                .isInstanceOf(UnauthorizedException.class).hasMessageContaining("Неверный код");
        // Next 30-second step: a fresh code works.
        clock.advance(Duration.ofSeconds(30));
        assertThat(service.verify(b.preAuthToken(), code(), false, CLIENT).status()).isEqualTo(Status.OK);
    }

    @Test
    void trustDevice_issuesTheDeviceToken_andTheTrustedDeviceSkipsTheCode() {
        enable2fa();
        when(trustedDevices.issue(eq(ID), eq(4), any(), any())).thenReturn("device-token");
        Outcome a = service.passwordLogin("boss", "right-password", null, CLIENT);
        Outcome done = service.verify(a.preAuthToken(), code(), true, CLIENT);
        assertThat(done.trustedDeviceToken()).isEqualTo("device-token");

        when(trustedDevices.isTrusted(ID, 4, "device-token")).thenReturn(true);
        Outcome again = service.passwordLogin("boss", "right-password", "device-token", CLIENT);
        assertThat(again.status()).isEqualTo(Status.OK);
        assertThat(again.accessToken()).isNotBlank();
        // An unknown cookie does not.
        assertThat(service.passwordLogin("boss", "right-password", "forged", CLIENT).status())
                .isEqualTo(Status.TOTP_REQUIRED);
    }

    @Test
    void fiveWrongPasswordsLockTheAccount_evenForTheRightPassword() {
        enable2fa();
        for (int i = 0; i < AdminLockout.MAX_FAILURES - 1; i++) {
            assertThatThrownBy(() -> service.passwordLogin("boss", "wrong", null, CLIENT))
                    .isInstanceOf(UnauthorizedException.class);
        }
        assertThatThrownBy(() -> service.passwordLogin("boss", "wrong", null, CLIENT))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("заблокирован до 12:27");
        assertThatThrownBy(() -> service.passwordLogin("boss", "right-password", null, CLIENT))
                .isInstanceOf(ResponseStatusException.class);
        verify(alerts).accountLocked(eq(ID), any(), any(), eq("203.0.113.5"), any());
        verify(audit).recordFor(eq(ID), eq("ADMIN_LOCKED"), any(), any(), any());

        clock.advance(AdminLockout.LOCK_DURATION.plusSeconds(1));
        assertThat(service.passwordLogin("boss", "right-password", null, CLIENT).status())
                .isEqualTo(Status.TOTP_REQUIRED);
    }

    @Test
    void wrongCodesCountToo_andTheRightPasswordDoesNotResetTheCount() {
        enable2fa();
        for (int i = 0; i < AdminLockout.MAX_FAILURES - 1; i++) {
            Outcome o = service.passwordLogin("boss", "right-password", null, CLIENT);
            assertThatThrownBy(() -> service.verify(o.preAuthToken(), wrongCode(), false, CLIENT))
                    .isInstanceOf(UnauthorizedException.class);
        }
        Outcome o = service.passwordLogin("boss", "right-password", null, CLIENT);
        assertThatThrownBy(() -> service.verify(o.preAuthToken(), wrongCode(), false, CLIENT))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("заблокирован");
        // Locked: even the right code on a still-valid pre-auth token is refused.
        Outcome stale = o;
        assertThatThrownBy(() -> service.verify(stale.preAuthToken(), code(), false, CLIENT))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void aFinishedSignInClearsTheCount() {
        enable2fa();
        for (int i = 0; i < AdminLockout.MAX_FAILURES - 1; i++) {
            assertThatThrownBy(() -> service.passwordLogin("boss", "wrong", null, CLIENT))
                    .isInstanceOf(UnauthorizedException.class);
        }
        Outcome o = service.passwordLogin("boss", "right-password", null, CLIENT);
        service.verify(o.preAuthToken(), code(), false, CLIENT);
        assertThat(admin.getFailedAttempts()).isZero();
    }

    @Test
    void unknownLogin_runsBcrypt_andLocksLikeARealOne() {
        for (int i = 0; i < AdminLockout.MAX_FAILURES; i++) {
            assertThatThrownBy(() -> service.passwordLogin("ghost", "x", null, CLIENT))
                    .isInstanceOf(UnauthorizedException.class).hasMessage("Неверный логин или пароль");
        }
        assertThatThrownBy(() -> service.passwordLogin("ghost", "x", null, CLIENT))
                .isInstanceOf(ResponseStatusException.class).hasMessageContaining("заблокирован");
        verify(repo, never()).incrementFailures(anyLong());
    }

    @Test
    void logoutEverywhere_killsAHalfFinishedSignIn() {
        enable2fa();
        Outcome o = service.passwordLogin("boss", "right-password", null, CLIENT);
        admin.setTokenVersion(5); // «Выйти на всех устройствах» / «Заблокировать» in Telegram
        assertThatThrownBy(() -> service.verify(o.preAuthToken(), code(), false, CLIENT))
                .isInstanceOf(UnauthorizedException.class).hasMessageContaining("войдите заново");
    }

    @Test
    void preAuthTokenExpiresAfterFiveMinutes() {
        enable2fa();
        Outcome o = service.passwordLogin("boss", "right-password", null, CLIENT);
        clock.advance(Duration.ofMinutes(5).plusSeconds(1));
        assertThatThrownBy(() -> service.verify(o.preAuthToken(), code(), false, CLIENT))
                .isInstanceOf(UnauthorizedException.class);
        verify(trustedDevices, never()).issue(anyLong(), anyInt(), any(), isNull());
    }
}
