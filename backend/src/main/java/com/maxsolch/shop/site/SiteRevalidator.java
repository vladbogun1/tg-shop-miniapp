package com.maxsolch.shop.site;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.config.AppProperties;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Tells the public site (Next.js ISR) which pages to rebuild after an admin edit:
 * {@code POST ${SITE_REVALIDATE_URL}} with {@code x-revalidate-secret} and
 * {@code {"paths": [...]}}.
 *
 * <p>Fire-and-forget on a thread owned here (not a Boot {@code TaskExecutor}: this app registers
 * its own Executor beans for STOMP, so Boot's one backs off and there is none to inject — see
 * NovaPoshtaSyncService). A failure is a WARN, never an error for the admin: the pages fall back
 * to their normal ISR expiry. Blank URL = feature off.
 *
 * <p>Each path is sent unprefixed and with the {@code /ru} and {@code /en} locale prefixes, since
 * those are separate ISR entries on the site.
 *
 * <p>The outcome of the last call is kept ({@link #status()}) so the admin panel can show that the
 * site stopped picking up changes, instead of the failure living only in the server log.
 */
@Slf4j
@Component
public class SiteRevalidator {

    private static final List<String> LOCALE_PREFIXES = List.of("", "/ru", "/en");

    /** Lets cache evictions that run after the admin call (@CacheEvict on controllers) land first. */
    private static final long DELAY_MS = 1_000;

    private final AppProperties props;
    private final ObjectMapper objectMapper;
    // HTTP/1.1 explicitly: the JDK client defaults to HTTP/2 and, over plain http://, sends an
    // "Upgrade: h2c" request. The Next.js (Node) server has no upgrade handler for it and drops the
    // socket, so every call failed with "HTTP/1.1 header parser received no bytes".
    private final HttpClient http = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(3))
            .build();
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "site-revalidate");
        t.setDaemon(true);
        return t;
    });

    /** Outcome of the most recent call, for {@code GET /api/admin/site/revalidate/status}. */
    public record Status(boolean enabled, Instant lastSuccessAt, Instant lastErrorAt, String lastError) {
    }

    private final AtomicReference<Instant> lastSuccessAt = new AtomicReference<>();
    private final AtomicReference<Instant> lastErrorAt = new AtomicReference<>();
    private final AtomicReference<String> lastError = new AtomicReference<>();

    public SiteRevalidator(AppProperties props, ObjectMapper objectMapper) {
        this.props = props;
        this.objectMapper = objectMapper;
    }

    public boolean enabled() {
        String url = props.getSite().getRevalidateUrl();
        return url != null && !url.isBlank();
    }

    /** Pages affected by a product change (current and previous slug, its categories). */
    public void productChanged(String slug, String previousSlug, Collection<String> categorySlugs) {
        List<String> paths = new ArrayList<>(List.of("/", "/catalog", "/search"));
        if (slug != null) {
            paths.add("/product/" + slug);
        }
        if (previousSlug != null && !previousSlug.equals(slug)) {
            paths.add("/product/" + previousSlug);
        }
        if (categorySlugs != null) {
            categorySlugs.stream().filter(s -> s != null && !s.isBlank())
                    .forEach(s -> paths.add("/catalog/" + s));
        }
        revalidate(paths);
    }

    /** Pages affected by a category (tag) change. */
    public void categoryChanged(String slug, String previousSlug) {
        List<String> paths = new ArrayList<>(List.of("/", "/catalog"));
        if (slug != null) {
            paths.add("/catalog/" + slug);
        }
        if (previousSlug != null && !previousSlug.equals(slug)) {
            paths.add("/catalog/" + previousSlug);
        }
        revalidate(paths);
    }

    /**
     * Content that can appear on any page changed (translations): rebuild the whole site, queued
     * like {@link #revalidate} (after the commit, off the request thread).
     */
    public void allChanged() {
        if (!enabled()) {
            return;
        }
        schedule(() -> send(Map.of("all", true, "paths", List.of()), "all pages"));
    }

    /**
     * Payment methods / requisites changed. The site route drops the {@code payment-options} data
     * tag on every call, so any path will do — the home page is the cheapest one to rebuild.
     */
    public void paymentChanged() {
        revalidate(List.of("/"));
    }

    /**
     * Rebuilds the whole site right now (the admin's «Обновить сайт»), synchronously so the caller
     * can report the outcome.
     *
     * @return null on success, otherwise a short description of what went wrong
     */
    public String revalidateAllNow() {
        if (!enabled()) {
            return "ревалидация выключена (SITE_REVALIDATE_URL не задан)";
        }
        return send(Map.of("all", true, "paths", List.of()), "all pages");
    }

    public Status status() {
        return new Status(enabled(), lastSuccessAt.get(), lastErrorAt.get(), lastError.get());
    }

    /**
     * Queues the call; when inside a transaction, only after it commits — otherwise the site could
     * re-render from the database before the change is visible there.
     */
    public void revalidate(Collection<String> rawPaths) {
        if (!enabled() || rawPaths == null || rawPaths.isEmpty()) {
            return;
        }
        Set<String> paths = new LinkedHashSet<>();
        for (String p : rawPaths) {
            for (String prefix : LOCALE_PREFIXES) {
                paths.add(prefix.isEmpty() ? p : ("/".equals(p) ? prefix : prefix + p));
            }
        }
        List<String> list = List.copyOf(paths);
        schedule(() -> send(Map.of("paths", list), list));
    }

    private void schedule(Runnable task) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.schedule(task, DELAY_MS, TimeUnit.MILLISECONDS);
                }
            });
        } else {
            executor.schedule(task, DELAY_MS, TimeUnit.MILLISECONDS);
        }
    }

    /** @return null on success, otherwise the failure (also remembered for {@link #status()}) */
    private String send(Map<String, Object> payload, Object what) {
        String url = props.getSite().getRevalidateUrl();
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
                return failed("сайт ответил HTTP " + res.statusCode());
            }
            log.debug("Site revalidated: {}", what);
            lastSuccessAt.set(Instant.now());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return failed("прервано");
        } catch (Exception e) {
            log.warn("Site revalidation failed ({}): {}", url, e.toString());
            return failed(e.getClass().getSimpleName()
                    + (e.getMessage() == null ? "" : ": " + e.getMessage()));
        }
    }

    private String failed(String error) {
        lastErrorAt.set(Instant.now());
        lastError.set(error);
        return error;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
