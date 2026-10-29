package com.maxsolch.shop.order.domain;

import java.util.List;

/**
 * Денежная арифметика заказа в одном месте: всё в минорных единицах (копейки), без Spring и без
 * состояния. Формулы перенесены из старого OrderService / OrderQueryService / OrderAdjustmentService без
 * изменений — у каждой ниже записано, чем она отличается от соседней (кап received, знак и т.п.).
 */
public final class OrderMoney {

    private OrderMoney() {
    }

    // ----- состав и итог -----

    /** Сумма строк: цена на момент заказа x количество. */
    public static long subtotalMinor(Order order) {
        return order.getItems().stream()
                .mapToLong(i -> i.getPriceMinorSnapshot() * (long) i.getQuantity()).sum();
    }

    /** Итог заказа: подитог минус скидка, не меньше нуля. */
    public static long totalMinor(long subtotalMinor, long discountMinor) {
        return Math.max(0, subtotalMinor - discountMinor);
    }

    /**
     * Пересчёт после правки состава: подитог из строк, сохранённая скидка ограничена подитогом,
     * скидка подарка не больше скидки, итог = подитог минус скидка. Заказ на 0 ₴ «оплачивает»
     * вызывающий (settleFreeOrder) — это статус, а не арифметика.
     */
    public static void reprice(Order order) {
        long subtotal = subtotalMinor(order);
        order.setSubtotalMinor(subtotal);
        long discount = Math.min(Math.max(0, order.getDiscountMinor()), subtotal);
        order.setDiscountMinor(discount);
        order.setGiftDiscountMinor(Math.min(order.getGiftDiscountMinor(), discount));
        order.setTotalMinor(totalMinor(subtotal, discount));
    }

    // ----- к оплате / наложка -----

    /** Что покупатель платит за заказ в итоге: итог без единиц, не выкупленных на почте. */
    public static long collectableMinor(Order order) {
        return collectableMinor(order.getTotalMinor(), order.getUncollectedMinor());
    }

    /** То же по числам — для read-моделей (метрики, ящик), у которых нет сущности {@link Order}. */
    public static long collectableMinor(long totalMinor, long uncollectedMinor) {
        return Math.max(0, totalMinor - Math.max(0, uncollectedMinor));
    }

    /** Что покупатель платит онлайн: предоплата (не больше итога) или весь итог. */
    public static long dueOnlineMinor(Order order) {
        return dueOnlineMinor(order.getTotalMinor(), order.getPrepaymentMinor());
    }

    /** То же по числам. */
    public static long dueOnlineMinor(long totalMinor, long prepaymentMinor) {
        return prepaymentMinor > 0 ? Math.min(prepaymentMinor, totalMinor) : totalMinor;
    }

    /** Сколько ещё доплатить онлайн прямо сейчас (0, когда онлайн-часть закрыта). */
    public static long amountDueMinor(Order order) {
        return amountDueMinor(order.getTotalMinor(), order.getPrepaymentMinor(), order.getReceivedMinor());
    }

    /** То же по числам. */
    public static long amountDueMinor(long totalMinor, long prepaymentMinor, long receivedMinor) {
        return Math.max(0, dueOnlineMinor(totalMinor, prepaymentMinor) - Math.max(0, receivedMinor));
    }

    /** Онлайн-заказ (у него есть срок оплаты), у которого онлайн-часть ещё не пришла. */
    public static boolean onlinePaymentMissing(Order order) {
        return order.getPaymentDueAt() != null && amountDueMinor(order) > 0;
    }

    /** Фактически полученное по заказу, не больше итога и не меньше нуля. */
    public static long receivedMinor(Order order) {
        return Math.min(Math.max(0, order.getReceivedMinor()), order.getTotalMinor());
    }

    /** Наложка на Новой почте: что осталось собрать после полученного. */
    public static long codMinor(Order order) {
        return codMinor(order.getTotalMinor(), order.getUncollectedMinor(), order.getReceivedMinor());
    }

    /** То же по числам. */
    public static long codMinor(long totalMinor, long uncollectedMinor, long receivedMinor) {
        return Math.max(0, collectableMinor(totalMinor, uncollectedMinor)
                - Math.min(Math.max(0, receivedMinor), totalMinor));
    }

    // ----- возвраты -----

    /**
     * Полученное минус возвращённое, БЕЗ кап-а на получено и без нижней границы (может быть
     * отрицательным). Основа проверки переплаты.
     */
    public static long netReceivedMinor(Order order) {
        return netReceivedMinor(order.getReceivedMinor(), order.getRefundedMinor());
    }

