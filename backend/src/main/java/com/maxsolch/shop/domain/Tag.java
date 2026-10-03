package com.maxsolch.shop.domain;

import com.maxsolch.shop.common.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;

@Getter
@Setter
@Entity
@Table(name = "tags")
public class Tag {

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    @Column(name = "name", nullable = false, length = 128)
    private String name;

    /** URL key for the public site ({@code /catalog/<slug>}), unique. See SlugService. */
    @Column(name = "slug", nullable = false, length = 160)
    private String slug;

    /** Position in the site's category menu (ascending, then by name). */
    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "show_in_menu", nullable = false)
    private boolean showInMenu = true;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }
}
