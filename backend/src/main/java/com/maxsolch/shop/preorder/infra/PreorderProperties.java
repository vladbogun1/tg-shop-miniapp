package com.maxsolch.shop.preorder.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the preorder module reads of {@code app.*}: where the digest of waiting orders goes.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class PreorderProperties {

    private Telegram telegram = new Telegram();

    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        /** Numeric chat id ("-100...") OR public channel username ("@maxsolch_chat"). */
        private String notifyChatId;
    }
}
