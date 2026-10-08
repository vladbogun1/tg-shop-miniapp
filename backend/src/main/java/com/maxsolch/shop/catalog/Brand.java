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
