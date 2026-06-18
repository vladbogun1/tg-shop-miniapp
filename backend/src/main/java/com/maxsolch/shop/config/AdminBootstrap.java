package com.maxsolch.shop.config;

import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * On startup, ensures a browser-login admin account exists, driven by
 * {@code app.security.admin-login} / {@code admin-password} (env ADMIN_LOGIN / ADMIN_PASSWORD).
 * The credentials are attached to the admin_users row with telegram_user_id =
 * {@code app.security.admin-bootstrap-tg-id}. Idempotent: updates the hash if the password changes.
 */
@Slf4j
@Component
public class AdminBootstrap implements CommandLineRunner {

    private final AppProperties props;
    private final AdminUserRepository adminUserRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminBootstrap(AppProperties props,
                          AdminUserRepository adminUserRepository,
                          PasswordEncoder passwordEncoder) {
        this.props = props;
        this.adminUserRepository = adminUserRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        String login = props.getSecurity().getAdminLogin();
        String password = props.getSecurity().getAdminPassword();
        if (login == null || login.isBlank() || password == null || password.isBlank()) {
            log.info("Admin bootstrap skipped (ADMIN_LOGIN / ADMIN_PASSWORD not set)");
            return;
        }
        long tgId = props.getSecurity().getAdminBootstrapTgId();
        AdminUser admin = adminUserRepository.findById(tgId).orElseGet(() -> {
            AdminUser a = new AdminUser();
            a.setTelegramUserId(tgId);
            a.setRole(AdminRole.SUPER_ADMIN);
            a.setActive(true);
            a.setName("Bootstrap admin");
            return a;
        });
        admin.setUsername(login.trim());
        admin.setPasswordHash(passwordEncoder.encode(password));
        admin.setActive(true);
        if (admin.getRole() == null) {
            admin.setRole(AdminRole.SUPER_ADMIN);
        }
        adminUserRepository.save(admin);
        log.info("Admin bootstrap: login '{}' ready (tg id {})", login.trim(), tgId);
    }
}
