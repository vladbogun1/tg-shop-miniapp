package com.maxsolch.shop.staff.infra;

import com.maxsolch.shop.platform.config.StartupCheck;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;

/** A deploy that still carries the admin password placeholder from .env.example is misconfigured. */
@Slf4j
@Component
class StaffStartupCheck implements StartupCheck {

    private static final List<String> PLACEHOLDER_PASSWORDS =
            List.of("change_me", "change_me_admin", "change_me_minio", "admin", "password");

    private final StaffProperties props;

    StaffStartupCheck(StaffProperties props) {
        this.props = props;
    }

    @Override
    public void check(boolean dev, List<String> fatal) {
        String adminPassword = props.getSecurity().getAdminPassword();
        if (adminPassword != null && !adminPassword.isBlank()
                && PLACEHOLDER_PASSWORDS.contains(adminPassword.trim().toLowerCase())) {
            String message = "ADMIN_PASSWORD — это плейсхолдер из .env.example. Задайте настоящий пароль.";
            if (dev) {
                log.warn("SECURITY: {}", message);
            } else {
                fatal.add(message);
            }
        }
    }
}
