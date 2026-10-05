package com.maxsolch.shop.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Binds the {@code app.*} configuration tree from application.yml / environment.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** Business timezone for analytics day buckets / human-facing dates (default Europe/Kyiv). */
    private String timezone = "Europe/Kyiv";

    private String imageBaseUrl;
    private String webappBaseUrl;
    private String adminBaseUrl;

    private Telegram telegram = new Telegram();
    private Security security = new Security();
    private S3 s3 = new S3();
    private NovaPoshta novaposhta = new NovaPoshta();
    private Site site = new Site();
    private Push push = new Push();
    private Payment payment = new Payment();

    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        private String botUsername;
        private long initDataTtlSeconds = 86400;
        /**
         * Max age of initData for the ADMIN Telegram login. The panel posts it right at launch, so
         * minutes are plenty; the customer value (a day) made a leaked initData a day-long key.
         */
        private long adminInitDataTtlSeconds = 300;
        private boolean allowUnsignedInitData = false;
        /** Numeric chat id ("-100...") OR public channel username ("@maxsolch_chat"). */
        private String notifyChatId;
        private int notifyTopicNew;
        private int notifyTopicProcessing;
        private int notifyTopicShipped;
        private int notifyTopicClosed;
        private int notifyTopicRejected;
        /** Forum topic for "new chat message" notifications (customer → admin). */
        private int notifyTopicChat;
        /** Forum topic for the seller's dispatch list (what to ship + COD amount). */
        private int notifyTopicDispatch;
    }

    @Getter
    @Setter
    public static class Security {
        /** Base64-encoded HS256 secret. */
        private String jwtSecret;
        private long jwtAccessTtlMinutes = 120;
        /**
         * Lifetime of an ADMIN token. Much shorter than the customer one (30 days): a leaked admin
         * token can change payment requisites. The panel re-issues it quietly while it is in use
         * ({@code POST /api/admin/token/refresh}), so an active admin is never logged out.
         */
        private long adminTokenTtlMinutes = 720;
        /** Bootstrap admin browser-login credentials (created/updated on startup if set). */
        private String adminLogin;
        private String adminPassword;
        /** telegram_user_id the bootstrap admin row is attached to (PK). */
        private long adminBootstrapTgId = 1;
        /**
         * Base64 AES-256 key (32 bytes) for the admins' TOTP secrets at rest (env ADMIN_2FA_KEY).
         * Blank = derived from the JWT secret via HKDF (a warning is logged). Must stay the same
         * once 2FA is set up: a different key makes every stored secret unreadable.
         */
        private String admin2faKey;
        /**
         * One-shot emergency reset (env ADMIN_EMERGENCY_RESET=true): on startup the bootstrap
         * admin gets ADMIN_PASSWORD back and loses 2FA / sessions / trusted devices. Runs once per
         * ADMIN_PASSWORD value — see docs/ADMIN-2FA.md.
         */
        private boolean adminEmergencyReset = false;
        /** /api/auth/admin/* requests per IP per 5 minutes (a login with 2FA is 2–3 requests). */
        private int adminAuthRateLimit = 20;
        /** Lifetime of a remembered device («Доверять этому устройству»). */
        private int adminTrustedDeviceDays = 30;
        /** Name shown in the authenticator app next to the account. */
        private String admin2faIssuer = "ChiSetup Admin";
    }

    @Getter
    @Setter
    public static class S3 {
        private String endpoint;
        private String publicEndpoint;
        private String accessKey;
        private String secretKey;
        private String bucket;
    }

    /** Public website (chisetup.com.ua root): cookies, allowed origin, ISR revalidation. */
    @Getter
    @Setter
    public static class Site {
        /** Public origin of the site, e.g. https://chisetup.com.ua. Added to the allowed origins. */
        private String baseUrl;
        /**
         * {@code Secure} flag of the auth cookies. Unset = true, except under the dev profile
         * (plain-http localhost). See {@link com.maxsolch.shop.security.WebCookies}.
         */
        private Boolean webCookieSecure;
        /** e.g. http://site-public:3000/api/revalidate — blank disables revalidation calls. */
        private String revalidateUrl;
        private String revalidateSecret;
        /** Lifetime of a site session (refresh cookie), days. */
        private int sessionDays = 30;
        /** Lifetime of the site access cookie/JWT, minutes. */
        private int accessMinutes = 15;
        /** How long a "log in via the bot" request stays valid, minutes. */
        private int loginMinutes = 5;
    }

    @Getter
    @Setter
    public static class NovaPoshta {
        private String apiKey;
        private String apiUrl;
        private String syncCron;
    }

    /**
     * Web Push for the admin PWA (VAPID, RFC 8292). All three blank = the feature is off: the
     * subscribe endpoint answers 409 and no notification is ever attempted.
     */
    @Getter
    @Setter
    public static class Push {
        /** Uncompressed P-256 public key (65 bytes), base64url — handed to the browser. */
        private String vapidPublicKey;
        /** P-256 private scalar (32 bytes), base64url. */
        private String vapidPrivateKey;
        /** Contact for the push services: {@code mailto:owner@example.com} or an https URL. */
        private String vapidSubject;
    }

    /** Online payment (monobank acquiring). See docs/MONOBANK-ACQUIRING.md. */
    @Getter
    @Setter
    public static class Payment {
        /** How long a new order may stay unpaid before it is rejected and restocked, hours. */
        private int dueHours = 24;
        /** Lifetime of one monobank invoice (payment page link), minutes. Capped by the due time. */
        private int invoiceTtlMinutes = 60;
        private Monobank monobank = new Monobank();
    }

    @Getter
    @Setter
    public static class Monobank {
        /** X-Token (test token from api.monobank.ua or the merchant one). Blank = online payment off. */
        private String token;
        private String apiUrl = "https://api.monobank.ua";
        /** Where monobank posts status changes. Blank = {site.baseUrl}/api/payments/mono/webhook. */
        private String webhookUrl;

        public boolean isEnabled() {
            return token != null && !token.isBlank();
        }
    }
}
