package com.maxsolch.shop.ai.infra;

import com.maxsolch.shop.ai.domain.PageText;
import com.maxsolch.shop.ai.domain.ReaderProxy;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * r.jina.ai without a key (about 20 pages a minute — enough for the fallback; the direct fetch goes first). 5 s to
 * connect, 40 s for the answer: it renders the page in a browser. Not repeated.
 */
@Component
public class JinaReader implements ReaderProxy {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("ai-reader")
            .withTimeouts(Duration.ofSeconds(5), Duration.ofSeconds(40));
    private static final String BASE = "https://r.jina.ai/";

    private final ResilientHttp http;

    public JinaReader(HttpClients clients) {
        this.http = clients.create(HTTP);
    }

    @Override
    public boolean enabled() {
        return true;
    }

    @Override
    public PageText.WebPage read(String url) {
        try {
            HttpResponse<String> res = http.send(HttpRequest.newBuilder(URI.create(BASE + url)).GET().build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8), false);
            return res.statusCode() == 200 && !targetFailed(res.body()) ? PageText.fromReader(res.body()) : null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /** The reader answers 200 with a warning line when the site itself said 404/500: that is no page. */
    static boolean targetFailed(String body) {
        int head = Math.min(body.length(), 600);
        return body.substring(0, head).contains("Warning: Target URL returned error");
    }
}
