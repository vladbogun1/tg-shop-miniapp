package com.maxsolch.shop.catalog;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;

/** Brand directory (V52). {@code aliases} — other spellings for recognition, one per line. */
@Getter
@Setter
@Entity
@Table(name = "brands")
public class Brand {

    public static final String LOGO_MONO = "MONO";
    public static final String LOGO_ORIGINAL = "ORIGINAL";

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    @Column(name = "slug", nullable = false, length = 160)
    private String slug;

    @Column(name = "aliases", columnDefinition = "TEXT")
    private String aliases;

    @Column(name = "website", length = 255)
    private String website;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    /** V54: MinIO key ({@code products/brands/…}) or an absolute URL; null = the site shows the name. */
    @Column(name = "logo_url", length = 2048)
    private String logoUrl;

    /** V54: {@link #LOGO_MONO} (recoloured to one tone on the site) or {@link #LOGO_ORIGINAL}. */
    @Column(name = "logo_mode", nullable = false, length = 16)
    private String logoMode = LOGO_MONO;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, updatable = false, insertable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    public List<String> aliasList() {
        return splitLines(aliases);
    }

    public void setAliasList(List<String> list) {
        this.aliases = joinLines(list);
    }

    static List<String> splitLines(String s) {
        if (s == null || s.isBlank()) {
            return List.of();
        }
        return Arrays.stream(s.split("\n")).map(String::trim).filter(x -> !x.isEmpty()).distinct().toList();
    }

    static String joinLines(List<String> list) {
        if (list == null) {
            return null;
        }
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (String s : list) {
            if (s != null && !s.isBlank()) {
                out.add(s.trim());
            }
        }
        return out.isEmpty() ? null : String.join("\n", new ArrayList<>(out));
    }
}
