package com.maxsolch.shop.staff.domain;

import com.maxsolch.shop.customer.domain.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

import java.time.Instant;

@Getter
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

    /**
     * Bumped whenever the admin's credentials or access change (password change,
     * deactivation, forced logout). Issued JWTs carry the version they were minted
     * with; a mismatch rejects the token, which is the only way to revoke a
     * long-lived stateless token.
     */
    @Column(name = "token_version", nullable = false)
    private int tokenVersion = 0;

    @Column(name = "name", length = 255)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "role", nullable = false)
    private AdminRole role = AdminRole.ADMIN;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    /** «Финансы» (V74): purchase prices, batch expenses and margin; the main admin sees them anyway. */
    @Column(name = "finance", nullable = false)
    private boolean finance = false;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    /** TOTP secret, AES-GCM encrypted ({@code v1:…}); null = 2FA not set up yet. */
    @Column(name = "totp_secret_enc", length = 255)
    private String totpSecretEnc;

    @Column(name = "totp_enabled_at")
    private Instant totpEnabledAt;

    /** A new secret waiting for its first code (setup / re-setup). */
    @Column(name = "totp_pending_enc", length = 255)
    private String totpPendingEnc;

    @Column(name = "totp_pending_at")
    private Instant totpPendingAt;

    /** Step of the last accepted code — the same code is never accepted twice. */
    @Column(name = "totp_last_step")
    private Long totpLastStep;

    /** Wrong passwords / codes in a row. */
    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts = 0;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "password_changed_at")
    private Instant passwordChangedAt;

    public boolean isTotpEnabled() {
        return totpSecretEnc != null && !totpSecretEnc.isBlank();
    }

    public boolean isSuperAdmin() {
        return role == AdminRole.SUPER_ADMIN;
    }

    /** A new admin account (an invite accepted, the bootstrap admin): active, with the given role. */
    public static AdminUser enroll(long telegramUserId, String name, AdminRole role) {
        AdminUser a = new AdminUser();
        a.telegramUserId = telegramUserId;
        a.name = name;
        a.role = role;
        a.active = true;
        return a;
    }

    public void rename(String newName) {
        this.name = newName;
    }

    public void changeRole(AdminRole newRole) {
        this.role = newRole;
    }

    /** The «Финансы» right (purchase prices, expenses, margin). */
    public void allowFinance(boolean allowed) {
        this.finance = allowed;
    }

    /** Sets the browser login with its password hash; the password counts as changed at {@code at}. */
    public void assignLogin(String login, String newPasswordHash, Instant at) {
        this.username = login;
        changePassword(newPasswordHash, at);
    }

    public void changePassword(String newPasswordHash, Instant at) {
        this.passwordHash = newPasswordHash;
        this.passwordChangedAt = at;
    }

    /** The admin has no password any more and must be invited again. */
    public void clearPassword() {
        this.passwordHash = null;
        this.passwordChangedAt = null;
    }

    public void block() {
        this.active = false;
    }

    /** Active again, with a clean lockout counter. */
    public void unblock() {
        this.active = true;
        resetLockout();
    }

    /** Active without touching the lockout (the bootstrap admin). */
    public void activate() {
        this.active = true;
    }

    public void resetLockout() {
        this.failedAttempts = 0;
        this.lockedUntil = null;
    }

    /** Every JWT issued so far stops working (the version it carries no longer matches). */
    public void revokeTokens() {
        this.tokenVersion++;
    }

    /** A new secret waiting for its first code (setup / re-setup). */
    public void startTotpSetup(String secretEnc, Instant at) {
        this.totpPendingEnc = secretEnc;
        this.totpPendingAt = at;
    }

    /** 2FA is on with {@code secretEnc}; {@code step} (the confirming code) counts as used; nothing is pending. */
    public void enableTotp(String secretEnc, Instant at, long step) {
        this.totpSecretEnc = secretEnc;
        this.totpEnabledAt = at;
        this.totpLastStep = step;
        this.totpPendingEnc = null;
        this.totpPendingAt = null;
    }

    /** Wipes 2FA: the next sign-in goes through setup again. */
    public void resetTotp() {
        this.totpSecretEnc = null;
        this.totpEnabledAt = null;
        this.totpLastStep = null;
        this.totpPendingEnc = null;
        this.totpPendingAt = null;
    }
}
