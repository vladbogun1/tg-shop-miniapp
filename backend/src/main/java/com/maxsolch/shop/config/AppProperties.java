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

    private String imageBaseUrl;
    private String webappBaseUrl;
    private String adminBaseUrl;

    private Telegram telegram = new Telegram();
    private Security security = new Security();
    private S3 s3 = new S3();
    private NovaPoshta novaposhta = new NovaPoshta();

    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        private String botUsername;
        /** Comma-separated list of telegram user ids that are admins (bootstrap/fallback). */
        private String adminUserIds;
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

    @Getter
    @Setter
    public static class NovaPoshta {
        private String apiKey;
        private String apiUrl;
        private String syncCron;
    }
}
