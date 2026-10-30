package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.staff.infra.AdminUserRepository;
import org.springframework.stereotype.Service;

/** What the other modules may ask the staff module: is this Telegram user an active admin right now. */
@Service
public class Admins {

    private final AdminUserRepository repository;

    public Admins(AdminUserRepository repository) {
        this.repository = repository;
    }

    public boolean isActive(long telegramUserId) {
        return repository.existsByTelegramUserIdAndActiveTrue(telegramUserId);
    }
}
