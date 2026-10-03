package db.migration;

import com.maxsolch.shop.service.SlugService;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Fills {@code products.slug} and {@code tags.slug} for every existing row (V18 added them NULL,
 * V18_2 makes them NOT NULL + UNIQUE). Same rules as the admin uses — {@link SlugService}.
 *
 * <p>Order matters for who gets the clean slug when two titles collide: live products first,
 * then hidden, then archived; oldest first inside each group. That way the product customers can
 * actually buy keeps {@code /product/wooting-80he-ghost} and an archived duplicate gets {@code -2}.
 *
 * <p>Idempotent: rows that already have a slug are kept and their slugs are reserved first.
 */
public class V18_1__Backfill_slugs extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        backfill(connection,
                "SELECT id, title, slug FROM products "
                        + "ORDER BY (active AND NOT archived) DESC, archived ASC, created_at ASC, id ASC",
                // updated_at = updated_at: the column is ON UPDATE CURRENT_TIMESTAMP, and a backfill
                // must not make every product look edited today (sitemap lastmod).
                "UPDATE products SET slug = ?, updated_at = updated_at WHERE id = ?",
                "product");
        backfill(connection,
                "SELECT id, name, slug FROM tags ORDER BY created_at ASC, id ASC",
                "UPDATE tags SET slug = ? WHERE id = ?",
                "category");
    }

    private static void backfill(Connection connection, String select, String update, String fallback)
            throws SQLException {
        record Row(byte[] id, String source, String slug) {
        }
        List<Row> rows = new ArrayList<>();
        try (Statement st = connection.createStatement(); ResultSet rs = st.executeQuery(select)) {
            while (rs.next()) {
                rows.add(new Row(rs.getBytes(1), rs.getString(2), rs.getString(3)));
            }
        }

        Set<String> taken = new HashSet<>();
        for (Row row : rows) {
            if (row.slug() != null && !row.slug().isBlank()) {
                taken.add(row.slug());
            }
        }

        try (PreparedStatement ps = connection.prepareStatement(update)) {
            for (Row row : rows) {
                if (row.slug() != null && !row.slug().isBlank()) {
                    continue;
                }
                String base = SlugService.slugify(row.source());
                String slug = SlugService.uniquify(base.isEmpty() ? fallback : base, taken::contains);
                taken.add(slug);
                ps.setString(1, slug);
                ps.setBytes(2, row.id());
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }
}
