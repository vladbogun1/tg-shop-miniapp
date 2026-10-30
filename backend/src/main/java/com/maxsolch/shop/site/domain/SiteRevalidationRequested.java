package com.maxsolch.shop.site.domain;

import java.util.List;

/**
 * Pages of the public site must be rebuilt. Published inside the admin transaction; the call to the site
 * goes out only after the commit, otherwise the site could re-render from the database before the change is visible.
 *
 * @param all   rebuild the whole site ({@code paths} is empty then)
 * @param paths paths with their locale prefixes already applied
 */
public record SiteRevalidationRequested(boolean all, List<String> paths) {

    public SiteRevalidationRequested {
        paths = List.copyOf(paths);
    }
}
