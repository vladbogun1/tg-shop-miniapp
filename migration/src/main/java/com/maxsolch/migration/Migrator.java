package com.maxsolch.migration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Migrates the OLD tg-shop database into the NEW tg-shop-v2 schema using plain
 * JDBC, and moves product images from the old {@code media_images} LONGBLOB
 * table into MinIO (S3).
 *
 * <p>Each table step is wrapped in its own try/catch so a single failure does
 * not abort the whole run. Inserts use {@code INSERT ... ON DUPLICATE KEY
 * UPDATE} (or check-exists) for idempotency, and are batched. Image blobs are
 * streamed one row at a time to avoid OOM on ~1196 images / ~110 MB.
 */
public class Migrator {

    private static final Logger log = LoggerFactory.getLogger(Migrator.class);

    private static final int BATCH = 500;

    /**
     * The old DB stored money as WHOLE UAH in the {@code *_minor} columns (the old UI never
     * divided by 100). The new convention is true minor units (kopecks), so all migrated money
     * values are multiplied by this factor.
     */
    private static final int MONEY_SCALE = 100;

    private final Connection oldDb;
    private final Connection newDb;
    private final ImageStore images;
    private final boolean skipImages;

    /** Per-table inserted-row counters for the final summary. */
    private final Map<String, Integer> counts = new LinkedHashMap<>();
    private final Map<String, String> failures = new LinkedHashMap<>();

    /** old media filename -> new object key (filled during image step). */
    private final Map<String, String> mediaKeyByFilename = new HashMap<>();
    /** set of tg_user_id values present in the NEW users table. */
    private final Set<Long> knownUserIds = new HashSet<>();

    public Migrator(Connection oldDb, Connection newDb, ImageStore images, boolean skipImages) {
        this.oldDb = oldDb;
        this.newDb = newDb;
        this.images = images;
        this.skipImages = skipImages;
    }

    public void run() {
        step("tags", this::migrateTags);
        step("products", this::migrateProducts);
        step("product_variants", this::migrateVariants);
        step("product_tags", this::migrateProductTags);
        step("promo_codes", this::migratePromoCodes);
        step("media_images(->S3)", this::migrateImages);
        step("product_images", this::migrateProductImages);
        step("users", this::migrateUsers);
        step("orders", this::migrateOrders);
        step("order_items", this::migrateOrderItems);
        step("order_messages", this::migrateOrderMessages);
        step("settings", this::migrateSettings);
        // Backfill derived fields from the migrated chat (must run AFTER order_messages):
        // the old bot logged SYSTEM status cards, from which we reconstruct the status
        // transition timestamps (for metrics) and the reject reason.
        step("status_timestamps(backfill)", this::backfillStatusTimestamps);
        step("reject_reasons(backfill)", this::backfillRejectReasons);
        printSummary();
    }

    /** Reconstruct approved/shipped/delivered/rejected_at from the chat SYSTEM cards. */
    private int backfillStatusTimestamps() throws SQLException {
        int n = 0;
        n += runUpdate("UPDATE orders o SET o.approved_at = (SELECT MIN(m.created_at) FROM order_messages m "
                + "WHERE m.order_id=o.id AND m.sender_type='SYSTEM' AND m.text LIKE '%ОДОБРЕНО%') "
                + "WHERE o.approved_at IS NULL");
        n += runUpdate("UPDATE orders o SET o.shipped_at = (SELECT MIN(m.created_at) FROM order_messages m "
                + "WHERE m.order_id=o.id AND m.sender_type='SYSTEM' AND m.text LIKE '%ВЫСЛАНО%') "
                + "WHERE o.shipped_at IS NULL");
        n += runUpdate("UPDATE orders o SET o.delivered_at = (SELECT MIN(m.created_at) FROM order_messages m "
                + "WHERE m.order_id=o.id AND m.sender_type='SYSTEM' AND m.text LIKE '%ДОСТАВЛЕНО%') "
                + "WHERE o.delivered_at IS NULL");
        n += runUpdate("UPDATE orders o SET o.rejected_at = (SELECT MIN(m.created_at) FROM order_messages m "
                + "WHERE m.order_id=o.id AND m.sender_type='SYSTEM' AND m.text LIKE '%ОТКЛОНЕНО%') "
                + "WHERE o.rejected_at IS NULL");
        // Keep chronology monotonic (don't create negative spans for metrics).
        runUpdate("UPDATE orders SET shipped_at=NULL WHERE shipped_at IS NOT NULL AND approved_at IS NOT NULL AND shipped_at<approved_at");
        runUpdate("UPDATE orders SET delivered_at=NULL WHERE delivered_at IS NOT NULL AND shipped_at IS NOT NULL AND delivered_at<shipped_at");
        return n;
    }

