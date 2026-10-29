package com.maxsolch.shop.architecture.v2;

import com.tngtech.archunit.core.domain.JavaClass;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Where a class lives in the target architecture (docs/ARCHITECTURE.md, section 2).
 *
 * <p>A class is "migrated" when it sits in {@code <root>.<module>.{api,app,domain,infra}} of a target module, or
 * anywhere in {@code <root>.platform}. Everything else (the old {@code service}, {@code web}, {@code domain},
 * {@code repository}, {@code tg}, ... and the flat packages of future modules such as {@code catalog}) belongs to the
 * pseudo-module {@code legacy}: it is the work that is left. For the layer rules a legacy class gets an
 * <i>implied</i> layer from its name, annotations and old package, so a service that returns a web DTO is
 * counted as "app uses api" before it is moved.
 */
final class Placement {

    static final String LEGACY = "legacy";
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
            List.of(PLATFORM));

    private static final Set<String> LAYERS = Set.of("api", "app", "domain", "infra");

    /** module -> row in {@link #TIERS}. */
    static final Map<String, Integer> TIER_OF = tierMap();

    /** All module names in the report order: target modules top to bottom, then platform, then legacy. */
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
            return new Place(PLATFORM, Layer.PLATFORM, true);
        }
        if (seg.length > 1 && TIER_OF.containsKey(seg[0]) && LAYERS.contains(seg[1])) {
            return new Place(seg[0], Layer.valueOf(seg[1].toUpperCase()), true);
        }
        return new Place(LEGACY, impliedLayer(c, seg), false);
    }

    private static Layer impliedLayer(JavaClass c, String[] seg) {
        String first = seg.length > 0 ? seg[0] : "";
        String second = seg.length > 1 ? seg[1] : "";
        String name = c.getSimpleName();
        if (first.equals("web") || name.endsWith("Controller") || name.endsWith("ControllerAdvice")
                || c.isAnnotatedWith("org.springframework.web.bind.annotation.RestController")
                || c.isAnnotatedWith("org.springframework.stereotype.Controller")) {
            return Layer.API;
        }
        if (first.equals("repository") || name.endsWith("Store") || name.endsWith("Queries")
                || c.isAssignableTo("org.springframework.data.repository.Repository")) {
            return Layer.INFRA;
        }
        if (first.equals("domain") || second.equals("domain")
                || c.isAnnotatedWith("jakarta.persistence.Entity")
                || c.isAnnotatedWith("jakarta.persistence.Embeddable")
                || c.isAnnotatedWith("jakarta.persistence.MappedSuperclass")) {
            return Layer.DOMAIN;
        }
        return Layer.APP;
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
        all.add(LEGACY);
        return List.copyOf(all);
    }
}
