package com.maxsolch.shop.platform.http;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Per-client overrides: {@code app.http.clients.<name>.connect-timeout / request-timeout / max-retries / retry-backoff}.
 * What is not set keeps the value that the code of the client itself chose as its default.
 */
@Getter
@Setter
@Validated
@ConfigurationProperties(prefix = "app.http")
public class HttpClientsProperties {

    private Map<String, Client> clients = new HashMap<>();

    @Getter
    @Setter
    public static class Client {
        private Duration connectTimeout;
        private Duration requestTimeout;
        private Integer maxRetries;
        private Duration retryBackoff;
    }

    /** The settings for {@code base.name()} with the configured overrides applied. */
    HttpClientSettings applyTo(HttpClientSettings base) {
        Client o = clients.get(base.name());
        if (o == null) {
            return base;
        }
        return new HttpClientSettings(base.name(),
                o.connectTimeout != null ? o.connectTimeout : base.connectTimeout(),
                o.requestTimeout != null ? o.requestTimeout : base.requestTimeout(),
                o.maxRetries != null ? o.maxRetries : base.maxRetries(),
                o.retryBackoff != null ? o.retryBackoff : base.retryBackoff(),
                base.http11());
    }
}
