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

    /** What Telegram reports; overwritten on every sign-in. */
    @Column(name = "language_code", length = 16)
    private String languageCode;

    /**
     * What the customer picked in the app, when they picked anything. Wins over
     * {@link #languageCode} — a deliberate choice outranks a device setting.
     */
    @Column(name = "locale", length = 5)
    private String locale;

    @Column(name = "is_premium", nullable = false)
    private boolean premium = false;

    @Column(name = "photo_url", length = 512)
    private String photoUrl;

    /** Set true when a DM/broadcast to this user fails with 403 (bot blocked); cleared on next login. */
    @Column(name = "bot_blocked", nullable = false)
    private boolean botBlocked = false;

    @Column(name = "bot_blocked_at")
    private Instant botBlockedAt;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;
}
