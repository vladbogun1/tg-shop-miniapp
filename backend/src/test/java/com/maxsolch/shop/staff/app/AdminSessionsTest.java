package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.notification.app.AdminPushService;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import com.maxsolch.shop.platform.security.AdminTokenValidator;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * «Выйти везде», password change, 2FA reset: tokens, trusted devices AND push subscriptions of
 * that admin are gone — a signed-out phone must not keep receiving order / chat notifications.
 */
class AdminSessionsTest {

    private final AdminUserRepository repo = mock(AdminUserRepository.class);
    private final AdminTokenValidator validator = mock(AdminTokenValidator.class);
    private final TrustedDeviceService devices = mock(TrustedDeviceService.class);
    private final AdminPushService push = mock(AdminPushService.class);
    private final AdminSessions sessions = new AdminSessions(repo, validator, devices, push);

    @Test
    void revokeEverythingDropsTokensDevicesAndPushOfThatAdminOnly() {
        when(devices.revokeAll(7L)).thenReturn(2);

        int forgotten = sessions.revokeEverything(7L);

        assertThat(forgotten).isEqualTo(2);
        verify(repo).bumpTokenVersion(7L);
        verify(validator).invalidate(7L);
        verify(devices).revokeAll(7L);
        verify(push).forgetAdmin(7L);
        verify(push, never()).forgetAdmin(8L);
    }
}
