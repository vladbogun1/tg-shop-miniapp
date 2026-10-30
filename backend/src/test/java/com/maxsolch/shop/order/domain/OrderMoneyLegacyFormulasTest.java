package com.maxsolch.shop.order.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

/**
 * Старые копии денежных формул (MetricsFacts, InboxRules, MarginService, NotificationService,
 * CancelRequestService) записаны здесь дословно и сверяются с числовыми перегрузками
 * {@link OrderMoney} на сетке значений. Тест фиксирует, что перевод копий на OrderMoney не
 * изменил ни одного результата. Итог заказа неотрицателен (его даёт {@code OrderMoney.totalMinor}).
 */
class OrderMoneyLegacyFormulasTest {

    private static final long[] TOTALS = {0, 1, 99, 1000, 8999, 100_000};
    private static final long[] OTHER = {-500, -1, 0, 1, 50, 999, 1000, 1001, 8999, 9000, 150_000};

    @Test
    void metricsFactsCollectableAndCod() {
        for (long t : TOTALS) {
            for (long u : OTHER) {
                assertEquals(Math.max(0, t - Math.max(0, u)), OrderMoney.collectableMinor(t, u), t + "/" + u);
                for (long r : OTHER) {
                    long legacyCod = Math.max(0, t - Math.max(0, u) - Math.max(0, r));
                    assertEquals(legacyCod, OrderMoney.codMinor(t, u, r), t + "/" + u + "/" + r);
                }
            }
        }
    }

    @Test
    void inboxOnlineDue() {
        for (long t : TOTALS) {
            for (long p : OTHER) {
                for (long r : OTHER) {
                    long due = p > 0 ? Math.min(p, t) : t;
                    assertEquals(Math.max(0, due - Math.max(0, r)), OrderMoney.amountDueMinor(t, p, r));
                }
                assertEquals(p > 0 ? Math.min(p, t) : t, OrderMoney.dueOnlineMinor(t, p));
            }
        }
    }

    @Test
    void inboxNetReceived() {
        for (long r : OTHER) {
            for (long f : OTHER) {
                assertEquals(r - Math.max(0, f), OrderMoney.netReceivedMinor(r, f));
            }
        }
    }

    @Test
    void cancelRequestManualMoneyAndNotificationReceived() {
        for (long t : TOTALS) {
            for (long r : OTHER) {
                Order o = new Order();
                OrderFixtures.set(o, "totalMinor", t);
                OrderFixtures.set(o, "receivedMinor", r);
                // NotificationService: Math.min(Math.max(0, received), total)
                assertEquals(Math.min(Math.max(0, r), t), OrderMoney.receivedMinor(o));
                // CancelRequestService: Math.max(0, Math.min(received, total) - onlineReceived), онлайн >= 0
                for (long online : new long[] {0, 1, 500, 9000}) {
                    assertEquals(Math.max(0, Math.min(r, t) - online),
                            Math.max(0, OrderMoney.receivedMinor(o) - online), t + "/" + r + "/" + online);
                }
            }
        }
    }

    @Test
    void marginOnlineDue() {
        for (long t : TOTALS) {
            for (long p : OTHER) {
                assertEquals(p > 0 ? Math.min(p, t) : t, OrderMoney.dueOnlineMinor(t, p));
            }
        }
    }
}
