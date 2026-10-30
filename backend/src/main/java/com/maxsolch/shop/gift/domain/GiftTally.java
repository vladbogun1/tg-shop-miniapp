package com.maxsolch.shop.gift.domain;

/** What the gift did over a period (not rejected orders): the numbers the admin's gift page shows. */
public record GiftTally(long orders, long giftOrders, long caseOrders, long casesOpened, long guaranteedOrders,
                        long guaranteedMinor, long swaps, long discountPrizes) {
}
