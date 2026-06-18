package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.AdminUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AdminUserRepository extends JpaRepository<AdminUser, Long> {

    Optional<AdminUser> findByTelegramUserIdAndActiveTrue(Long telegramUserId);

    boolean existsByTelegramUserIdAndActiveTrue(Long telegramUserId);

    Optional<AdminUser> findByUsername(String username);
}
