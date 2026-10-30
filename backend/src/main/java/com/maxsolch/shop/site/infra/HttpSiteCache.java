package com.maxsolch.shop.site.infra;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.http.HttpClientSettings;
import com.maxsolch.shop.platform.http.HttpClients;
import com.maxsolch.shop.platform.http.ResilientHttp;
import com.maxsolch.shop.site.domain.SiteCache;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * {@code POST ${SITE_REVALIDATE_URL}} with {@code x-revalidate-secret} and {@code {"paths": [...]}} (or
 * {@code {"all": true}}).
 *
 * <p>HTTP/1.1 explicitly: the JDK client defaults to HTTP/2 and, over plain http://, sends an
 * "Upgrade: h2c" request. The Next.js (Node) server has no upgrade handler for it and drops the
 * socket, so every call failed with "HTTP/1.1 header parser received no bytes".
 * The call is a POST: never repeated (maxRetries 0), the next admin edit sends a fresh one.
 */
@Slf4j
@Component
public class HttpSiteCache implements SiteCache {

    private static final HttpClientSettings HTTP = HttpClientSettings.defaults("site-revalidate")
            .withTimeouts(Duration.ofSeconds(3), Duration.ofSeconds(10)).withHttp11();

    private final AppProperties props;
    private final ObjectMapper objectMapper;
    private final ResilientHttp http;

    public HttpSiteCache(AppProperties props, ObjectMapper objectMapper, HttpClients httpClients) {
        this.props = props;
        this.objectMapper = objectMapper;
        this.http = httpClients.create(HTTP);
    }

    @Override
    public boolean enabled() {
        String url = props.getSite().getRevalidateUrl();
        return url != null && !url.isBlank();
    }

    @Override
    public String rebuild(boolean all, List<String> paths) {
        String url = props.getSite().getRevalidateUrl();
        Object what = all ? "all pages" : paths;
        Map<String, Object> payload = all ? Map.of("all", true, "paths", List.of()) : Map.of("paths", paths);
        try {
            String body = objectMapper.writeValueAsString(payload);
            HttpRequest.Builder req = HttpRequest.newBuilder(URI.create(url.trim()))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body));
            String secret = props.getSite().getRevalidateSecret();
            if (secret != null && !secret.isBlank()) {
                req.header("x-revalidate-secret", secret);
            }
            HttpResponse<Void> res = http.send(req.build(), HttpResponse.BodyHandlers.discarding());
            if (res.statusCode() >= 300) {
                log.warn("Site revalidation answered {} for {}", res.statusCode(), what);
                return "сайт ответил HTTP " + res.statusCode();
            }
            log.debug("Site revalidated: {}", what);
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "прервано";
        } catch (Exception e) {
            log.warn("Site revalidation failed ({}): {}", url, e.toString());
            return e.getClass().getSimpleName() + (e.getMessage() == null ? "" : ": " + e.getMessage());
        }
    }
}
