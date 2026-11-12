package com.maxsolch.shop.delivery.infra;

import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * {@code np_packing_memory} (V99): which box each set of goods went into. One upsert per confirmation — the primary
 * key (goods, box) makes two packers confirming at once count twice, never lose a count.
 */
@Repository
public class PackingMemoryStore {

    private final NamedParameterJdbcTemplate jdbc;

    public PackingMemoryStore(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** One more use of this box for these goods. */
    public void remember(PackingMemoryEntry e, Instant at) {
        jdbc.update("INSERT INTO np_packing_memory (goods_sig, box_key, box_id, length_mm, width_mm, height_mm, uses,"
                + " last_used_at) VALUES (:sig, :key, :box, :l, :w, :h, 1, :at)"
                + " ON DUPLICATE KEY UPDATE uses = uses + 1, last_used_at = VALUES(last_used_at)",
                new MapSqlParameterSource()
                        .addValue("sig", e.goodsSig())
                        .addValue("key", e.boxKey())
                        .addValue("box", e.boxId())
                        .addValue("l", e.lengthMm())
                        .addValue("w", e.widthMm())
                        .addValue("h", e.heightMm())
                        .addValue("at", Timestamp.from(at)));
    }

    /** The catalog boxes these goods went into, most used (then most recent) first. */
    public List<PackingMemoryEntry> boxesFor(Collection<String> goodsSigs) {
        if (goodsSigs.isEmpty()) {
            return List.of();
        }
        return jdbc.query("SELECT goods_sig, box_key, box_id, length_mm, width_mm, height_mm, uses, last_used_at"
                        + " FROM np_packing_memory WHERE goods_sig IN (:sigs) AND box_id IS NOT NULL"
                        + " ORDER BY uses DESC, last_used_at DESC",
                new MapSqlParameterSource("sigs", goodsSigs), PackingMemoryStore::row);
    }

    private static PackingMemoryEntry row(ResultSet rs, int i) throws SQLException {
        Timestamp at = rs.getTimestamp("last_used_at");
        return new PackingMemoryEntry(rs.getString("goods_sig"), rs.getString("box_key"), rs.getBytes("box_id"),
                (Integer) rs.getObject("length_mm", Integer.class), rs.getObject("width_mm", Integer.class),
                rs.getObject("height_mm", Integer.class), rs.getInt("uses"), at == null ? null : at.toInstant());
    }
}
