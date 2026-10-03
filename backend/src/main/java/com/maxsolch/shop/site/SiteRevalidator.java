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
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Executors;

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
 */
@Slf4j
@Component
public class SiteRevalidator {

    private static final List<String> LOCALE_PREFIXES = List.of("", "/ru", "/en");

    /** Lets cache evictions that run after the admin call (@CacheEvict on controllers) land first. */
    private static final long DELAY_MS = 1_000;

    private final AppProperties props;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();
    private final ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "site-revalidate");
        t.setDaemon(true);
        return t;
    });

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
        Runnable task = () -> send(List.copyOf(paths));
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

    private void send(List<String> paths) {
        String url = props.getSite().getRevalidateUrl();
        try {
            String body = objectMapper.writeValueAsString(Map.of("paths", paths));
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
                log.warn("Site revalidation answered {} for {}", res.statusCode(), paths);
            } else {
                log.debug("Site revalidated: {}", paths);
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (Exception e) {
            log.warn("Site revalidation failed ({}): {}", url, e.toString());
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
