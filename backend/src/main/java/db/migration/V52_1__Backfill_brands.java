package db.migration;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.service.SlugService;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Fills the {@code brands} directory (V52) from the free-text {@code products.brand} and sets
 * {@code products.brand_id}. Spellings that differ only in case ("MCHOSE" / "Mchose") are one brand —
 * the column collation is case-insensitive anyway; the most frequent spelling becomes the name and
 * the others its aliases. Slugs use {@link SlugService} like everything else. Idempotent: a brand
 * that already exists by name is reused.
 */
public class V52_1__Backfill_brands extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        record Group(Map<String, Integer> spellings, List<byte[]> products) {
            String name() {
                return spellings.entrySet().stream()
                        .max(Map.Entry.<String, Integer>comparingByValue())
                        .map(Map.Entry::getKey).orElseThrow();
            }
        }
        Map<String, Group> groups = new LinkedHashMap<>();
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT id, brand FROM products WHERE brand IS NOT NULL "
                     + "ORDER BY created_at, id")) {
            while (rs.next()) {
                String b = rs.getString(2).trim().replaceAll("\\s+", " ");
                if (b.isEmpty()) {
                    continue;
                }
                Group g = groups.computeIfAbsent(b.toLowerCase(Locale.ROOT),
                        k -> new Group(new LinkedHashMap<>(), new ArrayList<>()));
                g.spellings().merge(b, 1, Integer::sum);
                g.products().add(rs.getBytes(1));
            }
        }
        if (groups.isEmpty()) {
            return;
        }
        Set<String> slugs = new HashSet<>();
        Map<String, byte[]> existing = new LinkedHashMap<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT id, name, slug FROM brands")) {
            while (rs.next()) {
                existing.put(rs.getString(2).toLowerCase(Locale.ROOT), rs.getBytes(1));
                slugs.add(rs.getString(3));
            }
        }
        try (PreparedStatement ins = c.prepareStatement(
                "INSERT INTO brands (id, name, slug, aliases) VALUES (?, ?, ?, ?)");
             PreparedStatement upd = c.prepareStatement(
                     "UPDATE products SET brand_id = ?, updated_at = updated_at WHERE id = ?")) {
            for (Map.Entry<String, Group> e : groups.entrySet()) {
                String name = e.getValue().name();
                byte[] id = existing.get(name.toLowerCase(Locale.ROOT));
                if (id == null) {
                    id = UuidUtil.randomBytes();
                    String base = SlugService.slugify(name);
                    String slug = SlugService.uniquify(base.isEmpty() ? "brand" : base, slugs::contains);
                    slugs.add(slug);
                    List<String> aliases = new ArrayList<>();
                    for (String s : e.getValue().spellings().keySet()) {
                        if (!s.equals(name)) {
                            aliases.add(s);
                        }
                    }
                    ins.setBytes(1, id);
                    ins.setString(2, name.length() > 128 ? name.substring(0, 128) : name);
                    ins.setString(3, slug);
                    ins.setString(4, aliases.isEmpty() ? null : String.join("\n", aliases));
                    ins.executeUpdate();
                    existing.put(name.toLowerCase(Locale.ROOT), id);
                }
                for (byte[] productId : e.getValue().products()) {
                    upd.setBytes(1, id);
                    upd.setBytes(2, productId);
                    upd.executeUpdate();
                }
            }
        }
    }
}
