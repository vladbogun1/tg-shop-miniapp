package com.maxsolch.shop.translation.infra;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * DeepL API ({@code app.translations.deepl.*}). An empty key switches the auto-translation off. A key of the free plan
 * ends with {@code :fx} and goes to {@code api-free.deepl.com}; {@code base-url} overrides the choice (tests, proxy).
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app.translations.deepl")
public class DeepLProperties {

    private String apiKey = "";
    private String baseUrl = "";

    String effectiveBaseUrl() {
        if (baseUrl != null && !baseUrl.isBlank()) {
            return baseUrl.replaceAll("/+$", "");
        }
        return apiKey != null && apiKey.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
    }
}
