package com.maxsolch.shop.site.domain;

import java.util.ArrayList;
import java.util.List;

/** A stand-in for the public site's page cache: records what was asked to rebuild, answers with a chosen outcome. */
public class FakeSiteCache implements SiteCache {

    public record Call(boolean all, List<String> paths) {
    }

    private final boolean enabled;
    private String error;
    private final List<Call> calls = new ArrayList<>();

    public FakeSiteCache(boolean enabled) {
        this.enabled = enabled;
    }

    /** The next rebuilds fail with this text (null = succeed). */
    public FakeSiteCache failingWith(String error) {
        this.error = error;
        return this;
    }

    public List<Call> calls() {
        return calls;
    }

    @Override
    public boolean enabled() {
        return enabled;
    }

    @Override
    public String rebuild(boolean all, List<String> paths) {
        calls.add(new Call(all, paths));
        return error;
    }
}
