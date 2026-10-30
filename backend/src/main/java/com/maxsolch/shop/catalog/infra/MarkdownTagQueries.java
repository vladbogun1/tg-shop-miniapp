package com.maxsolch.shop.catalog.infra;

import org.springframework.lang.Nullable;

import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

/** Reads the legacy {@code utsenka} tag row (V52 keeps the table) that names the markdown collection. */
@Component
public class MarkdownTagQueries {

    public record Row(String id, String name, @Nullable String seoTitle, @Nullable String seoDescription, @Nullable String h1, @Nullable String introText) {
    }

    private final JdbcTemplate jdbc;

    public MarkdownTagQueries(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The row of the tag with this slug, or null when there is none or the legacy table is already dropped. */
    public Row bySlug(String slug) {
        try {
            List<Row> rows = jdbc.query("SELECT id, name, seo_title, seo_description, h1, intro_text FROM tags "
                            + "WHERE slug = ? LIMIT 1",
                    (rs, i) -> new Row(UuidUtil.toString(rs.getBytes(1)), rs.getString(2), rs.getString(3),
                            rs.getString(4), rs.getString(5), rs.getString(6)),
                    slug);
            return rows.isEmpty() ? null : rows.get(0);
        } catch (DataAccessException e) {
            // The legacy table is dropped by a later migration: the fixed labels are enough.
            return null;
        }
    }
}
