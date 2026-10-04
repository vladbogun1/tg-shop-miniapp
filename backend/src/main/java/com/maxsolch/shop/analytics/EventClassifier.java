package com.maxsolch.shop.analytics;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Turns raw client events into funnel steps per visitor-day and interest per product-day.
 *
 * <p>Two generations of events are understood:
 * <ul>
 *   <li><b>structured</b> (since package C): {@code product_view}/{@code add_to_cart} with a
 *       product id, {@code checkout_start}, {@code order_created};</li>
 *   <li><b>legacy</b> text clicks recorded before that: a product card click reads
 *       {@code button:<stock badge><title><price>} (the badge is "В наличии" / "В наявності" /
 *       "In stock", or "Нет" / "Немає" / "Out"), the add button {@code button:В корзину} /
 *       {@code У кошик} / {@code Add to cart}, and the checkout is a {@code view} of {@code /checkout}.
 *       The product of a card click is recovered by matching the title; an add-to-cart click is
 *       credited to the last product opened in the same session.</li>
 * </ul>
 * A session that already sends structured events is read only through them — the same tap is also
 * journalled as a click and must not count twice.
 */
public final class EventClassifier {

    public static final int STAGE_VISIT = 1;
    public static final int STAGE_PRODUCT = 2;
    public static final int STAGE_CART = 4;
    public static final int STAGE_CHECKOUT = 8;

    private static final List<String> IN_STOCK_BADGES = List.of("в наличии", "в наявності", "in stock");
    private static final List<String> OUT_BADGES = List.of("немає", "нет", "out");
    private static final Set<String> LEGACY_ADD = Set.of("button:в корзину", "button:у кошик", "button:add to cart");
    /** A truncated card label still identifies a product once this much of the title is there. */
    private static final int MIN_PARTIAL_TITLE = 16;

    /** One raw row, already filtered to a single day. */
    public record RawEvent(long id,
                           String channel,
                           Long telegramUserId,
                           String anonId,
                           String sessionId,
                           String event,
                           String target,
                           String path,
                           String productId,
                           Instant createdAt) {
    }

    public record VisitorDay(LocalDate day, String channel, String visitorKey, Long telegramUserId,
                             int stages, int events) {
    }

    public record ProductDay(LocalDate day, String channel, String productId, int views, int viewers,
                             int cartAdds) {
    }

    public record DayResult(List<VisitorDay> visitors, List<ProductDay> products) {
    }

    /** Lower-cased product titles (original + translations) -> product id, for legacy card clicks. */
    public static final class TitleIndex {
        private final List<Map.Entry<String, String>> titles;

        public TitleIndex(Map<String, String> titleToProductId) {
            List<Map.Entry<String, String>> list = new ArrayList<>();
            titleToProductId.forEach((t, id) -> {
                if (t != null && !t.isBlank() && id != null) {
                    list.add(Map.entry(t.strip().toLowerCase(Locale.ROOT), id));
                }
            });
            // Longest first: "Mouse X Pro" must win over "Mouse X".
            list.sort(Comparator.comparingInt((Map.Entry<String, String> e) -> e.getKey().length()).reversed());
            this.titles = list;
        }

        public static TitleIndex empty() {
            return new TitleIndex(Map.of());
        }

        /** Product whose title starts {@code rest} (or that {@code rest}, if truncated, starts). */
        String match(String rest) {
            for (Map.Entry<String, String> e : titles) {
                String title = e.getKey();
                if (rest.startsWith(title)) {
                    return e.getValue();
                }
                if (rest.length() >= MIN_PARTIAL_TITLE && title.startsWith(rest)) {
                    return e.getValue();
                }
            }
            return null;
        }
    }

    private final ZoneId zone;
    private final TitleIndex titleIndex;

    public EventClassifier(ZoneId zone, TitleIndex titleIndex) {
        this.zone = zone;
        this.titleIndex = titleIndex;
    }

