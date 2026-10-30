package com.maxsolch.shop.platform.security;

import com.maxsolch.shop.platform.cache.CacheSpec;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;

/**
 * The in-memory caches and counters of the security filters, registered in the shared Spring {@code CacheManager}.
 * Per-instance on purpose while the backend runs as one container (ARCHITECTURE.md, section 6): losing or splitting
 * a counter costs a few extra requests, never data.
 *
 * <p>The request counters ({@code RATE_*}) are windows: a counter lives {@code expireAfterWrite} after its first hit,
 * so the window is the lifetime of the entry.
 */
@Configuration
class SecurityCaches {

    private static final Duration AUTH_WINDOW = Duration.ofMinutes(RateLimitFilter.AUTH_WINDOW_MINUTES);
    private static final Duration MINUTE = Duration.ofMinutes(1);

    static final CacheSpec RATE_AUTH = new CacheSpec("rateLimitAuth", 10_000, AUTH_WINDOW);
    static final CacheSpec RATE_INVITE = new CacheSpec("rateLimitInvite", 10_000, AUTH_WINDOW);
    static final CacheSpec RATE_CUSTOMER_AUTH = new CacheSpec("rateLimitCustomerAuth", 50_000, AUTH_WINDOW);
    static final CacheSpec RATE_UPLOAD = new CacheSpec("rateLimitUpload", 10_000, MINUTE);
    static final CacheSpec RATE_PUBLIC_READS = new CacheSpec("rateLimitPublicReads", 50_000, MINUTE);
    static final CacheSpec RATE_WEB_LOGIN_STARTS = new CacheSpec("rateLimitWebLoginStarts", 10_000, MINUTE);
    static final CacheSpec RATE_WEB_AUTH = new CacheSpec("rateLimitWebAuth", 50_000, MINUTE);
    static final CacheSpec RATE_ORDER_CREATES = new CacheSpec("rateLimitOrderCreates", 50_000,
            Duration.ofMinutes(RateLimitFilter.ORDER_CREATE_WINDOW_MINUTES));
    static final CacheSpec RATE_RECEIPT_FILES = new CacheSpec("rateLimitReceiptFiles", 10_000, MINUTE);
    static final CacheSpec RATE_SUPPORT_POSTS = new CacheSpec("rateLimitSupportPosts", 50_000, MINUTE);
    static final CacheSpec RATE_ANALYTICS = new CacheSpec("rateLimitAnalytics", 50_000, MINUTE);

    /** Revoked admin token ids (jti): the source of truth is the database, the answer is remembered briefly. */
    static final CacheSpec ADMIN_TOKEN_REVOKED = new CacheSpec("adminTokenRevoked", 10_000,
            Duration.ofSeconds(AdminTokenRevocations.CACHE_SECONDS));
    /** Admin telegram id to the current token version (or none when the admin is gone). */
    static final CacheSpec ADMIN_TOKEN_VERSIONS = new CacheSpec("adminTokenVersions", 256,
            Duration.ofSeconds(AdminTokenValidator.CACHE_SECONDS));
    /** Whether a website session is still live. */
    static final CacheSpec WEB_SESSIONS_LIVE = new CacheSpec("webSessionsLive", 10_000, Duration.ofSeconds(30));
    /** Signatures of Mini App initData already used for an ADMIN sign-in (they outlive the admin TTL). */
    static final CacheSpec INIT_DATA_USED_FOR_ADMIN = new CacheSpec("initDataUsedForAdmin", 10_000, Duration.ofHours(1));

    @Bean
    CacheSpec rateLimitAuthCache() {
        return RATE_AUTH;
    }

    @Bean
    CacheSpec rateLimitInviteCache() {
        return RATE_INVITE;
    }

    @Bean
    CacheSpec rateLimitCustomerAuthCache() {
        return RATE_CUSTOMER_AUTH;
    }

    @Bean
    CacheSpec rateLimitUploadCache() {
        return RATE_UPLOAD;
    }

    @Bean
    CacheSpec rateLimitPublicReadsCache() {
        return RATE_PUBLIC_READS;
    }

    @Bean
    CacheSpec rateLimitWebLoginStartsCache() {
        return RATE_WEB_LOGIN_STARTS;
    }

    @Bean
    CacheSpec rateLimitWebAuthCache() {
        return RATE_WEB_AUTH;
    }

    @Bean
    CacheSpec rateLimitOrderCreatesCache() {
        return RATE_ORDER_CREATES;
    }

    @Bean
    CacheSpec rateLimitReceiptFilesCache() {
        return RATE_RECEIPT_FILES;
    }

    @Bean
    CacheSpec rateLimitSupportPostsCache() {
        return RATE_SUPPORT_POSTS;
    }

    @Bean
    CacheSpec rateLimitAnalyticsCache() {
        return RATE_ANALYTICS;
    }

    @Bean
    CacheSpec adminTokenRevokedCache() {
        return ADMIN_TOKEN_REVOKED;
    }

    @Bean
    CacheSpec adminTokenVersionsCache() {
        return ADMIN_TOKEN_VERSIONS;
    }

    @Bean
    CacheSpec webSessionsLiveCache() {
        return WEB_SESSIONS_LIVE;
    }

    @Bean
    CacheSpec initDataUsedForAdminCache() {
        return INIT_DATA_USED_FOR_ADMIN;
    }
}
