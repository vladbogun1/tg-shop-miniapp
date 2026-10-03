package com.maxsolch.shop.web.dto;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Tag;

/**
 * Tag (= site category). {@code slug}, {@code sortOrder}, {@code showInMenu} were added for the
 * public site; the Mini App reads only {@code id} and {@code name}.
 */
public record TagDto(String id, String name, String slug, int sortOrder, boolean showInMenu) {

    public static TagDto of(Tag t) {
        return new TagDto(UuidUtil.toString(t.getId()), t.getName(), t.getSlug(), t.getSortOrder(),
                t.isShowInMenu());
    }
}
