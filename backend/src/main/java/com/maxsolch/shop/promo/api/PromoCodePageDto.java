package com.maxsolch.shop.promo.api;

import java.util.List;

/** A page of one tab of «Промокоды»: {@code total} fits search and state, {@code originTotal} only the tab (its counter). */
public record PromoCodePageDto(List<PromoCodeDto> items, long total, int page, int size, long originTotal) {
}
