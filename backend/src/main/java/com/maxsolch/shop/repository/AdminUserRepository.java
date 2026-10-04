package com.maxsolch.shop.repository;

import com.maxsolch.shop.domain.AdminUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

public interface AdminUserRepository extends JpaRepository<AdminUser, Long> {

    Optional<AdminUser> findByTelegramUserIdAndActiveTrue(Long telegramUserId);

    boolean existsByTelegramUserIdAndActiveTrue(Long telegramUserId);

    Optional<AdminUser> findByUsername(String username);

    List<AdminUser> findAllByActiveTrue();

    /** «Выйти на всех устройствах»: every token issued so far stops matching. */
    @Transactional
    @Modifying
    @Query("update AdminUser a set a.tokenVersion = a.tokenVersion + 1 where a.telegramUserId = :id")
    int bumpTokenVersion(@Param("id") Long telegramUserId);
}
