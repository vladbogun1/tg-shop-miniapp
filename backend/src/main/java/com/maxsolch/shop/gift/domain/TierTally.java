package com.maxsolch.shop.gift.domain;

/** Cases of one tier in a period: given, opened, and the guaranteed discount taken instead. */
public record TierTally(String tier, long cases, long opened, long guaranteed) {
}
