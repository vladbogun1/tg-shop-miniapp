package com.maxsolch.shop.platform.http;

import org.springframework.stereotype.Component;

/**
 * The only way a module gets an outgoing HTTP client (the client in its {@code infra} implements a port of its
 * {@code domain}). The module gives its own defaults; {@code app.http.clients.<name>} can override them
 * without a release. Direct {@code HttpClient.newBuilder()} outside {@code platform.http} is not allowed.
 */
@Component
public class HttpClients {

    private final HttpClientsProperties properties;

    public HttpClients(HttpClientsProperties properties) {
        this.properties = properties;
    }

    public ResilientHttp create(HttpClientSettings defaults) {
        return ResilientHttp.create(properties.applyTo(defaults));
    }

    /**
     * The effective settings for a client that is not built on {@link ResilientHttp} (a library with its own HTTP
     * stack): the module's defaults with the {@code app.http.clients.<name>} overrides applied.
     */
    public HttpClientSettings settings(HttpClientSettings defaults) {
        return properties.applyTo(defaults);
    }
}
