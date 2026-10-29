package com.maxsolch.shop.domain;

/**
 * Денежная арифметика заказа в одном месте: всё в минорных единицах (копейки), без Spring и без
 * состояния. Формулы перенесены из OrderService / OrderQueryService / OrderAdjustmentService без
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
        return Math.max(0, order.getTotalMinor() - Math.max(0, order.getUncollectedMinor()));
    }

    /** Что покупатель платит онлайн: предоплата (не больше итога) или весь итог. */
    public static long dueOnlineMinor(Order order) {
        long total = order.getTotalMinor();
        return order.getPrepaymentMinor() > 0 ? Math.min(order.getPrepaymentMinor(), total) : total;
    }

    /** Сколько ещё доплатить онлайн прямо сейчас (0, когда онлайн-часть закрыта). */
    public static long amountDueMinor(Order order) {
        return Math.max(0, dueOnlineMinor(order) - Math.max(0, order.getReceivedMinor()));
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
        return Math.max(0, collectableMinor(order) - receivedMinor(order));
    }

    // ----- возвраты -----

    /**
     * Полученное минус возвращённое, БЕЗ кап-а на получено и без нижней границы (может быть
     * отрицательным). Основа проверки переплаты.
     */
    public static long netReceivedMinor(Order order) {
        return order.getReceivedMinor() - Math.max(0, order.getRefundedMinor());
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
}