    /** Reconstruct reject_reason from the chat "❌ Причина: <text>" cards. */
    private int backfillRejectReasons() throws SQLException {
        return runUpdate("UPDATE orders o SET o.reject_reason = ("
                + "SELECT TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(m.text, 'Причина: ', -1), '\\n', 1)) "
                + "FROM order_messages m WHERE m.order_id=o.id AND m.sender_type='SYSTEM' AND m.text LIKE '%Причина: %' "
                + "ORDER BY m.created_at DESC LIMIT 1) "
                + "WHERE o.status='REJECTED' AND (o.reject_reason IS NULL OR o.reject_reason='')");
    }

    private int runUpdate(String sql) throws SQLException {
        try (Statement s = newDb.createStatement()) {
            return s.executeUpdate(sql);
        }
    }

    // ---------------------------------------------------------------- helpers

    @FunctionalInterface
    private interface Step {
        int execute() throws Exception;
    }

    private void step(String name, Step step) {
        log.info("==== Migrating {} ====", name);
        try {
            int n = step.execute();
            counts.put(name, n);
            newDb.commit();
            log.info("---- {}: {} rows OK", name, n);
        } catch (Exception e) {
            failures.put(name, e.getClass().getSimpleName() + ": " + e.getMessage());
            log.error("!! Step '{}' failed (continuing): {}", name, e.toString(), e);
            try {
                newDb.rollback();
            } catch (SQLException re) {
                log.error("   rollback of '{}' also failed: {}", name, re.toString());
            }
        }
    }

