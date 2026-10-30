package com.maxsolch.shop.site.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the site module reads of {@code app.*}: the ISR revalidation of the public website.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class SiteProperties {

    private Site site = new Site();

    @Getter
    @Setter
    public static class Site {
        /** e.g. http://site-public:3000/api/revalidate — blank disables revalidation calls. */
        private String revalidateUrl;
        private String revalidateSecret;
    }
}
