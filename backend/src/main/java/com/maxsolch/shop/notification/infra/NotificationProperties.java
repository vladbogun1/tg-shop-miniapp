package com.maxsolch.shop.notification.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the notification module reads of {@code app.*}: the bot, the admin chat and its topics, the public links put into messages, Web Push (VAPID).
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class NotificationProperties {

    private String webappBaseUrl;
    private String adminBaseUrl;

    private Telegram telegram = new Telegram();
    private Push push = new Push();

    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        private String botUsername;
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

    /** Web Push for the admin PWA (VAPID, RFC 8292). All three blank = the feature is off: the subscribe endpoint answers 409 and no notification is ever attempted. */
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
}
