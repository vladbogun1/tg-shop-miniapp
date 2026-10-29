package com.maxsolch.shop.returns.domain;

import com.maxsolch.shop.order.domain.OrderMoneyMovement;

/** Money given back by hand, not through monobank: Nova Poshta, card transfer, cash… */
public record ManualRefund(OrderMoneyMovement.Channel channel, long amountMinor, String note) {
}
