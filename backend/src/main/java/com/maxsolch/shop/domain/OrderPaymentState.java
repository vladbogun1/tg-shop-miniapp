package com.maxsolch.shop.domain;

import java.time.Instant;

/**
 * Состояние оплаты заказа так, как его показывают карточки, списки, детали и строка отгрузки:
 * один расчёт через {@link OrderMoney} вместо четырёх копий в сборке DTO.
 *
 * @param receivedMinor   полученное, не больше итога и не меньше нуля ({@link OrderMoney#receivedMinor})
 * @param paymentDueAt    срок онлайн-оплаты; null у заказов до онлайн-оплаты
 * @param amountDueMinor  сколько ещё платить онлайн сейчас
 * @param uncollectedMinor оплаченное, но не забранное на отделении (частичный выкуп), не меньше нуля
 */
public record OrderPaymentState(boolean paid, long receivedMinor, Instant paymentDueAt, long amountDueMinor,
                                long uncollectedMinor) {

    public static OrderPaymentState of(Order o) {
        return new OrderPaymentState(o.isPaid(), OrderMoney.receivedMinor(o), o.getPaymentDueAt(),
                OrderMoney.amountDueMinor(o), Math.max(0, o.getUncollectedMinor()));
    }
}
