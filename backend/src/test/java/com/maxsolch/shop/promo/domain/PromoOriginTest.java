package com.maxsolch.shop.promo.domain;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.promo.infra.PromoReservationRepository;
import com.maxsolch.shop.promo.app.PromoAdminService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.promo.api.AdminPromoController;
import com.maxsolch.shop.promo.api.PromoCodeDto;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Tabs of the «Промокоды» page: «Наши» / «Персональные» / «За отзывы». */
class PromoOriginTest {

    @Test
    void classifiesBySourceAndOwner() {
        assertThat(PromoOrigin.of(null, null)).isEqualTo(PromoOrigin.OURS);
        assertThat(PromoOrigin.of(PromoCode.SOURCE_REVIEW_BONUS, 42L)).isEqualTo(PromoOrigin.REVIEW);
        // A review bonus stays a review bonus even if the owner was cleared.
        assertThat(PromoOrigin.of(PromoCode.SOURCE_REVIEW_BONUS, null)).isEqualTo(PromoOrigin.REVIEW);
        assertThat(PromoOrigin.of(null, 42L)).isEqualTo(PromoOrigin.PERSONAL);
        // A case prize has its own tab, with or without an owner.
        assertThat(PromoOrigin.of(PromoCode.SOURCE_GIFT_CASE, 42L)).isEqualTo(PromoOrigin.CASE);
        assertThat(PromoOrigin.of(PromoCode.SOURCE_GIFT_CASE, null)).isEqualTo(PromoOrigin.CASE);
        // An unknown generated source is never mixed into the shared codes.
        assertThat(PromoOrigin.of("SOMETHING_NEW", null)).isEqualTo(PromoOrigin.PERSONAL);
    }

    @Test
    void parsesTheFilter() {
        assertThat(PromoOrigin.parse(null)).isNull();
        assertThat(PromoOrigin.parse(" ")).isNull();
        assertThat(PromoOrigin.parse("review")).isEqualTo(PromoOrigin.REVIEW);
        assertThat(PromoOrigin.parse("case")).isEqualTo(PromoOrigin.CASE);
        assertThatThrownBy(() -> PromoOrigin.parse("all")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void adminListFiltersByOriginAndReportsIt() {
        PromoAdminService service = mock(PromoAdminService.class);
        PromoReservationRepository reservations = mock(PromoReservationRepository.class);
        when(reservations.liveCounts(any())).thenReturn(List.of());
        when(service.list()).thenReturn(List.of(
                code("SUMMER", null, null),
                code("THANKS-AAA", PromoCode.SOURCE_REVIEW_BONUS, 7L),
                code("VIP-7", null, 7L),
                code("CASE-1", PromoCode.SOURCE_GIFT_CASE, 7L)));
        AdminPromoController controller = new AdminPromoController(new com.maxsolch.shop.promo.app.AdminPromos(service, reservations,
                mock(AdminAuditService.class), java.time.Clock.systemUTC()));

        assertThat(controller.list(null)).extracting(PromoCodeDto::origin)
                .containsExactly("OURS", "REVIEW", "PERSONAL", "CASE");
        assertThat(controller.list("ours")).extracting(PromoCodeDto::code).containsExactly("SUMMER");
        assertThat(controller.list("REVIEW")).extracting(PromoCodeDto::code).containsExactly("THANKS-AAA");
        assertThat(controller.list("personal")).extracting(PromoCodeDto::code).containsExactly("VIP-7");
        assertThat(controller.list("case")).extracting(PromoCodeDto::code).containsExactly("CASE-1");
        assertThatThrownBy(() -> controller.list("nope")).isInstanceOf(DomainException.BadRequest.class);
    }

    private static PromoCode code(String code, String source, Long owner) {
        PromoCode p = new PromoCode();
        p.setId(com.maxsolch.shop.platform.util.UuidUtil.randomBytes());
        p.setCode(code);
        p.setSource(source);
        p.setOwnerUserId(owner);
        return p;
    }
}
