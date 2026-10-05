package com.maxsolch.shop.config;

import com.maxsolch.shop.adminauth.AdminAuthKeys;
import com.maxsolch.shop.adminauth.TrustedDeviceService;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.security.AdminTokenValidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminBootstrapTest {

    AppProperties props;
    AdminUserRepository repo;
    JdbcTemplate jdbc;
    TrustedDeviceService trustedDevices;
    AdminAuditService audit;
    BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    AdminBootstrap bootstrap;

    @BeforeEach
    void setUp() {
        props = new AppProperties();
        props.getSecurity().setJwtSecret("ZTJlLW9ubHktand0LXNlY3JldC1ub3QtZm9yLXByb2R1Y3Rpb24tdXNlLTAwMDAwMDA=");
        props.getSecurity().setAdminLogin("admin");
        props.getSecurity().setAdminPassword("from-env-password");
        props.getSecurity().setAdminBootstrapTgId(593289478L);
        repo = mock(AdminUserRepository.class);
        jdbc = mock(JdbcTemplate.class);
        trustedDevices = mock(TrustedDeviceService.class);
        audit = mock(AdminAuditService.class);
        when(repo.save(any(AdminUser.class))).thenAnswer(i -> i.getArgument(0));
        when(repo.findByUsername(anyString())).thenReturn(Optional.empty());
        bootstrap = new AdminBootstrap(props, repo, encoder, mock(AdminTokenValidator.class), trustedDevices,
                new AdminAuthKeys(props), audit, jdbc);
    }

    private AdminUser existing() {
        AdminUser a = new AdminUser();
        a.setTelegramUserId(593289478L);
        a.setUsername("admin");
        a.setPasswordHash(encoder.encode("changed-in-the-panel"));
        a.setTotpSecretEnc("v1:xxx");
        a.setTotpEnabledAt(Instant.now());
        a.setTokenVersion(9);
        a.setActive(true);
        return a;
    }

    @Test
    void neverOverwritesThePasswordOnceAPasswordAdminExists() {
        when(repo.existsByActiveTrueAndPasswordHashIsNotNull()).thenReturn(true);
        bootstrap.run();
        verify(repo, never()).save(any());
    }

    @Test
    void createsTheFirstAdminWhenThereIsNone() {
        when(repo.existsByActiveTrueAndPasswordHashIsNotNull()).thenReturn(false);
        when(repo.findById(593289478L)).thenReturn(Optional.empty());
        bootstrap.run();
        ArgumentCaptor<AdminUser> saved = ArgumentCaptor.forClass(AdminUser.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getUsername()).isEqualTo("admin");
        assertThat(encoder.matches("from-env-password", saved.getValue().getPasswordHash())).isTrue();
        assertThat(saved.getValue().isSuperAdmin()).isTrue();
        assertThat(saved.getValue().isTotpEnabled()).isFalse();
    }

    @Test
    void emergencyReset_restoresThePasswordAndWipes2fa_once() {
        props.getSecurity().setAdminEmergencyReset(true);
        AdminUser admin = existing();
        when(repo.findById(593289478L)).thenReturn(Optional.of(admin));
        when(jdbc.queryForObject(anyString(), eq(Integer.class), anyString())).thenReturn(0);

        bootstrap.run();

        assertThat(encoder.matches("from-env-password", admin.getPasswordHash())).isTrue();
        assertThat(admin.isTotpEnabled()).isFalse();
        assertThat(admin.getTokenVersion()).isEqualTo(10);
        verify(trustedDevices).revokeAll(593289478L);
        verify(jdbc).update(eq("INSERT INTO admin_emergency_resets (admin_id, marker) VALUES (?, ?)"),
                eq(593289478L), anyString());
        verify(audit).recordFor(eq(593289478L), eq("ADMIN_EMERGENCY_RESET"), any(), any(), any());

        // Restarted with the flag still on and the same ADMIN_PASSWORD: nothing happens again.
        when(jdbc.queryForObject(anyString(), eq(Integer.class), anyString())).thenReturn(1);
        AdminUser again = existing();
        when(repo.findById(593289478L)).thenReturn(Optional.of(again));
        bootstrap.run();
        assertThat(again.isTotpEnabled()).isTrue();
    }
}
