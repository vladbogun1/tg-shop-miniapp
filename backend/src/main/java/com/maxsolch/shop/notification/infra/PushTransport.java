package com.maxsolch.shop.notification.infra;

import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * The single HTTP call to a push service, over {@code platform.http}: 5 s to connect and 10 s per request (as
 * before), no redirects, no retries (a push is not idempotent: a repeat could show the notification twice).
 * {@code app.http.clients.push.*} overrides the timeouts. Separate bean so the service can be tested without the
 * network (a mock returns the status code a push service would).
 */
@Component
public class PushTransport {

    private final ResilientHttp http;

    public PushTransport(HttpClients clients) {
        this.http = clients.create(HttpClientSettings.defaults("push")
                .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(10)));
    }

    /** @return HTTP status of the push service (201 = accepted, 404/410 = subscription gone) */
    public int post(URI endpoint, Map<String, String> headers, byte[] body) throws IOException, InterruptedException {
        HttpRequest.Builder req = HttpRequest.newBuilder(endpoint)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(req::header);
        return http.send(req.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