    // ----------------------------------------------------------------- step 1
    private int migrateTags() throws SQLException {
        String sel = "SELECT id, name, created_at FROM tags";
        String ins = "INSERT INTO tags (id, name, created_at) VALUES (?,?,?) "
                + "ON DUPLICATE KEY UPDATE name = VALUES(name)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setBytes(1, rs.getBytes("id"));
                ps.setString(2, rs.getString("name"));
                ps.setTimestamp(3, rs.getTimestamp("created_at"));
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ----------------------------------------------------------------- step 2
    private int migrateProducts() throws SQLException {
        String sel = "SELECT id, title, description, price_minor, currency, stock, active, archived, created_at "
                + "FROM products";
        // updated_at := created_at on first import.
        String ins = "INSERT INTO products "
                + "(id, title, description, price_minor, currency, stock, active, archived, created_at, updated_at) "
                + "VALUES (?,?,?,?,?,?,?,?,?,?) "
                + "ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), "
                + "price_minor=VALUES(price_minor), currency=VALUES(currency), stock=VALUES(stock), "
                + "active=VALUES(active), archived=VALUES(archived)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                Timestamp created = rs.getTimestamp("created_at");
                ps.setBytes(1, rs.getBytes("id"));
                ps.setString(2, rs.getString("title"));
                ps.setString(3, rs.getString("description"));
                ps.setLong(4, rs.getLong("price_minor") * MONEY_SCALE);
                ps.setString(5, orDefault(rs.getString("currency"), "UAH"));
                ps.setInt(6, rs.getInt("stock"));
                ps.setBoolean(7, rs.getBoolean("active"));
                ps.setBoolean(8, rs.getBoolean("archived"));
                ps.setTimestamp(9, created);
                ps.setTimestamp(10, created);
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ----------------------------------------------------------------- step 3
    private int migrateVariants() throws SQLException {
        String sel = "SELECT id, product_id, name, stock, sort_order FROM product_variants";
        String ins = "INSERT INTO product_variants (id, product_id, name, stock, sort_order) "
                + "VALUES (?,?,?,?,?) "
                + "ON DUPLICATE KEY UPDATE name=VALUES(name), stock=VALUES(stock), sort_order=VALUES(sort_order)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setBytes(1, rs.getBytes("id"));
                ps.setBytes(2, rs.getBytes("product_id"));
                ps.setString(3, rs.getString("name"));
                ps.setInt(4, rs.getInt("stock"));
                ps.setInt(5, rs.getInt("sort_order"));
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ----------------------------------------------------------------- step 4
    private int migrateProductTags() throws SQLException {
        String sel = "SELECT product_id, tag_id FROM product_tags";
        String ins = "INSERT INTO product_tags (product_id, tag_id) VALUES (?,?) "
                + "ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setBytes(1, rs.getBytes("product_id"));
                ps.setBytes(2, rs.getBytes("tag_id"));
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ----------------------------------------------------------------- step 5
    private int migratePromoCodes() throws SQLException {
        String sel = "SELECT id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active, created_at "
                + "FROM promo_codes";
        String ins = "INSERT INTO promo_codes "
                + "(id, code, discount_percent, discount_amount_minor, max_uses, uses_count, active, created_at) "
                + "VALUES (?,?,?,?,?,?,?,?) "
                + "ON DUPLICATE KEY UPDATE discount_percent=VALUES(discount_percent), "
                + "discount_amount_minor=VALUES(discount_amount_minor), max_uses=VALUES(max_uses), "
                + "uses_count=VALUES(uses_count), active=VALUES(active)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setBytes(1, rs.getBytes("id"));
                ps.setString(2, rs.getString("code"));
                ps.setInt(3, rs.getInt("discount_percent"));
                ps.setLong(4, rs.getLong("discount_amount_minor") * MONEY_SCALE);
                int maxUses = rs.getInt("max_uses");
                if (rs.wasNull()) ps.setNull(5, java.sql.Types.INTEGER); else ps.setInt(5, maxUses);
                ps.setInt(6, rs.getInt("uses_count"));
                ps.setBoolean(7, rs.getBoolean("active"));
                ps.setTimestamp(8, rs.getTimestamp("created_at"));
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ----------------------------------------------------------------- step 6
    /**
     * Streams every {@code media_images} row to MinIO under
     * {@code products/{productUuid}/{filename}} and records the mapping
     * (old filename -> new object key) for the product_images rewrite.
     */
    private int migrateImages() throws Exception {
        // Always build the filename->key mapping (needed by product_images),
        // but skip the actual S3 upload when --skip-images is set.
        if (!skipImages) {
            images.ensureBucket();
        } else {
            log.warn("--skip-images set: building key map only, NOT uploading to S3");
        }

        String sel = "SELECT id, product_id, filename, content_type, data FROM media_images ORDER BY id";
        int n = 0;
        int failed = 0;
        // Hint the driver to stream rather than buffer the whole LONGBLOB set.
        try (Statement s = oldDb.createStatement(ResultSet.TYPE_FORWARD_ONLY, ResultSet.CONCUR_READ_ONLY)) {
            s.setFetchSize(50);
            try (ResultSet rs = s.executeQuery(sel)) {
                while (rs.next()) {
                    byte[] productId = rs.getBytes("product_id");
                    String filename = rs.getString("filename");
                    String contentType = rs.getString("content_type");
                    String uuid = UuidUtil.toUuidString(productId);
                    String objectKey = "products/" + uuid + "/" + filename;
                    mediaKeyByFilename.put(filename, objectKey);
                    if (skipImages) {
                        n++;
                        continue;
                    }
                    try {
                        byte[] data = rs.getBytes("data");
                        images.put(objectKey, data, contentType);
                        n++;
                        if (n % 100 == 0) log.info("   uploaded {} images...", n);
                    } catch (Exception ex) {
                        failed++;
                        log.error("   image upload failed for '{}' (key {}): {}", filename, objectKey, ex.toString());
                    }
                }
            }
        }
        if (failed > 0) log.warn("   {} image(s) failed to upload", failed);
        return n;
    }

    // ----------------------------------------------------------------- step 7
    /**
     * Rewrites product_images URLs. Old media URLs (e.g. {@code /media/{filename}}
     * or a bare filename present in media_images) become the S3 object key
     * {@code products/{uuid}/{filename}}. External/non-media URLs are kept as-is.
     * Catalog order is preserved via sort_order.
     */
    private int migrateProductImages() throws SQLException {
        String sel = "SELECT id, product_id, url, sort_order FROM product_images ORDER BY product_id, sort_order, id";
        // product_images.id is AUTO_INCREMENT in the new schema; preserve old id
        // so re-runs are idempotent and FK-free.
        String ins = "INSERT INTO product_images (id, product_id, url, sort_order) VALUES (?,?,?,?) "
                + "ON DUPLICATE KEY UPDATE url=VALUES(url), sort_order=VALUES(sort_order)";
        int n = 0;
        int rewritten = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                long id = rs.getLong("id");
                byte[] productId = rs.getBytes("product_id");
                String oldUrl = rs.getString("url");
                int sortOrder = rs.getInt("sort_order");

                String newUrl = rewriteImageUrl(oldUrl);
                if (!newUrl.equals(oldUrl)) rewritten++;

                ps.setLong(1, id);
                ps.setBytes(2, productId);
                ps.setString(3, newUrl);
                ps.setInt(4, sortOrder);
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        log.info("   rewrote {} of {} image urls to S3 keys", rewritten, n);
        return n;
    }

    /**
     * Old media URL forms: {@code /media/{filename}}, {@code media/{filename}},
     * a full {@code http(s)://host/media/{filename}}, or a bare filename that
     * exists in media_images. All map to the S3 object key the frontend
     * imgproxy loader expects. Anything else is left untouched.
     */
    private String rewriteImageUrl(String url) {
        if (url == null || url.isBlank()) return url;
        String filename = extractMediaFilename(url);
        if (filename != null) {
            String key = mediaKeyByFilename.get(filename);
            if (key != null) return key;
        }
        // not a known media image -> external URL, keep as-is
        return url;
    }

    private String extractMediaFilename(String url) {
        // bare filename that we know about
        if (mediaKeyByFilename.containsKey(url)) return url;
        int idx = url.indexOf("/media/");
        if (idx >= 0) {
            String fn = url.substring(idx + "/media/".length());
            int q = fn.indexOf('?');
            if (q >= 0) fn = fn.substring(0, q);
            return fn.isBlank() ? null : fn;
        }
        if (url.startsWith("media/")) {
            String fn = url.substring("media/".length());
            return fn.isBlank() ? null : fn;
        }
        return null;
    }

    // ----------------------------------------------------------------- step 8
    /**
     * Derives distinct (tg_user_id, tg_username) from old orders -> users.
     * first_name/last_name unknown -> NULL. Skips tg_user_id &lt;= 0.
     */
    private int migrateUsers() throws SQLException {
        String sel = "SELECT tg_user_id, "
                + "SUBSTRING_INDEX(GROUP_CONCAT(tg_username ORDER BY created_at DESC SEPARATOR 0x1f), 0x1f, 1) AS username "
                + "FROM orders WHERE tg_user_id > 0 GROUP BY tg_user_id";
        String ins = "INSERT INTO users (telegram_user_id, username, first_name, last_name) "
                + "VALUES (?,?,NULL,NULL) "
                + "ON DUPLICATE KEY UPDATE username = VALUES(username)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                long uid = rs.getLong("tg_user_id");
                String username = rs.getString("username");
                ps.setLong(1, uid);
                if (username == null || username.isBlank()) ps.setNull(2, java.sql.Types.VARCHAR);
                else ps.setString(2, username);
                ps.addBatch();
                knownUserIds.add(uid);
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ----------------------------------------------------------------- step 9
    private int migrateOrders() throws SQLException {
        String sel = "SELECT id, total_minor, subtotal_minor, discount_minor, promo_code, currency, "
                + "customer_name, phone, address, comment, tg_user_id, tg_username, status, tracking_number, created_at "
                + "FROM orders";
        String ins = "INSERT INTO orders "
                + "(id, user_id, subtotal_minor, discount_minor, total_minor, promo_code, currency, "
                + " customer_name, phone, comment, status, tracking_number, reject_reason, "
                + " delivery_method, np_city_ref, np_city_name, np_warehouse_ref, np_warehouse_name, "
                + " payment_option_id, payment_option_title, tg_user_id, tg_username, "
                + " notify_chat_id, notify_thread_id, notify_message_id, created_at, updated_at) "
                + "VALUES (?,?,?,?,?,?,?, ?,?,?,?,?,NULL, "
                + " 'NOVA_POSHTA', NULL, NULL, NULL, NULL, "
                + " NULL, NULL, ?,?, "
                + " NULL, NULL, NULL, ?, ?) "
                + "ON DUPLICATE KEY UPDATE status=VALUES(status), total_minor=VALUES(total_minor), "
                + "comment=VALUES(comment), tracking_number=VALUES(tracking_number)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                long tgUserId = rs.getLong("tg_user_id");
                boolean tgNull = rs.wasNull();
                String customerName = orDefault(rs.getString("customer_name"), "—");
                String phone = orDefault(rs.getString("phone"), "—");
                String address = rs.getString("address");
                String comment = rs.getString("comment");
                Timestamp created = rs.getTimestamp("created_at");

                // Fold old free-text address into comment, since the new schema
                // has no dedicated address column (NP fields stay NULL).
                String mergedComment = mergeAddressIntoComment(address, comment);

                ps.setBytes(1, rs.getBytes("id"));
                // user_id only if a matching users row exists
                if (!tgNull && tgUserId > 0 && knownUserIds.contains(tgUserId)) ps.setLong(2, tgUserId);
                else ps.setNull(2, java.sql.Types.BIGINT);
                ps.setLong(3, rs.getLong("subtotal_minor") * MONEY_SCALE);
                ps.setLong(4, rs.getLong("discount_minor") * MONEY_SCALE);
                ps.setLong(5, rs.getLong("total_minor") * MONEY_SCALE);
                ps.setString(6, rs.getString("promo_code"));
                ps.setString(7, orDefault(rs.getString("currency"), "UAH"));
                ps.setString(8, customerName);
                ps.setString(9, phone);
                if (mergedComment == null) ps.setNull(10, java.sql.Types.VARCHAR);
                else ps.setString(10, mergedComment);
                ps.setString(11, normalizeStatus(rs.getString("status")));
                ps.setString(12, rs.getString("tracking_number"));
                // tg_user_id / tg_username (carried verbatim)
                if (!tgNull) ps.setLong(13, tgUserId); else ps.setNull(13, java.sql.Types.BIGINT);
                ps.setString(14, rs.getString("tg_username"));
                ps.setTimestamp(15, created);
                ps.setTimestamp(16, created);
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    private String mergeAddressIntoComment(String address, String comment) {
        boolean hasAddr = address != null && !address.isBlank();
        boolean hasComment = comment != null && !comment.isBlank();
        if (!hasAddr) return hasComment ? comment : null;
        String addrLine = "Адрес: " + address.trim();
        String merged = hasComment ? addrLine + "\n" + comment.trim() : addrLine;
        // orders.comment is VARCHAR(1024)
        if (merged.length() > 1024) merged = merged.substring(0, 1024);
        return merged;
    }

    private String normalizeStatus(String old) {
        if (old == null || old.isBlank()) return "NEW";
        String s = old.trim().toUpperCase();
        switch (s) {
            case "NEW":
            case "APPROVED":
            case "SHIPPED":
            case "DELIVERED":
            case "REJECTED":
                return s;
            default:
                log.warn("   unknown order status '{}' -> NEW", old);
                return "NEW";
        }
    }

    // ---------------------------------------------------------------- step 10
    private int migrateOrderItems() throws SQLException {
        String sel = "SELECT id, order_id, product_id, title_snapshot, price_minor_snapshot, "
                + "variant_id, variant_name_snapshot, quantity FROM order_items";
        String ins = "INSERT INTO order_items "
                + "(id, order_id, product_id, title_snapshot, price_minor_snapshot, "
                + " variant_id, variant_name_snapshot, quantity) "
                + "VALUES (?,?,?,?,?,?,?,?) "
                + "ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setLong(1, rs.getLong("id"));
                ps.setBytes(2, rs.getBytes("order_id"));
                ps.setBytes(3, rs.getBytes("product_id"));
                ps.setString(4, orDefault(rs.getString("title_snapshot"), "—"));
                ps.setLong(5, rs.getLong("price_minor_snapshot") * MONEY_SCALE);
                byte[] variantId = rs.getBytes("variant_id");
                if (variantId == null) ps.setNull(6, java.sql.Types.BINARY); else ps.setBytes(6, variantId);
                ps.setString(7, rs.getString("variant_name_snapshot"));
                ps.setInt(8, rs.getInt("quantity"));
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // ---------------------------------------------------------------- step 11
    private int migrateOrderMessages() throws SQLException {
        String sel = "SELECT id, order_id, direction, sender_name, sender_id, message_type, text, "
                + "file_id, file_name, mime_type, tg_message_id, tg_reply_to_message_id, created_at "
                + "FROM order_messages";
        // attachment_url left NULL (old stored Telegram file_id, no real files).
        // reply_to_message_id maps old tg_reply_to_message_id best-effort.
        String ins = "INSERT INTO order_messages "
                + "(id, order_id, sender_type, sender_id, sender_name, type, text, attachment_url, "
                + " file_name, mime_type, width, height, reply_to_message_id, created_at) "
                + "VALUES (?,?,?,?,?,?,?,NULL,?,?,NULL,NULL,?,?) "
                + "ON DUPLICATE KEY UPDATE text=VALUES(text)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setLong(1, rs.getLong("id"));
                ps.setBytes(2, rs.getBytes("order_id"));
                ps.setString(3, mapSenderType(rs.getString("direction")));
                long senderId = rs.getLong("sender_id");
                if (rs.wasNull()) ps.setNull(4, java.sql.Types.BIGINT); else ps.setLong(4, senderId);
                ps.setString(5, rs.getString("sender_name"));
                ps.setString(6, mapMessageType(rs.getString("message_type")));
                ps.setString(7, rs.getString("text"));
                ps.setString(8, rs.getString("file_name"));
                ps.setString(9, rs.getString("mime_type"));
                int replyTo = rs.getInt("tg_reply_to_message_id");
                if (rs.wasNull()) ps.setNull(10, java.sql.Types.BIGINT); else ps.setLong(10, replyTo);
                ps.setTimestamp(11, rs.getTimestamp("created_at"));
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    private String mapSenderType(String direction) {
        if (direction == null) return "SYSTEM";
        switch (direction.trim().toUpperCase()) {
            case "USER":   return "CUSTOMER";
            case "ADMIN":  return "ADMIN";
            case "SYSTEM": return "SYSTEM";
            default:       return "SYSTEM";
        }
    }

    private String mapMessageType(String type) {
        if (type == null) return "TEXT";
        switch (type.trim().toUpperCase()) {
            case "TEXT":   return "TEXT";
            case "PHOTO":  return "PHOTO";
            case "SYSTEM": return "SYSTEM";
            // DOCUMENT / VIDEO / AUDIO / VOICE / ANIMATION / STICKER -> FILE
            default:       return "FILE";
        }
    }

    // ---------------------------------------------------------------- step 12
    private int migrateSettings() throws SQLException {
        String sel = "SELECT k, v FROM settings";
        String ins = "INSERT INTO settings (k, v) VALUES (?,?) "
                + "ON DUPLICATE KEY UPDATE v = VALUES(v)";
        int n = 0;
        try (Statement s = oldDb.createStatement();
             ResultSet rs = s.executeQuery(sel);
             PreparedStatement ps = newDb.prepareStatement(ins)) {
            int batch = 0;
            while (rs.next()) {
                ps.setString(1, rs.getString("k"));
                String v = rs.getString("v");
                ps.setString(2, v == null ? "" : v);
                ps.addBatch();
                n++;
                if (++batch % BATCH == 0) ps.executeBatch();
            }
            ps.executeBatch();
        }
        return n;
    }

    // --------------------------------------------------------------- summary
    private void printSummary() {
        log.info("================ MIGRATION SUMMARY ================");
        counts.forEach((k, v) -> log.info(String.format("  %-22s %6d rows", k, v)));
        log.info("--------------------------------------------------");
        if (!failures.isEmpty()) {
            log.warn("---- FAILED STEPS ----");
            failures.forEach((k, v) -> log.warn(String.format("  %-22s %s", k, v)));
        } else {
            log.info("All steps completed without fatal errors.");
        }
        log.info("==================================================");
    }

    private static String orDefault(String v, String def) {
        return (v == null || v.isBlank()) ? def : v;
    }
}
