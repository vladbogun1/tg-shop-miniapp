package com.maxsolch.shop.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The part of the {@code app.*} tree the platform itself reads: the time zone, the public links that decide which
 * origins are allowed, token signing and lifetimes, the Telegram sign-in check, the cookie flag, the GeoIP file.
 *
 * <p>Everything a business module needs (the bot and its chat, payment, storage, Nova Poshta, admin 2FA, ...) lives in
 * that module's own {@code *Properties} class, which binds its own part of the same tree: keys and environment names
 * did not change with the split.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** The one place that names the default business zone (also the fallback for a blank or invalid setting). */
    public static final String DEFAULT_TIMEZONE = "Europe/Kyiv";

    /** Business timezone for analytics day buckets / human-facing dates (default Europe/Kyiv). */
    private String timezone = DEFAULT_TIMEZONE;

    private String webappBaseUrl;
    private String adminBaseUrl;

    private Telegram telegram = new Telegram();
    private Security security = new Security();
    private Site site = new Site();
    private Geoip geoip = new Geoip();

    /** Telegram Mini App sign-in: the bot token signs initData, the rest is how old it may be. */
    @Getter
    @Setter
    public static class Telegram {
        private String botToken;
        private long initDataTtlSeconds = 86400;
        /**
         * Max age of initData for the ADMIN Telegram login. The panel posts it right at launch, so
         * minutes are plenty; the customer value (a day) made a leaked initData a day-long key.
         */
        private long adminInitDataTtlSeconds = 300;
        private boolean allowUnsignedInitData = false;
    }

    @Getter
    @Setter
    public static class Security {
        /** Base64-encoded HS256 secret. */
        private String jwtSecret;
        private long jwtAccessTtlMinutes = 120;
        /**
         * Lifetime of an ADMIN token. Much shorter than the customer one (30 days): a leaked admin
         * token can refund payments and edit orders. The panel re-issues it quietly while it is in use
         * ({@code POST /api/admin/token/refresh}), so an active admin is never logged out.
         */
        private long adminTokenTtlMinutes = 720;
        /** /api/auth/admin/* requests per IP per 5 minutes (a login with 2FA is 2–3 requests). */
        private int adminAuthRateLimit = 20;
    }

    /** Public website (chisetup.com.ua root): the allowed origin, the cookie flag and lifetimes. */
    @Getter
    @Setter
    public static class Site {
        /** Defaults of the three lifetimes; the customer module binds the same keys and starts from the same values. */
        public static final int DEFAULT_SESSION_DAYS = 30;
        public static final int DEFAULT_ACCESS_MINUTES = 15;
        public static final int DEFAULT_LOGIN_MINUTES = 5;

        /** Public origin of the site, e.g. https://chisetup.com.ua. Added to the allowed origins. */
        private String baseUrl;
        /**
         * {@code Secure} flag of the auth cookies. Unset = true, except under the dev profile
         * (plain-http localhost). See {@link com.maxsolch.shop.platform.security.WebCookies}.
         */
        private Boolean webCookieSecure;
        /** Lifetime of a site session (refresh cookie), days. */
        private int sessionDays = DEFAULT_SESSION_DAYS;
        /** Lifetime of the site access cookie/JWT, minutes. */
        private int accessMinutes = DEFAULT_ACCESS_MINUTES;
        /** How long a "log in via the bot" request stays valid, minutes. */
        private int loginMinutes = DEFAULT_LOGIN_MINUTES;
    }

    /** IP to place lookup file for the admin users map. */
    @Getter
    @Setter
    public static class Geoip {
        private String path = "";
    }
}
