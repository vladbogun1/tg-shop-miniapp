package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "admin_users")
public class AdminUser {

    @Id
    @Column(name = "telegram_user_id", nullable = false)
    private Long telegramUserId;

    /** Browser login (nullable for Telegram-only admins). */
    @Column(name = "username", length = 128)
    private String username;

    /** BCrypt hash of the admin password. */
    @Column(name = "password_hash", length = 255)
    private String passwordHash;

    @Column(name = "name", length = 255)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private AdminRole role = AdminRole.ADMIN;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;
}
