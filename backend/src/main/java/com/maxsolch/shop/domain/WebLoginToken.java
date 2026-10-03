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

/**
 * One "log in to the site via Telegram" attempt. Only hashes of the two secrets are stored:
 * the nonce (travels in the bot deep link) and the bind secret (HttpOnly cookie of the browser
 * that started the login), so a leaked row cannot be turned into a login.
 */
@Getter
@Setter
@Entity
@Table(name = "web_login_tokens")
public class WebLoginToken {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "nonce_hash", columnDefinition = "CHAR(64)", nullable = false)
    private String nonceHash;

    @Column(name = "bind_hash", columnDefinition = "CHAR(64)", nullable = false)
    private String bindHash;

    @Column(name = "match_code", columnDefinition = "TINYINT", nullable = false)
    private int matchCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private WebLoginStatus status = WebLoginStatus.PENDING;

    @Column(name = "telegram_user_id")
    private Long telegramUserId;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "ip", length = 64)
    private String ip;

    @Column(name = "bot_chat_id")
    private Long botChatId;

    @Column(name = "bot_message_id")
    private Integer botMessageId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "used_at")
    private Instant usedAt;

    public boolean isExpired(Instant now) {
        return expiresAt == null || !now.isBefore(expiresAt);
    }
}
