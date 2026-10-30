package com.maxsolch.shop.architecture.v2;

import com.maxsolch.shop.architecture.v2.V2Rules.Violation;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Rule M3: a module's SQL and JPQL touch the tables (and entities) of that module only. Bytecode does not show a table
 * in a string, so the rule reads the sources: every string literal of {@code <module>/**} is searched for
 * {@code FROM/JOIN/UPDATE/INTO <table>} (SQL), {@code FROM/JOIN <Entity>} (JPQL) and fully qualified names of another
 * module's classes. The owner of a table is the module in {@link #TABLE_OWNERS}; the owner of an entity is the module whose
 * package holds it. The read models {@code analytics}, {@code finance} and {@code inbox} may read any table
 * (ARCHITECTURE.md, 2.3); the rest asks the owner through a port. A table that exists in the migrations but not in the map
 * is reported by {@link #unownedTables}: a new table needs an owner.
 */
final class SqlOwnership {

    /** Report modules: they read the tables of the others with their own SQL. */
    static final Set<String> READ_MODELS = Set.of("analytics", "finance", "inbox");

    /** table -> owning module. Every table of the Flyway migrations is listed. */
    static final Map<String, String> TABLE_OWNERS = tables();

    private static final Pattern STRING = Pattern.compile("\"\"\"(.*?)\"\"\"|\"((?:[^\"\\\\\\n]|\\\\.)*)\"", Pattern.DOTALL);
    private static final Pattern JOINED = Pattern.compile("\"\\s*\\+\\s*\"");
    private static final Pattern TABLE_REF = Pattern.compile("(?i)\\b(?:from|join|update|into)\\s+([A-Za-z_][A-Za-z0-9_]*)");
    private static final Pattern FQN = Pattern.compile("com\\.maxsolch\\.shop\\.([a-z]+)\\.(?:domain|infra|app|api)\\.[A-Z]");

    private SqlOwnership() {
    }

    private static Map<String, String> tables() {
        Map<String, String> m = new HashMap<>();
        own(m, "platform", "activity_log", "admin_audit_log", "settings", "shop_settings", "shedlock", "admin_revoked_tokens");
        own(m, "staff", "admin_emergency_resets", "admin_incidents", "admin_invites", "admin_login_log",
                "admin_trusted_devices", "admin_users");
        own(m, "notification", "admin_push_subscriptions", "broadcasts");
        own(m, "analytics", "analytics_daily", "analytics_daily_runs", "analytics_daily_visitors", "client_events");
        own(m, "procurement", "batch_expense_files", "batch_expenses", "preorder_batch_items", "preorder_batches", "suppliers");
        own(m, "catalog", "brands", "categories", "product_images", "product_variants", "products", "spec_attributes",
                "spec_groups", "spec_options", "tags", "product_tags");
        own(m, "cart", "cart_items", "carts");
        own(m, "translation", "content_translations");
        own(m, "gift", "gift_case_items", "gift_case_tiers", "order_gift_cases");
        own(m, "delivery", "nova_poshta_cities", "nova_poshta_warehouses");
        own(m, "returns", "order_exchange_lines", "order_exchanges", "order_return_lines", "order_returns");
        own(m, "order", "order_item_lots", "order_items", "order_messages", "order_money_movements", "orders");
        own(m, "payment", "payment_invoices", "payment_options", "payment_receipts_sent", "payment_requisites",
                "payment_webhook_log");
        own(m, "preorder", "preorder_subscriptions");
        own(m, "promo", "promo_codes", "promo_reservations");
        own(m, "review", "product_reviews");
        own(m, "support", "reply_templates", "support_messages", "support_threads");
        own(m, "inbox", "inbox_marks");
        own(m, "inventory", "stock_lots", "stock_writeoffs");
        own(m, "customer", "users", "web_login_tokens", "web_sessions", "visitor_locations");
        return Map.copyOf(m);
    }

    private static void own(Map<String, String> m, String module, String... tables) {
        for (String t : tables) {
            m.put(t, module);
        }
    }

    /** Tables created by the migrations that have no owner in {@link #TABLE_OWNERS}. */
    static Set<String> unownedTables(Path migrations) {
        Pattern create = Pattern.compile("(?i)CREATE TABLE (?:IF NOT EXISTS )?`?([a-z_0-9]+)`?");
        Set<String> out = new TreeSet<>();
        try (Stream<Path> files = Files.list(migrations)) {
            for (Path f : files.filter(p -> p.toString().endsWith(".sql")).toList()) {
                Matcher mt = create.matcher(Files.readString(f, StandardCharsets.UTF_8));
                while (mt.find()) {
                    if (!TABLE_OWNERS.containsKey(mt.group(1).toLowerCase())) {
                        out.add(mt.group(1));
                    }
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }

    /** Violations of M3 in {@code <module>/**.java} under {@code sources} (e.g. src/main/java/com/maxsolch/shop). */
    static List<Violation> scan(Path sources, String rootPackage) {
        Map<String, String> entityOwners = entityOwners(sources);
        List<Violation> out = new ArrayList<>();
        try (Stream<Path> files = Files.walk(sources)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                Path rel = sources.relativize(file);
                if (rel.getNameCount() < 2) {
                    continue;
                }
                String module = rel.getName(0).toString();
                if (READ_MODELS.contains(module)) {
                    continue;
                }
                String origin = rootPackage + "." + rel.toString().replace('\\', '.').replace('/', '.').replaceAll("\\.java$", "");
                String code = JOINED.matcher(Files.readString(file, StandardCharsets.UTF_8)).replaceAll("");
                for (String foreign : foreignReferences(code, module, entityOwners)) {
                    out.add(new Violation("M3", module, origin + " -> " + foreign));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out.stream().distinct().toList();
    }

    private static Set<String> foreignReferences(String code, String module, Map<String, String> entityOwners) {
        Set<String> out = new TreeSet<>();
        Matcher s = STRING.matcher(code);
        while (s.find()) {
            String text = s.group(1) != null ? s.group(1) : s.group(2);
            Matcher t = TABLE_REF.matcher(text);
            while (t.find()) {
                String name = t.group(1);
                String owner = TABLE_OWNERS.get(name);
                if (owner != null && !owner.equals(module)) {
                    out.add("table " + name + " of " + owner);
                }
                String entityOwner = entityOwners.get(name);
                if (entityOwner != null && !entityOwner.equals(module)) {
                    out.add("entity " + name + " of " + entityOwner);
                }
            }
            Matcher f = FQN.matcher(text);
            while (f.find()) {
                if (!f.group(1).equals(module) && !f.group(1).equals("platform")) {
                    out.add("class of " + f.group(1) + " in a string");
                }
            }
        }
        return out;
    }

    /** simple name of every {@code @Entity} class -> the module of its package. */
    private static Map<String, String> entityOwners(Path sources) {
        Map<String, String> out = new HashMap<>();
        try (Stream<Path> files = Files.walk(sources)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                Path rel = sources.relativize(file);
                if (rel.getNameCount() > 2 && Files.readString(file, StandardCharsets.UTF_8).contains("\n@Entity")) {
                    out.put(file.getFileName().toString().replace(".java", ""), rel.getName(0).toString());
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }
}
