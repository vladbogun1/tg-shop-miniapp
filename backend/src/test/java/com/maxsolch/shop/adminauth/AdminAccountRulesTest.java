package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminAccess;
import com.maxsolch.shop.security.AuthPrincipal;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Password rules of «Мой аккаунт» and the SUPER_ADMIN check behind @RequiredSuperAdmin. */
class AdminAccountRulesTest {

    @Test
    void newPasswordRules() {
        assertThatThrownBy(() -> AdminAccountService.validateNewPassword("short-9ch", "old"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("минимум 10");
        assertThatThrownBy(() -> AdminAccountService.validateNewPassword("x".repeat(73), "old"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("длинный");
        assertThatThrownBy(() -> AdminAccountService.validateNewPassword(" leading-space", "old"))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> AdminAccountService.validateNewPassword("same-as-before", "same-as-before"))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("совпадает");
        assertThatCode(() -> AdminAccountService.validateNewPassword("ровно10симв", "old")).doesNotThrowAnyException();
    }

    private static UsernamePasswordAuthenticationToken auth(long id, Role role) {
        return new UsernamePasswordAuthenticationToken(new AuthPrincipal(id, role, 0), null, List.of());
    }

    @Test
    void superAdminCheckLooksAtTheDatabaseRole() {
        AdminUserRepository repo = mock(AdminUserRepository.class);
        AdminUser boss = new AdminUser();
        boss.setTelegramUserId(1L);
        boss.setRole(AdminRole.SUPER_ADMIN);
        AdminUser helper = new AdminUser();
        helper.setTelegramUserId(2L);
        helper.setRole(AdminRole.ADMIN);
        when(repo.findByTelegramUserIdAndActiveTrue(1L)).thenReturn(Optional.of(boss));
        when(repo.findByTelegramUserIdAndActiveTrue(2L)).thenReturn(Optional.of(helper));
        when(repo.findByTelegramUserIdAndActiveTrue(3L)).thenReturn(Optional.empty());
        AdminAccess access = new AdminAccess(repo);

        assertThat(access.isSuperAdmin(auth(1L, Role.ADMIN))).isTrue();
        assertThat(access.isSuperAdmin(auth(2L, Role.ADMIN))).isFalse();
        assertThat(access.isSuperAdmin(auth(3L, Role.ADMIN))).isFalse();
        // A customer token with the boss's telegram id is not an admin at all.
        assertThat(access.isSuperAdmin(auth(1L, Role.CUSTOMER))).isFalse();
        assertThat(access.isSuperAdmin((org.springframework.security.core.Authentication) null)).isFalse();
    }
}
