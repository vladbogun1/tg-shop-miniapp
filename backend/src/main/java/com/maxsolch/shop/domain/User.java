package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(name = "telegram_user_id", nullable = false)
    private Long telegramUserId;

    @Column(name = "username", length = 255)
    private String username;

    @Column(name = "first_name", length = 255)
    private String firstName;

    @Column(name = "last_name", length = 255)
    private String lastName;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;
}
