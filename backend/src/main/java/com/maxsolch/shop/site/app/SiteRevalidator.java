package com.maxsolch.shop.site.app;

import com.maxsolch.shop.site.domain.SiteRevalidationFailed;
import com.maxsolch.shop.platform.jobs.Workers;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.tx.OnCommitted;
import com.maxsolch.shop.site.domain.SiteCache;
import com.maxsolch.shop.site.domain.SiteRevalidationRequested;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Tells the public site (Next.js ISR) which pages to rebuild after an admin edit:
 * {@code POST ${SITE_REVALIDATE_URL}} with {@code x-revalidate-secret} and
 * {@code {"paths": [...]}}.
 *
 * <p>Fire-and-forget on a named worker of {@link com.maxsolch.shop.platform.jobs.Workers}. A failure is a WARN, never an error for the admin: the pages fall back
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

    private final SiteCache cache;
    private final ScheduledExecutorService executor;

    /** Outcome of the most recent call, for {@code GET /api/admin/site/revalidate/status}. */
    public record Status(boolean enabled, Instant lastSuccessAt, Instant lastErrorAt, String lastError) {
    }

    private final AtomicReference<Instant> lastSuccessAt = new AtomicReference<>();
    private final AtomicReference<Instant> lastErrorAt = new AtomicReference<>();
    private final AtomicReference<String> lastError = new AtomicReference<>();

    private final DomainEvents events;
    private final Clock clock;

    public SiteRevalidator(SiteCache cache, DomainEvents events, Clock clock, Workers workers) {
        this.executor = workers.scheduled("site-revalidate");
        this.cache = cache;
        this.events = events;
        this.clock = clock;
    }

    public boolean enabled() {
        return cache.enabled();
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
        events.publish(new SiteRevalidationRequested(true, List.of()));
    }

    /**
     * Payment methods changed. The site route drops the {@code payment-options} data
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
        return send(true, List.of());
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
        events.publish(new SiteRevalidationRequested(false, list));
    }

    /** After the commit (at once outside a transaction): the call goes out on the own thread, a second later. */
    @OnCommitted
    void onRequested(SiteRevalidationRequested request) {
        if (request.all()) {
            executor.schedule(() -> send(true, List.of()), DELAY_MS, TimeUnit.MILLISECONDS);
        } else {
            List<String> list = request.paths();
            executor.schedule(() -> send(false, list), DELAY_MS, TimeUnit.MILLISECONDS);
        }
    }

    /** @return null on success, otherwise the failure (also remembered for {@link #status()}) */
    private String send(boolean all, List<String> paths) {
        String error = cache.rebuild(all, paths);
        if (error == null) {
            lastSuccessAt.set(clock.instant());
            return null;
        }
        return failed(error);
    }

    private String failed(String error) {
        Instant prevError = lastErrorAt.get();
        Instant prevSuccess = lastSuccessAt.get();
        boolean newOutage = prevError == null || (prevSuccess != null && prevSuccess.isAfter(prevError));
        lastErrorAt.set(clock.instant());
        lastError.set(error);
        if (newOutage && events != null) {
            try {
                events.publish(new SiteRevalidationFailed(error));
            } catch (RuntimeException e) {
                log.debug("Site failure event not delivered: {}", e.toString());
            }
        }
        return error;
    }

}
