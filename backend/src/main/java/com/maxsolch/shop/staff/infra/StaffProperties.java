package com.maxsolch.shop.staff.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the staff module reads of {@code app.*}: the bootstrap admin, 2FA and trusted devices, the admin panel link.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class StaffProperties {

    private String adminBaseUrl;

    private Security security = new Security();

    @Getter
    @Setter
    public static class Security {
        /** Base64-encoded HS256 secret (the 2FA key is derived from it when ADMIN_2FA_KEY is blank). */
        private String jwtSecret;
        /** Bootstrap admin browser-login credentials (created/updated on startup if set). */
        private String adminLogin;
        private String adminPassword;
        /** telegram_user_id the bootstrap admin row is attached to (PK). */
        private long adminBootstrapTgId = 1;
        /** Base64 AES-256 key (32 bytes) for the admins' TOTP secrets at rest (env ADMIN_2FA_KEY). Blank = derived from the JWT secret via HKDF (a warning is logged). Must stay the same once 2FA is set up: a different key makes every stored secret unreadable. */
        private String admin2faKey;
        /** One-shot emergency reset (env ADMIN_EMERGENCY_RESET=true): on startup the bootstrap admin gets ADMIN_PASSWORD back and loses 2FA / sessions / trusted devices. Runs once per ADMIN_PASSWORD value — see docs/ADMIN-2FA.md. */
        private boolean adminEmergencyReset = false;
        /** Lifetime of a remembered device («Доверять этому устройству»). */
        private int adminTrustedDeviceDays = 30;
        /** Name shown in the authenticator app next to the account. */
        private String admin2faIssuer = "ChiSetup Admin";
    }
}
