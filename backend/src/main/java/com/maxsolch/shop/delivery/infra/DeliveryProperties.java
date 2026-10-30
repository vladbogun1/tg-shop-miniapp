package com.maxsolch.shop.delivery.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * What the delivery module reads of {@code app.*}: the Nova Poshta API and its directory sync.
 * Binds a part of the {@code app.*} tree; keys and environment names are the same as before the split. Other
 * modules bind their own part of the same tree.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app")
public class DeliveryProperties {

    private NovaPoshta novaposhta = new NovaPoshta();

    @Getter
    @Setter
    public static class NovaPoshta {
        private String apiKey;
        private String apiUrl;
        private String syncCron;
    }
}
