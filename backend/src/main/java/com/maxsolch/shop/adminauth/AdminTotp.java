package com.maxsolch.shop.adminauth;

import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.repository.AdminUserRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.OptionalLong;

/**
 * An admin's TOTP: creating a pending secret (setup / re-setup), checking codes against the active
 * or the pending secret, and the replay rule — a code is accepted only if its time step is newer
 * than the last accepted one ({@code admin_users.totp_last_step}, updated atomically).
 */
@Slf4j
@Component
public class AdminTotp {

    /** A pending secret must be confirmed within this time, or setup starts over. */
    static final Duration PENDING_TTL = Duration.ofMinutes(15);

    public record NewSecret(String secret, String otpauthUri) {
    }

    private final SecretCipher cipher;
    private final AdminUserRepository adminUserRepository;
    private final String issuer;
    private final Clock clock;

    @Autowired
    public AdminTotp(AdminAuthKeys keys, AdminUserRepository adminUserRepository, AppProperties props) {
        this(keys.cipher(), adminUserRepository, props.getSecurity().getAdmin2faIssuer(), Clock.systemUTC());
    }

    AdminTotp(SecretCipher cipher, AdminUserRepository adminUserRepository, String issuer, Clock clock) {
        this.cipher = cipher;
        this.adminUserRepository = adminUserRepository;
        this.issuer = issuer == null || issuer.isBlank() ? "ChiSetup Admin" : issuer;
        this.clock = clock;
    }

    /** Puts a fresh pending secret on the entity (the caller saves it) and returns it for the QR. */
    public NewSecret createPending(AdminUser admin) {
        byte[] secret = Totp.newSecret();
        admin.setTotpPendingEnc(cipher.encrypt(secret, admin.getTelegramUserId()));
        admin.setTotpPendingAt(clock.instant());
        String base32 = Base32.encode(secret);
        return new NewSecret(base32, Totp.otpauthUri(issuer, accountLabel(admin), base32));
    }

    /** A secret not yet attached to an admin row (invite page): for the QR and, encrypted, for storage. */
    public record Detached(String secret, String otpauthUri, String encrypted) {
    }

    /** New secret for {@code adminId} (the AAD — the same as it will have in admin_users) and label. */
    public Detached createDetached(long adminId, String label) {
        byte[] secret = Totp.newSecret();
        String base32 = Base32.encode(secret);
        return new Detached(base32, Totp.otpauthUri(issuer, label, base32), cipher.encrypt(secret, adminId));
    }

    /** Code against an encrypted secret that is not on an admin row yet: the matched step, or empty. */
    public OptionalLong verifyEncrypted(String encrypted, long adminId, String code) {
        if (encrypted == null || encrypted.isBlank()) {
            return OptionalLong.empty();
        }
        try {
            return Totp.verify(cipher.decrypt(encrypted, adminId), code, clock.instant().getEpochSecond());
        } catch (IllegalStateException e) {
            log.error("Invite 2FA secret for {} cannot be decrypted: {}", adminId, e.getMessage());
            return OptionalLong.empty();
        }
    }

    /**
     * Code from the active secret, with replay protection. A {@code true} has already recorded the
     * step (bulk update: entities loaded before this call are stale afterwards).
     */
    public boolean verifyActive(AdminUser admin, String code) {
        if (!admin.isTotpEnabled()) {
            return false;
        }
        byte[] secret;
        try {
            secret = cipher.decrypt(admin.getTotpSecretEnc(), admin.getTelegramUserId());
        } catch (IllegalStateException e) {
            log.error("2FA secret of admin {} cannot be decrypted — ADMIN_2FA_KEY changed? {}",
                    admin.getTelegramUserId(), e.getMessage());
            return false;
        }
        OptionalLong step = Totp.verify(secret, code, clock.instant().getEpochSecond());
        if (step.isEmpty()) {
            return false;
        }
        boolean fresh = adminUserRepository.acceptTotpStep(admin.getTelegramUserId(), step.getAsLong()) == 1;
        if (!fresh) {
            log.warn("Admin {}: a TOTP code was reused (replay refused)", admin.getTelegramUserId());
        }
        return fresh;
    }

    /** Code from the pending secret: the matched step, or empty (wrong code / no or stale pending secret). */
    public OptionalLong verifyPending(AdminUser admin, String code) {
        if (admin.getTotpPendingEnc() == null || admin.getTotpPendingAt() == null
                || admin.getTotpPendingAt().plus(PENDING_TTL).isBefore(clock.instant())) {
            return OptionalLong.empty();
        }
        try {
            byte[] secret = cipher.decrypt(admin.getTotpPendingEnc(), admin.getTelegramUserId());
            return Totp.verify(secret, code, clock.instant().getEpochSecond());
        } catch (IllegalStateException e) {
            log.error("Pending 2FA secret of admin {} cannot be decrypted: {}", admin.getTelegramUserId(), e.getMessage());
            return OptionalLong.empty();
        }
    }

    public boolean hasFreshPending(AdminUser admin) {
        return admin.getTotpPendingEnc() != null && admin.getTotpPendingAt() != null
                && !admin.getTotpPendingAt().plus(PENDING_TTL).isBefore(clock.instant());
    }

    /** The pending secret becomes the active one; {@code step} (its confirming code) counts as used. */
    public void activatePending(AdminUser admin, long step) {
        admin.setTotpSecretEnc(admin.getTotpPendingEnc());
        admin.setTotpEnabledAt(clock.instant());
        admin.setTotpPendingEnc(null);
        admin.setTotpPendingAt(null);
        admin.setTotpLastStep(step);
    }

    /** Wipes 2FA (emergency reset): the next sign-in goes through setup again. */
    public static void clear(AdminUser admin) {
        admin.setTotpSecretEnc(null);
        admin.setTotpEnabledAt(null);
        admin.setTotpPendingEnc(null);
        admin.setTotpPendingAt(null);
        admin.setTotpLastStep(null);
    }

    public String issuer() {
        return issuer;
    }

    Instant now() {
        return clock.instant();
    }

    static String accountLabel(AdminUser admin) {
        if (admin.getUsername() != null && !admin.getUsername().isBlank()) {
            return admin.getUsername().trim();
        }
        if (admin.getName() != null && !admin.getName().isBlank()) {
            return admin.getName().trim();
        }
        return "admin-" + admin.getTelegramUserId();
    }
}
