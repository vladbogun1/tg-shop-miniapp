package com.maxsolch.shop.platform.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
    AdminDirectory admins;

    @Mock
    AdminTokenRevocations revocations;

    AdminTokenValidator validator;

    @org.junit.jupiter.api.BeforeEach
    void setUp() {
        validator = new AdminTokenValidator(admins, revocations, new org.springframework.cache.concurrent.ConcurrentMapCacheManager());
    }

    private AdminDirectory.ActiveAdmin admin(int tokenVersion) {
        return new AdminDirectory.ActiveAdmin(tokenVersion, false, false);
    }

    @Test
    void customerTokensAreNotSubjectToRevocation() {
        // No DB lookup at all for CUSTOMER — they carry no revocation state.
        assertThat(validator.isValid(new AuthPrincipal(1L, Role.CUSTOMER, 0))).isTrue();
    }

    @Test
    void matchingTokenVersionIsAccepted() {
        when(admins.findActive(anyLong()))
                .thenReturn(Optional.of(admin(3)));

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 3))).isTrue();
    }

    @Test
    void tokenMintedBeforeAPasswordChangeIsRejected() {
        when(admins.findActive(anyLong()))
                .thenReturn(Optional.of(admin(4))); // version bumped by the password change

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 3))).isFalse();
    }

    @Test
    void deactivatedAdminIsRejected() {
        // findByTelegramUserIdAndActiveTrue returns nothing once the account is switched off.
        when(admins.findActive(anyLong()))
                .thenReturn(Optional.empty());

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 0))).isFalse();
    }

    @Test
    void tokenRevokedByLogoutIsRejected_otherTokensOfTheSameAdminAreNot() {
        when(admins.findActive(anyLong()))
                .thenReturn(Optional.of(admin(3)));
        when(revocations.isRevoked("jti-logged-out")).thenReturn(true);

        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 3, null, null, "jti-logged-out", null)))
                .isFalse();
        assertThat(validator.isValid(new AuthPrincipal(42L, Role.ADMIN, 3, null, null, "jti-phone", null)))
                .isTrue();
    }

    @Test
    void nullPrincipalIsHarmless() {
        assertThat(validator.isValid(null)).isTrue();
    }
}
