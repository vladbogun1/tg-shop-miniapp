package com.maxsolch.shop.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

/**
 * A logged-in browser on the public site. The refresh token lives in an HttpOnly cookie; here
 * only its SHA-256. Rotated on every refresh — presenting an older one revokes the session.
 */
@Getter
@Setter
@Entity
@Table(name = "web_sessions")
public class WebSession {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "user_id", nullable = false)
    private long userId;

    @Column(name = "refresh_hash", columnDefinition = "CHAR(64)", nullable = false)
    private String refreshHash;

    @Column(name = "user_agent", length = 512)
    private String userAgent;

    @Column(name = "ip", length = 64)
    private String ip;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "last_used_at", nullable = false)
    private Instant lastUsedAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    public boolean isActive(Instant now) {
        return revokedAt == null && expiresAt != null && now.isBefore(expiresAt);
    }
}
