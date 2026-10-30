package com.maxsolch.shop.staff.app;

import com.maxsolch.shop.customer.app.AdminCheck;
import com.maxsolch.shop.staff.infra.AdminUserRepository;
import org.springframework.stereotype.Service;

/** Implements customer's {@link AdminCheck} port: is this Telegram user an active admin right now. */
@Service
public class StaffAdminCheck implements AdminCheck {

    private final AdminUserRepository repository;

    public StaffAdminCheck(AdminUserRepository repository) {
        this.repository = repository;
    }

    @Override
    public boolean isActive(long telegramUserId) {
        return repository.existsByTelegramUserIdAndActiveTrue(telegramUserId);
    }
}
