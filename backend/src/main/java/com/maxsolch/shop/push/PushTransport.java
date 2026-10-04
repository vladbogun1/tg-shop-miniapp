package com.maxsolch.shop.push;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/**
 * The single HTTP call to a push service. Separate bean so the service can be tested without
 * the network (a mock returns the status code a push service would).
 */
@Component
public class PushTransport {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    /** @return HTTP status of the push service (201 = accepted, 404/410 = subscription gone) */
    public int post(URI endpoint, Map<String, String> headers, byte[] body) throws IOException, InterruptedException {
        HttpRequest.Builder req = HttpRequest.newBuilder(endpoint)
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofByteArray(body));
        headers.forEach(req::header);
        return http.send(req.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
    }
}
