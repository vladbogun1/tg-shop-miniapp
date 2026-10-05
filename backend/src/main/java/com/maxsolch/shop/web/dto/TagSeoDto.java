package com.maxsolch.shop.web.dto;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;

/**
 * SEO of one category page (V36), in one content language. Every field is optional: null = the
 * site uses its template (site/lib/seo.ts).
 */
public record TagSeoDto(String tagId, String seoTitle, String seoDescription, String h1, String introText) {

    public static TagSeoDto of(Tag t) {
        return new TagSeoDto(UuidUtil.toString(t.getId()), t.getSeoTitle(), t.getSeoDescription(), t.getH1(),
                t.getIntroText());
    }

    public boolean isEmpty() {
        return seoTitle == null && seoDescription == null && h1 == null && introText == null;
    }
}