    /** То же по числам. */
    public static long netReceivedMinor(long receivedMinor, long refundedMinor) {
        return receivedMinor - Math.max(0, refundedMinor);
    }

    /** Переплата сверх итога после возвратов (netReceived минус итог; отрицательная = недоплата). */
    public static long overpaidMinor(Order order) {
        return netReceivedMinor(order) - order.getTotalMinor();
    }

    /**
     * Оставшееся у магазина: получено (не меньше 0) минус возвращено (не меньше 0); результат
     * может быть отрицательным — в отличие от {@link #refundableMinor}.
     */
    public static long keptMinor(Order order) {
        return Math.max(0, order.getReceivedMinor()) - Math.max(0, order.getRefundedMinor());
    }

    /**
     * Сколько ещё можно вернуть: полученное (не обрезано итогом: после обмена на более дешёвое
     * переплата — ровно то, что нужно вернуть) минус уже возвращённое, не меньше нуля.
     */
    public static long refundableMinor(Order order) {
        long received = Math.max(0, order.getReceivedMinor());
        return Math.max(0, received - Math.max(0, order.getRefundedMinor()));
    }

    // ----- сколько покупатель реально заплатил за строку (целочисленно) -----

    /** Вес строки в скидке: цена x количество; подарки и бесплатные строки не весят ничего. */
    private static long lineWeightMinor(OrderItem item) {
        if (item.isGift() || item.getPriceMinorSnapshot() <= 0 || item.getQuantity() <= 0) {
            return 0;
        }
        return item.getPriceMinorSnapshot() * (long) item.getQuantity();
    }

    /**
     * Сколько покупатель заплатил за всю строку: её сумма минус доля скидки заказа. Скидка
     * делится по строкам пропорционально весу методом наибольшего остатка, поэтому сумма по всем
     * строкам заказа ровно равна {@code подитог − скидка}. Подарочные строки — 0.
     */
    public static long linePaidMinor(Order order, OrderItem item) {
        long weight = lineWeightMinor(item);
        if (weight == 0) {
            return 0;
        }
        List<OrderItem> items = order.getItems();
        long subtotal = 0;
        for (OrderItem i : items) {
            subtotal += lineWeightMinor(i);
        }
        if (subtotal <= 0) {
            return weight;
        }
        long discount = Math.min(Math.max(0, order.getDiscountMinor()), subtotal);
        if (discount == 0) {
            return weight;
        }
        int n = items.size();
        long[] share = new long[n];
        long[] rem = new long[n];
        long given = 0;
        int mine = -1;
        for (int k = 0; k < n; k++) {
            OrderItem i = items.get(k);
            if (i == item) {
                mine = k;
            }
            long w = lineWeightMinor(i);
            share[k] = discount * w / subtotal;
            rem[k] = discount * w % subtotal;
            given += share[k];
        }
        if (mine < 0) {
            // строка не из этого заказа (в тестах): доля без распределения остатка
            return weight - discount * weight / subtotal;
        }
        // остаток (< числа строк) раздаём по одной копейке строкам с наибольшим остатком; при равенстве — по порядку
        long left = discount - given;
        int ahead = 0;
        for (int k = 0; k < n; k++) {
            if (k != mine && (rem[k] > rem[mine] || (rem[k] == rem[mine] && k < mine))) {
                ahead++;
            }
        }
        long extra = ahead < left ? 1 : 0;
        return weight - share[mine] - extra;
    }

    /** Цена одной штуки для показа: целая часть от {@code linePaid / количество}. */
    public static long unitPaidMinor(Order order, OrderItem item) {
        return item.getQuantity() <= 0 ? 0 : linePaidMinor(order, item) / item.getQuantity();
    }

    /**
     * Сколько стоят {@code units} единиц строки, если {@code alreadyReturnedUnits} уже возвращены:
     * {@code floor(L·(r+u)/n) − floor(L·r/n)}. Любая последовательность возвратов одной строки
     * в сумме даёт ровно {@link #linePaidMinor}, без лишней копейки.
     */
    public static long paidForUnitsMinor(Order order, OrderItem item, int alreadyReturnedUnits, int units) {
        int n = item.getQuantity();
        if (n <= 0 || units <= 0) {
            return 0;
        }
        long line = linePaidMinor(order, item);
        long r = Math.max(0, Math.min(alreadyReturnedUnits, n));
        long upTo = Math.min(n, r + units);
        return line * upTo / n - line * r / n;
    }
}
