package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.domain.AdminRole;
import com.maxsolch.shop.staff.domain.AdminUser;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** The platform trusts this port for the token version, the roles and the name in the journal. */
class StaffAdminDirectoryTest {

    private final AdminUserRepository repo = mock(AdminUserRepository.class);
    private final StaffAdminDirectory directory = new StaffAdminDirectory(repo);

    private static AdminUser admin(AdminRole role, String name, String username, int version) {
        AdminUser a = new AdminUser();
        a.setRole(role);
        a.setName(name);
        a.setUsername(username);
        a.setTokenVersion(version);
        a.setActive(true);
        return a;
    }

    @Test
    void findActive_carriesTheTokenVersionAndTheRoles() {
        when(repo.findByTelegramUserIdAndActiveTrue(7L)).thenReturn(Optional.of(admin(AdminRole.SUPER_ADMIN, null, null, 4)));

        var found = directory.findActive(7L).orElseThrow();

        assertThat(found.tokenVersion()).isEqualTo(4);
        assertThat(found.superAdmin()).isTrue();
    }

    @Test
    void findActive_isEmptyForABlockedOrUnknownAdmin() {
        when(repo.findByTelegramUserIdAndActiveTrue(7L)).thenReturn(Optional.empty());

        assertThat(directory.findActive(7L)).isEmpty();
    }

    @Test
    void displayName_prefersTheNameThenTheUsername_andIsEmptyWhenNeitherIsSet() {
        when(repo.findById(1L)).thenReturn(Optional.of(admin(AdminRole.ADMIN, " Оля ", "olya", 0)));
        when(repo.findById(2L)).thenReturn(Optional.of(admin(AdminRole.ADMIN, " ", " boss ", 0)));
        when(repo.findById(3L)).thenReturn(Optional.of(admin(AdminRole.ADMIN, null, null, 0)));
        when(repo.findById(4L)).thenReturn(Optional.empty());

        assertThat(directory.displayName(1L)).contains("Оля");
        assertThat(directory.displayName(2L)).contains("boss");
        assertThat(directory.displayName(3L)).isEmpty();
        assertThat(directory.displayName(4L)).isEmpty();
    }
}
