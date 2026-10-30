package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.platform.security.AdminDirectory;
import com.maxsolch.shop.staff.domain.AdminUser;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/** The admin accounts as the platform sees them (token check, role guards, audit author). */
@Component
public class StaffAdminDirectory implements AdminDirectory {

    private final AdminUserRepository repository;

    public StaffAdminDirectory(AdminUserRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ActiveAdmin> findActive(long telegramUserId) {
        return repository.findByTelegramUserIdAndActiveTrue(telegramUserId)
                .map(a -> new ActiveAdmin(a.getTokenVersion(), a.isSuperAdmin(), a.isFinance()));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> displayName(long telegramUserId) {
        return repository.findById(telegramUserId).map(StaffAdminDirectory::nameOf).filter(n -> !n.isEmpty());
    }

    private static String nameOf(AdminUser admin) {
        if (admin.getName() != null && !admin.getName().isBlank()) {
            return admin.getName().trim();
        }
        if (admin.getUsername() != null && !admin.getUsername().isBlank()) {
            return admin.getUsername().trim();
        }
        return "";
    }
}
