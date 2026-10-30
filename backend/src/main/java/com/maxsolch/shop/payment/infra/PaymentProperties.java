package com.maxsolch.shop.payment.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the payment module reads of {@code app.*}: monobank acquiring (see docs/MONOBANK-ACQUIRING.md), the links it returns to, the key that signs receipt links.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class PaymentProperties {

    private String webappBaseUrl;

    private Payment payment = new Payment();
    private Site site = new Site();
    private Security security = new Security();

    /** Online payment (monobank acquiring). */
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

    @Getter
    @Setter
    public static class Site {
        /** Public origin of the site, e.g. https://chisetup.com.ua. */
        private String baseUrl;
    }

    @Getter
    @Setter
    public static class Security {
        /** Base64-encoded HS256 secret. */
        private String jwtSecret;
    }
}
