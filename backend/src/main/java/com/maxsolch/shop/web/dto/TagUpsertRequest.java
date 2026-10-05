package com.maxsolch.shop.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Create / edit a tag. Everything but {@code name} is optional: an absent field keeps the current
 * value (older admin builds send only the name), a blank {@code slug} regenerates it from the name.
 * The SEO fields (V36, Russian source): {@code null} = keep, blank = clear (the site falls back to
 * its template).
 */
public record TagUpsertRequest(
        @NotBlank @Size(max = 128) String name,
        @Size(max = 160) String slug,
        Integer sortOrder,
        Boolean showInMenu,
        @Size(max = 255) String seoTitle,
        @Size(max = 512) String seoDescription,
        @Size(max = 255) String h1,
        @Size(max = INTRO_MAX_CHARS) String introText) {

    /** ~600 words of Ukrainian/Russian is ~4–5 k characters; leave room, stay well inside TEXT. */
    public static final int INTRO_MAX_CHARS = 10_000;

    /** Old-style request (name, slug, order, menu) — the SEO fields stay as they are. */
    public TagUpsertRequest(String name, String slug, Integer sortOrder, Boolean showInMenu) {
        this(name, slug, sortOrder, showInMenu, null, null, null, null);
    }
}
