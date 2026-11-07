package com.maxsolch.shop.it;

import com.maxsolch.shop.promo.app.AdminPromos;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.domain.PromoCodes;
import com.maxsolch.shop.promo.domain.PromoOrigin;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The server-side tabs of «Промокоды» (origin, search, state, paging) against the real database. */
class AdminPromoPageIT extends AbstractMysqlIT {

    @Autowired
    AdminPromos promos;
    @Autowired
    PromoCodeRepository repository;

    private PromoCode save(String code, String source, Long owner, boolean active, Instant expires, Integer maxUses, int uses) {
        return repository.save(PromoCodes.promo().code(code).discountPercent(10).active(active).source(source)
                .ownerUserId(owner).expiresAt(expires).maxUses(maxUses).usesCount(uses).build());
    }

    @Test
    void caseTab_listsOnlyCasePrizes_withSearchStateAndPaging() {
        String tag = "T" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        Instant future = Instant.now().plus(10, ChronoUnit.DAYS);
        Instant past = Instant.now().minus(1, ChronoUnit.DAYS);
        for (int i = 0; i < 3; i++) {
            save(tag + "-C" + i, PromoCode.SOURCE_GIFT_CASE, 900_000L + i, true, future, 1, 0);
        }
        save(tag + "-CUSED", PromoCode.SOURCE_GIFT_CASE, 900_100L, true, future, 1, 1);
        save(tag + "-CGONE", PromoCode.SOURCE_GIFT_CASE, 900_101L, true, past, 1, 0);
        save(tag + "-COFF", PromoCode.SOURCE_GIFT_CASE, 900_102L, false, future, 1, 0);
        save(tag + "-REV", PromoCode.SOURCE_REVIEW_BONUS, 900_103L, true, future, 1, 0);
        save(tag + "-VIP", null, 900_104L, true, null, null, 0);
        save(tag + "-OURS", null, null, true, null, null, 0);

        var all = promos.page(PromoOrigin.CASE, tag, null, 0, 50);
        assertThat(all.total()).isEqualTo(6);
        assertThat(all.items()).allSatisfy(l -> assertThat(PromoOrigin.of(l.promo())).isEqualTo(PromoOrigin.CASE));
        assertThat(all.originTotal()).isGreaterThanOrEqualTo(6);

        assertThat(promos.page(PromoOrigin.CASE, tag, "live", 0, 50).total()).isEqualTo(3);
        assertThat(promos.page(PromoOrigin.CASE, tag, "off", 0, 50).total()).isEqualTo(3);

        var first = promos.page(PromoOrigin.CASE, tag, null, 0, 4);
        var second = promos.page(PromoOrigin.CASE, tag, null, 1, 4);
        assertThat(first.items()).hasSize(4);
        assertThat(second.items()).hasSize(2);
        assertThat(first.total()).isEqualTo(6);
        assertThat(first.items().stream().map(l -> l.promo().getCode()))
                .doesNotContainAnyElementsOf(second.items().stream().map(l -> l.promo().getCode()).toList());

        // Search by the owner's Telegram id.
        assertThat(promos.page(PromoOrigin.CASE, "900100", null, 0, 10).items())
                .extracting(l -> l.promo().getCode()).containsExactly(tag + "-CUSED");
    }

    @Test
    void otherOrigins_matchTheInMemoryRule() {
        String tag = "U" + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        save(tag + "-CASE", PromoCode.SOURCE_GIFT_CASE, 1L, true, null, null, 0);
        save(tag + "-REV", PromoCode.SOURCE_REVIEW_BONUS, 2L, true, null, null, 0);
        save(tag + "-VIP", null, 3L, true, null, null, 0);
        save(tag + "-ODD", "SOMETHING_NEW", null, true, null, null, 0);
        save(tag + "-OURS", null, null, true, null, null, 0);

        for (PromoOrigin o : PromoOrigin.values()) {
            var codes = promos.page(o, tag, null, 0, 50).items().stream().map(l -> l.promo().getCode()).sorted().toList();
            var expected = promos.list(o).stream().map(l -> l.promo().getCode()).filter(c -> c.startsWith(tag)).sorted().toList();
            assertThat(codes).as(o.name()).isEqualTo(expected);
        }
        assertThat(promos.page(PromoOrigin.PERSONAL, tag, null, 0, 50).items())
                .extracting(l -> l.promo().getCode()).containsExactlyInAnyOrder(tag + "-VIP", tag + "-ODD");
        assertThat(promos.page(PromoOrigin.OURS, tag, null, 0, 50).items())
                .extracting(l -> l.promo().getCode()).containsExactly(tag + "-OURS");
    }
}
