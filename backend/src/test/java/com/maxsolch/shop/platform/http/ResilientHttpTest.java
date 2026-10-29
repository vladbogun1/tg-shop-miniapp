package com.maxsolch.shop.platform.http;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResilientHttpTest {

    private final HttpClient delegate = mock(HttpClient.class);
    private final List<Long> pauses = new ArrayList<>();
    private final HttpClientSettings settings = HttpClientSettings.defaults("test")
            .withTimeouts(Duration.ofSeconds(1), Duration.ofSeconds(2))
            .withRetries(2, Duration.ofMillis(100));
    private final ResilientHttp http = new ResilientHttp(delegate, settings, pauses::add);

    private static HttpRequest get() {
        return HttpRequest.newBuilder(URI.create("http://x/y")).GET().build();
    }

    private static HttpRequest post() {
        return HttpRequest.newBuilder(URI.create("http://x/y")).POST(HttpRequest.BodyPublishers.ofString("{}")).build();
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<String> response(int status) {
        HttpResponse<String> r = mock(HttpResponse.class);
        when(r.statusCode()).thenReturn(status);
        return r;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void answers(Object... results) throws Exception {
        var stub = when((HttpResponse) delegate.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)));
        for (Object o : results) {
            if (o instanceof Throwable t) {
                stub = stub.thenThrow(t);
            } else {
                stub = stub.thenReturn((HttpResponse) o);
            }
        }
    }

    @Test
    void requestWithoutTimeoutGetsTheConfiguredOne() throws Exception {
        answers(response(200));

        http.send(get(), HttpResponse.BodyHandlers.ofString());

        ArgumentCaptor<HttpRequest> sent = ArgumentCaptor.forClass(HttpRequest.class);
        verify(delegate).send(sent.capture(), any());
        assertThat(sent.getValue().timeout()).contains(Duration.ofSeconds(2));
    }

    @Test
    void ownTimeoutOfTheRequestIsKept() throws Exception {
        answers(response(200));
        HttpRequest own = HttpRequest.newBuilder(URI.create("http://x/y")).timeout(Duration.ofSeconds(30)).GET().build();

        http.send(own, HttpResponse.BodyHandlers.ofString());

        ArgumentCaptor<HttpRequest> sent = ArgumentCaptor.forClass(HttpRequest.class);
        verify(delegate).send(sent.capture(), any());
        assertThat(sent.getValue().timeout()).contains(Duration.ofSeconds(30));
    }

    @Test
    void idempotentRequestIsRetriedOnTimeoutThenSucceeds() throws Exception {
        answers(new HttpTimeoutException("slow"), response(503), response(200));

        HttpResponse<String> res = http.send(get(), HttpResponse.BodyHandlers.ofString());

        assertThat(res.statusCode()).isEqualTo(200);
        verify(delegate, times(3)).send(any(HttpRequest.class), any());
        assertThat(pauses).containsExactly(100L, 200L);
    }

    @Test
    void retriesAreBoundedAndTheLastErrorIsThrown() throws Exception {
        answers(new IOException("a"), new IOException("b"), new IOException("c"));

        assertThatThrownBy(() -> http.send(get(), HttpResponse.BodyHandlers.ofString()))
                .isInstanceOf(IOException.class).hasMessage("c");
        verify(delegate, times(3)).send(any(HttpRequest.class), any());
    }

    @Test
    void lastRetryableStatusIsReturnedAsIs() throws Exception {
        answers(response(503), response(503), response(503));

        assertThat(http.send(get(), HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(503);
        verify(delegate, times(3)).send(any(HttpRequest.class), any());
    }

    @Test
    void clientErrorIsNotRetried() throws Exception {
        answers(response(404));

        assertThat(http.send(get(), HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(404);
        verify(delegate, times(1)).send(any(HttpRequest.class), any());
    }

    @Test
    void postIsNeverRepeatedByDefault() throws Exception {
        answers(new IOException("boom"));

        assertThatThrownBy(() -> http.send(post(), HttpResponse.BodyHandlers.ofString())).isInstanceOf(IOException.class);
        verify(delegate, times(1)).send(any(HttpRequest.class), any());
    }

    @Test
    void postWithIdempotencyKeyCanBeMarkedRetryable() throws Exception {
        answers(new IOException("boom"), response(200));

        assertThat(http.send(post(), HttpResponse.BodyHandlers.ofString(), true).statusCode()).isEqualTo(200);
        verify(delegate, times(2)).send(any(HttpRequest.class), any());
    }

    @Test
    void settingsRejectMissingTimeoutsAndUnboundedRetries() {
        HttpClientSettings base = HttpClientSettings.defaults("x");
        assertThatThrownBy(() -> base.withTimeouts(Duration.ZERO, Duration.ofSeconds(1)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> base.withTimeouts(Duration.ofSeconds(1), null))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> base.withRetries(HttpClientSettings.MAX_RETRIES_LIMIT + 1, Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void configuredOverridesWinOverClientDefaults() {
        HttpClientsProperties props = new HttpClientsProperties();
        HttpClientsProperties.Client c = new HttpClientsProperties.Client();
        c.setRequestTimeout(Duration.ofSeconds(25));
        c.setMaxRetries(2);
        props.getClients().put("mono", c);

        HttpClientSettings s = props.applyTo(HttpClientSettings.defaults("mono"));

        assertThat(s.requestTimeout()).isEqualTo(Duration.ofSeconds(25));
        assertThat(s.maxRetries()).isEqualTo(2);
        assertThat(s.connectTimeout()).isEqualTo(Duration.ofSeconds(3));
        assertThat(props.applyTo(HttpClientSettings.defaults("other")).maxRetries()).isZero();
    }
}
