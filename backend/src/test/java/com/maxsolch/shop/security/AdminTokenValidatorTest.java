package com.maxsolch.shop.security;

import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

/**
 * Admin JWTs live for 30 days, so without this check deactivating an admin or changing a password
 * left every issued token fully usable until it expired on its own.
 */
@ExtendWith(MockitoExtension.class)
class AdminTokenValidatorTest {

    @Mock
    AdminUserRepository adminUserRepository;

    @InjectMocks
    AdminTokenValidator validator;

    private AdminUser admin(int tokenVersion) {
        AdminUser a = new AdminUser();
        a.setTelegramUserId(42L);
        a.setTokenVersion(tokenVersion);
        a.setActive(true);
        return a;
    }

    @Test
    void customerTokensAreNotSubjectToRevocation() {
        // No DB lookup at all for CUSTOMER — they carry no revocation state.
        assertThat(validator.isValid(new AuthPrincipal(1L, Role.CUSTOMER, 0))).isTrue();
    }

    @Test
    void matchingTokenVersionIsAccepted() {
        when(adminUserRepository.findByTelegramUserIdAndActiveTrue(anyLong()))
                .thenReturn(Optional.of(admin(3)));

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 3))).isTrue();
    }

    @Test
    void tokenMintedBeforeAPasswordChangeIsRejected() {
        when(adminUserRepository.findByTelegramUserIdAndActiveTrue(anyLong()))
                .thenReturn(Optional.of(admin(4))); // version bumped by the password change

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 3))).isFalse();
    }

    @Test
    void deactivatedAdminIsRejected() {
        // findByTelegramUserIdAndActiveTrue returns nothing once the account is switched off.
        when(adminUserRepository.findByTelegramUserIdAndActiveTrue(anyLong()))
                .thenReturn(Optional.empty());

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 0))).isFalse();
    }

    @Test
    void nullPrincipalIsHarmless() {
        assertThat(validator.isValid(null)).isTrue();
    }
}
