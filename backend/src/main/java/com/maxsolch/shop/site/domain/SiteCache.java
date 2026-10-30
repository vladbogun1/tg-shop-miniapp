package com.maxsolch.shop.site.domain;

import java.util.List;

/**
 * The page cache of the public site (Next.js ISR). The port of the site module: the app decides which pages are
 * affected, when the call goes out and what the admin sees; the adapter in {@code site.infra} makes the call.
 */
public interface SiteCache {

    /** False when no address is configured: the feature is off and nothing is sent. */
    boolean enabled();

    /**
     * Drops the cached pages (all of them, or the given paths) and tells the site to rebuild them.
     *
     * @return null on success, otherwise a short description of what went wrong (the call never throws)
     */
    String rebuild(boolean all, List<String> paths);
}