    /** Groups events by their local day and classifies each day. */
    public DayResult classify(Collection<RawEvent> events) {
        Map<String, List<RawEvent>> bySession = new LinkedHashMap<>();
        for (RawEvent e : events) {
            bySession.computeIfAbsent(e.channel() + "|" + e.sessionId(), k -> new ArrayList<>()).add(e);
        }

        Map<String, VisitorAcc> visitors = new LinkedHashMap<>();
        Map<String, ProductAcc> products = new LinkedHashMap<>();

        for (List<RawEvent> session : bySession.values()) {
            session.sort(Comparator.comparingLong(RawEvent::id));
            boolean structured = session.stream().anyMatch(e -> isStructured(e.event()));
            String lastProduct = null;
            for (RawEvent e : session) {
                LocalDate day = LocalDate.ofInstant(e.createdAt(), zone);
                String key = visitorKey(e);
                if (key == null) {
                    continue;
                }
                VisitorAcc v = visitors.computeIfAbsent(day + "|" + e.channel() + "|" + key,
                        k -> new VisitorAcc(day, e.channel(), key));
                v.events++;
                v.stages |= STAGE_VISIT;
                if (v.telegramUserId == null && e.telegramUserId() != null) {
                    v.telegramUserId = e.telegramUserId();
                }

                String event = e.event() == null ? "" : e.event();
                String viewed = null;
                String added = null;
                boolean checkout = false;
                boolean cartClick = false;

                if (StructuredEvents.PRODUCT_VIEW.equals(event)) {
                    viewed = e.productId();
                    v.stages |= STAGE_PRODUCT;
                } else if (StructuredEvents.ADD_TO_CART.equals(event)) {
                    added = e.productId();
                    cartClick = true;
                } else if (StructuredEvents.CHECKOUT_START.equals(event)) {
                    checkout = true;
                } else if (!structured) {
                    if ("click".equals(event) && e.target() != null) {
                        String target = e.target().toLowerCase(Locale.ROOT);
                        LegacyCard card = legacyCard(target);
                        if (card != null) {
                            viewed = card.productId();
                            v.stages |= STAGE_PRODUCT;
                        } else if (LEGACY_ADD.contains(target)) {
                            added = lastProduct;
                            cartClick = true;
                        }
                    } else if ("view".equals(event) && isCheckoutPath(e.path(), e.target())) {
                        checkout = true;
                    }
                }
                if (cartClick) {
                    v.stages |= STAGE_CART;
                }
                if (checkout) {
                    v.stages |= STAGE_CHECKOUT;
                }
                if (viewed != null) {
                    lastProduct = viewed;
                    ProductAcc p = products.computeIfAbsent(day + "|" + e.channel() + "|" + viewed,
                            k -> new ProductAcc(day, e.channel(), lastProductOf(k)));
                    p.views++;
                    p.viewers.add(key);
                }
                if (added != null) {
                    String productKey = day + "|" + e.channel() + "|" + added;
                    ProductAcc p = products.computeIfAbsent(productKey,
                            k -> new ProductAcc(day, e.channel(), lastProductOf(k)));
                    p.cartAdds++;
                }
            }
        }

        List<VisitorDay> vOut = new ArrayList<>(visitors.size());
        visitors.values().forEach(v -> vOut.add(new VisitorDay(v.day, v.channel, v.key, v.telegramUserId,
                v.stages, v.events)));
        List<ProductDay> pOut = new ArrayList<>(products.size());
        products.values().forEach(p -> pOut.add(new ProductDay(p.day, p.channel, p.productId, p.views,
                p.viewers.size(), p.cartAdds)));
        return new DayResult(vOut, pOut);
    }

    private static String lastProductOf(String key) {
        return key.substring(key.lastIndexOf('|') + 1);
    }

    static boolean isStructured(String event) {
        return StructuredEvents.PRODUCT_VIEW.equals(event)
                || StructuredEvents.ADD_TO_CART.equals(event)
                || StructuredEvents.CHECKOUT_START.equals(event)
                || StructuredEvents.ORDER_CREATED.equals(event);
    }

    /** {@code t:<telegram id>} for the Mini App and signed-in site visitors, else {@code a:<anon id>}. */
    static String visitorKey(RawEvent e) {
        if ("WEB".equals(e.channel()) && e.anonId() != null) {
            return "a:" + e.anonId();
        }
        if (e.telegramUserId() != null) {
            return "t:" + e.telegramUserId();
        }
        return e.anonId() == null ? null : "a:" + e.anonId();
    }

    private static boolean isCheckoutPath(String path, String target) {
        return (path != null && path.startsWith("/checkout")) || (target != null && target.startsWith("/checkout"));
    }

    private record LegacyCard(String productId) {
    }

    /** A legacy product-card click, with its product when the title could be matched. */
    private LegacyCard legacyCard(String target) {
        if (!target.startsWith("button:")) {
            return null;
        }
        String label = target.substring("button:".length());
        for (String badge : IN_STOCK_BADGES) {
            if (label.startsWith(badge)) {
                // The badge alone is specific enough to count the step even without a title match.
                return new LegacyCard(titleIndex.match(label.substring(badge.length())));
            }
        }
        for (String badge : OUT_BADGES) {
            if (label.startsWith(badge)) {
                // "Нет…" can begin other buttons too: only a matched title makes it a card.
                String id = titleIndex.match(label.substring(badge.length()));
                return id == null ? null : new LegacyCard(id);
            }
        }
        return null;
    }

    private static final class VisitorAcc {
        final LocalDate day;
        final String channel;
        final String key;
        Long telegramUserId;
        int stages;
        int events;

        VisitorAcc(LocalDate day, String channel, String key) {
            this.day = day;
            this.channel = channel;
            this.key = key;
        }
    }

    private static final class ProductAcc {
        final LocalDate day;
        final String channel;
        final String productId;
        final Set<String> viewers = new HashSet<>();
        int views;
        int cartAdds;

        ProductAcc(LocalDate day, String channel, String productId) {
            this.day = day;
            this.channel = channel;
            this.productId = Objects.requireNonNull(productId);
        }
    }

    /** Merges per-day visitor rows across days into distinct visitors with OR-ed stages. */
    public static Map<String, Integer> stagesByVisitor(Collection<VisitorDay> rows) {
        Map<String, Integer> out = new HashMap<>();
        for (VisitorDay v : rows) {
            out.merge(v.channel() + "|" + v.visitorKey(), v.stages(), (a, b) -> a | b);
        }
        return out;
    }
}
