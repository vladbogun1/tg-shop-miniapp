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

    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        private String botUsername;
        private long initDataTtlSeconds = 86400;
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

    /** Public website (maxsolkh.shop root): cookies, allowed origin, ISR revalidation. */
    @Getter
    @Setter
    public static class Site {
        /** Public origin of the site, e.g. https://maxsolkh.shop. Added to the allowed origins. */
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
}
