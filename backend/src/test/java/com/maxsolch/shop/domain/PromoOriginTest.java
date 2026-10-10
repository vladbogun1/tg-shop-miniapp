package com.maxsolch.shop.domain;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.PromoReservationRepository;
import com.maxsolch.shop.service.PromoAdminService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.controller.AdminPromoController;
import com.maxsolch.shop.web.dto.PromoCodeDto;
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
        // An unknown generated source is never mixed into the shared codes.
        assertThat(PromoOrigin.of("SOMETHING_NEW", null)).isEqualTo(PromoOrigin.PERSONAL);
    }

    @Test
    void parsesTheFilter() {
        assertThat(PromoOrigin.parse(null)).isNull();
        assertThat(PromoOrigin.parse(" ")).isNull();
        assertThat(PromoOrigin.parse("review")).isEqualTo(PromoOrigin.REVIEW);
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
                code("VIP-7", null, 7L)));
        AdminPromoController controller = new AdminPromoController(service, mock(PromoCodeRepository.class),
                reservations, mock(AdminAuditService.class));

        assertThat(controller.list(null)).extracting(PromoCodeDto::origin)
                .containsExactly("OURS", "REVIEW", "PERSONAL");
        assertThat(controller.list("ours")).extracting(PromoCodeDto::code).containsExactly("SUMMER");
        assertThat(controller.list("REVIEW")).extracting(PromoCodeDto::code).containsExactly("THANKS-AAA");
        assertThat(controller.list("personal")).extracting(PromoCodeDto::code).containsExactly("VIP-7");
        assertThatThrownBy(() -> controller.list("nope")).isInstanceOf(BadRequestException.class);
    }

    private static PromoCode code(String code, String source, Long owner) {
        PromoCode p = new PromoCode();
        p.setId(com.maxsolch.shop.common.UuidUtil.randomBytes());
        p.setCode(code);
        p.setSource(source);
        p.setOwnerUserId(owner);
        return p;
    }
}
