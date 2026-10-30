package com.maxsolch.shop.customer.infra;

import com.maxsolch.shop.platform.config.AppProperties;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * What the customer module reads of {@code app.*}: sign-in via the bot, site sessions, the visitors map, the public app info.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class CustomerProperties {

    private String imageBaseUrl;
    private String webappBaseUrl;

    private Telegram telegram = new Telegram();
    private Site site = new Site();
    private Geoip geoip = new Geoip();

    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        private String botUsername;
    }

    /** Public website (chisetup.com.ua root): sessions. */
    @Getter
    @Setter
    public static class Site {
        /** Lifetime of a site session (refresh cookie), days. */
        private int sessionDays = AppProperties.Site.DEFAULT_SESSION_DAYS;
        /** Lifetime of the site access cookie/JWT, minutes. */
        private int accessMinutes = AppProperties.Site.DEFAULT_ACCESS_MINUTES;
        /** How long a "log in via the bot" request stays valid, minutes. */
        private int loginMinutes = AppProperties.Site.DEFAULT_LOGIN_MINUTES;
    }

    /** IP to place lookup for the admin users map; enabled=false stops recording IPs. */
    @Getter
    @Setter
    public static class Geoip {
        private boolean enabled = true;
        private Duration throttle = Duration.ofMinutes(15);
    }
}
