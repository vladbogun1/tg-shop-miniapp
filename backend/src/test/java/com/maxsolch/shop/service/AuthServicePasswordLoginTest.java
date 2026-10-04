package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.security.JwtService;
import com.maxsolch.shop.security.Role;
import com.maxsolch.shop.security.TgInitDataValidator;
import com.maxsolch.shop.web.UnauthorizedException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServicePasswordLoginTest {

    @Mock
    TgInitDataValidator initDataValidator;
    @Mock
    JwtService jwtService;
    @Mock
    UserRepository userRepository;
    @Mock
    AdminUserRepository adminUserRepository;
    @Mock
    PasswordEncoder passwordEncoder;

    AuthService service;

    @BeforeEach
    void setUp() {
        when(passwordEncoder.encode(anyString())).thenReturn("$dummy");
        service = new AuthService(initDataValidator, jwtService, userRepository, adminUserRepository,
                passwordEncoder);
        AdminUser admin = new AdminUser();
        admin.setTelegramUserId(7L);
        admin.setUsername("admin");
        admin.setPasswordHash("$real");
        admin.setActive(true);
        lenient().when(adminUserRepository.findByUsername("admin")).thenReturn(Optional.of(admin));
        lenient().when(passwordEncoder.matches("right", "$real")).thenReturn(true);
        lenient().when(jwtService.issueToken(anyLong(), eq(Role.ADMIN), anyInt())).thenReturn("jwt");
    }

    @Test
    void unknownLogin_stillRunsBcrypt_soTimingDoesNotRevealIt() {
        when(adminUserRepository.findByUsername("ghost")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.authenticateAdminPassword("ghost", "x"))
                .isInstanceOf(UnauthorizedException.class);
        verify(passwordEncoder).matches("x", "$dummy");
    }

    @Test
    void tooManyFailuresForOneLogin_blockEvenTheRightPassword() {
        for (int i = 0; i < AuthService.MAX_FAILED_LOGINS_PER_HOUR; i++) {
            assertThatThrownBy(() -> service.authenticateAdminPassword("admin", "wrong"))
                    .isInstanceOf(UnauthorizedException.class);
        }
        // Counted per login, case-insensitively, regardless of the caller's IP.
        assertThatThrownBy(() -> service.authenticateAdminPassword(" ADMIN ", "right"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Слишком много");
    }

    @Test
    void successClearsTheFailureCount() {
        for (int i = 0; i < AuthService.MAX_FAILED_LOGINS_PER_HOUR - 1; i++) {
            assertThatThrownBy(() -> service.authenticateAdminPassword("admin", "wrong"))
                    .isInstanceOf(UnauthorizedException.class);
        }
        assertThat(service.authenticateAdminPassword("admin", "right").accessToken()).isEqualTo("jwt");
        assertThatThrownBy(() -> service.authenticateAdminPassword("admin", "wrong"))
                .isInstanceOf(UnauthorizedException.class);
        assertThat(service.authenticateAdminPassword("admin", "right").accessToken()).isEqualTo("jwt");
    }
}
