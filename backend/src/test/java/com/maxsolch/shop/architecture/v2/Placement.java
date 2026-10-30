package com.maxsolch.shop.architecture.v2;

import com.tngtech.archunit.core.domain.JavaClass;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Where a class lives in the target architecture (docs/ARCHITECTURE.md, section 2).
 *
 * <p>Every class sits in {@code <root>.<module>.{api,app,domain,infra}} of a target module or anywhere in
 * {@code <root>.platform}; the only class of the root package is the entry point ({@link #BOOTSTRAP}). Anything else
 * is {@link #OUTSIDE}: rule R1 reports it, and the layer rules count it as {@code app}.
 */
final class Placement {

    /** Pseudo-module of a class that lies in no module layout (reported by R1). */
    static final String OUTSIDE = "outside";
    /** The entry point class in the root package. */
    static final String BOOTSTRAP = "bootstrap";
    static final String PLATFORM = "platform";

    enum Layer { API, APP, DOMAIN, INFRA, PLATFORM }

    /** Modules from top to bottom: a module may depend on modules of the same or a lower row, never on a higher one. */
    static final List<List<String>> TIERS = List.of(
            List.of("finance", "analytics", "inbox"),
            List.of("review", "support", "gift"),
            List.of("returns", "payment", "delivery"),
            List.of("order"),
            List.of("cart", "promo"),
            List.of("preorder"),
            List.of("procurement"),
            List.of("inventory"),
            List.of("catalog"),
            List.of("customer", "staff"),
            List.of("translation", "media", "site", "notification"),
            List.of("settings"),
            List.of("audit", "journal"),
            List.of(PLATFORM));

    private static final Set<String> LAYERS = Set.of("api", "app", "domain", "infra");

    /** module -> row in {@link #TIERS}. */
    static final Map<String, Integer> TIER_OF = tierMap();

    /** All module names in the report order: target modules top to bottom, then platform, bootstrap and outside. */
    static final List<String> REPORT_ORDER = reportOrder();

    private final String root;

    Placement(String root) {
        this.root = root;
    }

    record Place(String module, Layer layer, boolean migrated) {
    }

    /** Dotted package relative to the root, or null for classes outside it. */
    private String relative(JavaClass c) {
        String pkg = c.getPackageName();
        if (pkg.equals(root)) {
            return "";
        }
        return pkg.startsWith(root + ".") ? pkg.substring(root.length() + 1) : null;
    }

    static JavaClass outermost(JavaClass c) {
        JavaClass cur = c;
        while (cur.getEnclosingClass().isPresent()) {
            cur = cur.getEnclosingClass().get();
        }
        return cur;
    }

    boolean inProject(JavaClass c) {
        return relative(c) != null;
    }

    Place place(JavaClass any) {
        JavaClass c = outermost(any);
        String rel = relative(c);
        if (rel == null) {
            return new Place("external", Layer.APP, false);
        }
        String[] seg = rel.isEmpty() ? new String[0] : rel.split("\\.");
        if (seg.length > 0 && seg[0].equals(PLATFORM)) {
            // platform.infra is the platform's own storage (the shedlock table): the one infra layer of the platform
            return new Place(PLATFORM, seg.length > 1 && seg[1].equals("infra") ? Layer.INFRA : Layer.PLATFORM, true);
        }
        if (seg.length > 1 && TIER_OF.containsKey(seg[0]) && LAYERS.contains(seg[1])) {
            return new Place(seg[0], Layer.valueOf(seg[1].toUpperCase()), true);
        }
        if (seg.length == 0) {
            return new Place(BOOTSTRAP, Layer.PLATFORM, true);
        }
        return new Place(OUTSIDE, Layer.APP, false);
    }

    private static Map<String, Integer> tierMap() {
        java.util.HashMap<String, Integer> m = new java.util.HashMap<>();
        for (int i = 0; i < TIERS.size(); i++) {
            for (String module : TIERS.get(i)) {
                m.put(module, i);
            }
        }
        return Map.copyOf(m);
    }

    private static List<String> reportOrder() {
        java.util.ArrayList<String> all = new java.util.ArrayList<>();
        TIERS.forEach(all::addAll);
        all.add(BOOTSTRAP);
        all.add(OUTSIDE);
        return List.copyOf(all);
    }
}
