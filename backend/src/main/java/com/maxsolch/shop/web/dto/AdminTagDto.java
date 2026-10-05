package com.maxsolch.shop.web.dto;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;

/**
 * A tag as the admin panel edits it: {@link TagDto} plus the SEO of its category page (V36,
 * Russian source; translations live in content_translations). Kept apart from {@link TagDto}
 * because that one is embedded in every product of the catalog — the SEO text must not ride along.
 */
public record AdminTagDto(String id, String name, String slug, int sortOrder, boolean showInMenu,
                          String seoTitle, String seoDescription, String h1, String introText) {

    public static AdminTagDto of(Tag t) {
        return new AdminTagDto(UuidUtil.toString(t.getId()), t.getName(), t.getSlug(), t.getSortOrder(),
                t.isShowInMenu(), t.getSeoTitle(), t.getSeoDescription(), t.getH1(), t.getIntroText());
    }
}
