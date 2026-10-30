package com.maxsolch.shop.platform.http;

import lombok.extern.slf4j.Slf4j;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Set;

/**
 * An outgoing HTTP client with a deadline on every call and a bounded retry of idempotent requests.
 *
 * <ul>
 *   <li>A request without its own timeout gets {@link HttpClientSettings#requestTimeout()}.</li>
 *   <li>Retry happens only for GET/HEAD/OPTIONS/PUT/DELETE/TRACE, at most {@code maxRetries} times, after an
 *       I/O error (including a timeout) or a 502/503/504 answer. POST and PATCH are never repeated: a repeat
 *       could charge a card or send a message twice. A caller that knows its POST is safe to repeat
 *       (it carries an idempotency key) passes {@code retryable = true}.</li>
 *   <li>Redirects are not followed (a redirect from an API is a configuration mistake, not a path to trust).</li>
 * </ul>
 * Create instances through {@link HttpClients}; the client is thread-safe.
 */
@Slf4j
public final class ResilientHttp {

    private static final Set<String> IDEMPOTENT = Set.of("GET", "HEAD", "OPTIONS", "PUT", "DELETE", "TRACE");
    private static final Set<Integer> RETRYABLE_STATUS = Set.of(502, 503, 504);

    /** Pause between attempts; replaced in tests. */
    interface Sleeper {
        void sleep(long millis) throws InterruptedException;
    }

    private final HttpClient delegate;
    private final HttpClientSettings settings;
    private final Sleeper sleeper;

    ResilientHttp(HttpClient delegate, HttpClientSettings settings, Sleeper sleeper) {
        this.delegate = delegate;
        this.settings = settings;
        this.sleeper = sleeper;
    }

    static ResilientHttp create(HttpClientSettings settings) {
        HttpClient.Builder builder = HttpClient.newBuilder()
                .connectTimeout(settings.connectTimeout())
                .followRedirects(HttpClient.Redirect.NEVER);
        if (settings.http11()) {
            builder.version(HttpClient.Version.HTTP_1_1);
        }
        HttpClient client = builder.build();
        return new ResilientHttp(client, settings, Thread::sleep);
    }

    public HttpClientSettings settings() {
        return settings;
    }

    /** Sends the request; retries only if its method is idempotent. */
    public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler)
            throws IOException, InterruptedException {
        return send(request, handler, IDEMPOTENT.contains(request.method()));
    }

    /** Sends the request; {@code retryable} says whether repeating it is safe (see the class comment). */
    public <T> HttpResponse<T> send(HttpRequest request, HttpResponse.BodyHandler<T> handler, boolean retryable)
            throws IOException, InterruptedException {
        HttpRequest bounded = request.timeout().isPresent() ? request
                : HttpRequest.newBuilder(request, (name, value) -> true).timeout(settings.requestTimeout()).build();
        int attempts = retryable ? settings.maxRetries() + 1 : 1;
        for (int attempt = 1; ; attempt++) {
            boolean last = attempt >= attempts;
            try {
                HttpResponse<T> response = delegate.send(bounded, handler);
                if (last || !RETRYABLE_STATUS.contains(response.statusCode())) {
                    return response;
                }
                log.warn("http[{}] {} answered {}, retry {}/{}", settings.name(), bounded.method(),
                        response.statusCode(), attempt, attempts - 1);
            } catch (IOException e) {
                if (last) {
                    throw e;
                }
                log.warn("http[{}] {} failed ({}), retry {}/{}", settings.name(), bounded.method(),
                        e.getClass().getSimpleName(), attempt, attempts - 1);
            }
            sleeper.sleep(settings.retryBackoff().toMillis() * attempt);
        }
    }
}
