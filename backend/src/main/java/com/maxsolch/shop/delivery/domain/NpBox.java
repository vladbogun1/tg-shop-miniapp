package com.maxsolch.shop.delivery.domain;

import com.maxsolch.shop.platform.util.UuidUtil;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * A box or bag the packers use (V99): Nova Poshta's catalog ({@link #code} like {@code np-5}) or our own box
 * ({@code code} null). A box has fold lines: {@link #heightsMm} lists the heights it can be cut down to, the first
 * is the full one. A bag ({@link #KIND_BAG}) has no height of its own — the thickness of the goods inside. Edited
 * only by its admin CRUD ({@code NpBoxAdmin}), so it stays a plain row.
 */
@Getter
@Setter
@Entity
@Table(name = "np_boxes")
public class NpBox {

    public static final String KIND_BOX = "BOX";
    public static final String KIND_BAG = "BAG";

    @Id
    @Column(name = "id", columnDefinition = "BINARY(16)", nullable = false)
    private byte[] id;

    /** Catalog code ({@code np-5}); null = our own box (may be deleted). */
    @Column(name = "code", length = 32)
    private String code;

    @Column(name = "name", nullable = false, length = 80)
    private String name;

    /** {@link #KIND_BOX} | {@link #KIND_BAG}. */
    @Column(name = "kind", nullable = false, length = 8)
    private String kind = KIND_BOX;

    @Column(name = "length_mm", nullable = false)
    private int lengthMm;

    @Column(name = "width_mm", nullable = false)
    private int widthMm;

    /** «200,130,80»: heights by the fold lines, the full one first; null for a bag. */
    @Column(name = "heights_mm", length = 64)
    private String heightsMm;

    @Column(name = "tare_g", nullable = false)
    private int tareG;

    /** What the branch charges for the box, kopecks. */
    @Column(name = "pack_minor", nullable = false)
    private long packMinor;

    /** The price is our guess (the catalog), not checked on a waybill. */
    @Column(name = "pack_estimated", nullable = false)
    private boolean packEstimated;

    /** «Есть у нас»: the box is picked from these. */
    @Column(name = "in_stock", nullable = false)
    private boolean inStock;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false, insertable = false, updatable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) {
            id = UuidUtil.randomBytes();
        }
    }

    public boolean bag() {
        return KIND_BAG.equals(kind);
    }

    /** Our own box (no catalog code). */
    public boolean own() {
        return code == null;
    }

    /** The fold heights, the full one first; empty for a bag. Bad parts are skipped. */
    public List<Integer> heights() {
        return parseHeights(heightsMm);
    }

    /** «200, 130,80» → [200, 130, 80]; positive whole millimetres only. */
    public static List<Integer> parseHeights(String raw) {
        List<Integer> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        for (String part : raw.split("[,;\\s]+")) {
            try {
                int h = Integer.parseInt(part.trim());
                if (h > 0 && !out.contains(h)) {
                    out.add(h);
                }
            } catch (NumberFormatException ignored) {
                // skip
            }
        }
        return out;
    }

    /** [200, 130, 80] → «200,130,80». */
    public static String joinHeights(List<Integer> heights) {
        return heights == null || heights.isEmpty() ? null
                : String.join(",", heights.stream().map(String::valueOf).toList());
    }
}
