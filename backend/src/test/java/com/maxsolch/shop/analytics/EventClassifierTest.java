package com.maxsolch.shop.analytics;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class EventClassifierTest {

    private static final ZoneId KYIV = ZoneId.of("Europe/Kyiv");
    private final Instant t = Instant.parse("2026-09-20T10:00:00Z");
    private long seq;

    private final EventClassifier classifier = new EventClassifier(KYIV, new EventClassifier.TitleIndex(Map.of(
            "Attack Shark R68 HE white", "p-white",
            "Attack Shark R68 HE", "p-base",
            "IPI Qi Pro (Черный)", "p-ipi")));

    private EventClassifier.RawEvent miniapp(long user, String session, String event, String target, String path,
                                             String productId) {
        return new EventClassifier.RawEvent(++seq, "MINIAPP", user, null, session, event, target, path, productId,
                t.plusSeconds(seq));
    }

    @Test
    void legacyClicks_cardTitleMatched_addCreditedToLastOpenedProduct_checkoutByPath() {
        List<EventClassifier.RawEvent> ev = new ArrayList<>();
        ev.add(miniapp(1, "s1", "view", "/", "/", null));
        ev.add(miniapp(1, "s1", "click", "button:В наличииAttack Shark R68 HE white3 300 ₴", "/", null));
        ev.add(miniapp(1, "s1", "click", "button:В корзину", "/", null));
        ev.add(miniapp(1, "s1", "view", "/checkout", "/checkout", null));
        ev.add(miniapp(2, "s2", "click", "button:Мышки", "/", null)); // just browsing

        EventClassifier.DayResult r = classifier.classify(ev);

        assertThat(r.visitors()).hasSize(2);
        EventClassifier.VisitorDay buyer = r.visitors().stream().filter(v -> v.visitorKey().equals("t:1")).findFirst().orElseThrow();
        assertThat(buyer.stages()).isEqualTo(EventClassifier.STAGE_VISIT | EventClassifier.STAGE_PRODUCT
                | EventClassifier.STAGE_CART | EventClassifier.STAGE_CHECKOUT);
        EventClassifier.ProductDay white = r.products().stream().filter(p -> p.productId().equals("p-white")).findFirst().orElseThrow();
        assertThat(white.views()).isEqualTo(1);
        assertThat(white.cartAdds()).isEqualTo(1); // the longer title wins over "Attack Shark R68 HE"
    }

    @Test
    void legacyOutOfStockBadge_needsATitleMatch() {
        List<EventClassifier.RawEvent> ev = List.of(
                miniapp(1, "s1", "click", "button:НетIPI Qi Pro (Черный)3 500 ₴", "/", null),
                miniapp(2, "s2", "click", "button:Нет, спасибо", "/", null));

        EventClassifier.DayResult r = classifier.classify(new ArrayList<>(ev));

        assertThat(r.products()).extracting(EventClassifier.ProductDay::productId).containsExactly("p-ipi");
        assertThat(r.visitors()).filteredOn(v -> v.visitorKey().equals("t:2"))
                .singleElement().satisfies(v -> assertThat(v.stages()).isEqualTo(EventClassifier.STAGE_VISIT));
    }

    @Test
    void structuredSession_isNotDoubleCountedByItsClicks() {
        List<EventClassifier.RawEvent> ev = new ArrayList<>();
        ev.add(miniapp(1, "s1", "click", "button:В наличииAttack Shark R68 HE white3 300 ₴", "/", null));
        ev.add(miniapp(1, "s1", StructuredEvents.PRODUCT_VIEW, null, "/", "p-white"));
        ev.add(miniapp(1, "s1", "click", "button:В корзину", "/", null));
        ev.add(miniapp(1, "s1", StructuredEvents.ADD_TO_CART, null, "/", "p-white"));

        EventClassifier.DayResult r = classifier.classify(ev);

        EventClassifier.ProductDay p = r.products().get(0);
        assertThat(r.products()).hasSize(1);
        assertThat(p.views()).isEqualTo(1);
        assertThat(p.cartAdds()).isEqualTo(1);
    }

    @Test
    void webVisitor_isKeyedByAnonId_andPicksUpTheTelegramIdAfterLogin() {
        List<EventClassifier.RawEvent> ev = List.of(
                new EventClassifier.RawEvent(1, "WEB", null, "anon12345", "w1", StructuredEvents.PRODUCT_VIEW, null,
                        "/uk/product/x", "p-ipi", t),
                new EventClassifier.RawEvent(2, "WEB", 77L, "anon12345", "w1", StructuredEvents.CHECKOUT_START, null,
                        "/uk/checkout", null, t.plusSeconds(60)));

        EventClassifier.DayResult r = classifier.classify(new ArrayList<>(ev));

        assertThat(r.visitors()).singleElement().satisfies(v -> {
            assertThat(v.visitorKey()).isEqualTo("a:anon12345");
            assertThat(v.telegramUserId()).isEqualTo(77L);
            assertThat(v.stages() & EventClassifier.STAGE_CHECKOUT).isNotZero();
        });
    }

    @Test
    void stagesByVisitor_orsTheDays() {
        var a = new EventClassifier.VisitorDay(java.time.LocalDate.parse("2026-09-01"), "MINIAPP", "t:1", 1L, 3, 5);
        var b = new EventClassifier.VisitorDay(java.time.LocalDate.parse("2026-09-02"), "MINIAPP", "t:1", 1L, 5, 2);

        assertThat(EventClassifier.stagesByVisitor(List.of(a, b))).containsEntry("MINIAPP|t:1", 7);
    }
}
