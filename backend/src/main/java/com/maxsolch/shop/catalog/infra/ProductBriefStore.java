package com.maxsolch.shop.catalog.infra;

import com.maxsolch.shop.catalog.domain.ProductBrief;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** Plain SQL of the product's brief for other modules and of the rating columns they feed. */
@Repository
public class ProductBriefStore {

    private final JdbcTemplate jdbc;

    public ProductBriefStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Product id by its public slug. */
    public Optional<byte[]> idBySlug(String slug) {
        List<byte[]> ids = jdbc.query("select id from products where slug = ?", (rs, i) -> rs.getBytes(1), slug);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    /** Briefs by id (UUID string); products that no longer exist are absent. */
    public Map<String, ProductBrief> briefs(Collection<byte[]> productIds) {
        Map<String, ProductBrief> out = new HashMap<>();
        if (productIds == null || productIds.isEmpty()) {
            return out;
        }
        String in = String.join(",", java.util.Collections.nCopies(productIds.size(), "?"));
        jdbc.query("select p.id, p.title, p.slug, (p.active and not p.archived) live, "
                        + "(select i.url from product_images i where i.product_id = p.id "
                        + " order by i.sort_order, i.id limit 1) img "
                        + "from products p where p.id in (" + in + ")",
                rs -> {
                    out.put(UuidUtil.toString(rs.getBytes("id")), new ProductBrief(rs.getString("title"),
                            rs.getString("slug"), rs.getString("img"), rs.getBoolean("live")));
                }, productIds.toArray());
        return out;
    }

    /** Ids of the products whose title matches the LIKE pattern (backslash escape), at most {@code limit}. */
    public List<byte[]> idsByTitleLike(String like, int limit) {
        return jdbc.query("select id from products where lower(title) like ? limit ?",
                (rs, i) -> rs.getBytes(1), like, limit);
    }

    /** Writes the rating aggregate of a product (avg null = no reviews). */
    public void setRating(byte[] productId, int count, BigDecimal avg) {
        jdbc.update("update products set rating_count = ?, rating_avg = ? where id = ?", count, avg, productId);
    }
}
