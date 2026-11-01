package com.maxsolch.shop.promo.app;

import static com.maxsolch.shop.promo.domain.PromoCodes.with;
import static com.maxsolch.shop.promo.domain.PromoCodes.promo;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.promo.infra.PromoReservationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Personal codes (review bonus, V44): only the owner, only until they expire — in the cart and the hold. */
@ExtendWith(MockitoExtension.class)
class PromoPersonalCodeTest {

    private static final long OWNER = 100L;
    private static final long OTHER = 200L;
    private static final long SUBTOTAL = 100_000L;

    @Mock
    PromoCodeRepository promoCodeRepository;
    @Mock
    PromoReservationRepository reservationRepository;
    @Mock
    com.maxsolch.shop.platform.i18n.Messages messages;
    @Mock
    com.maxsolch.shop.settings.app.SettingsService settings;

    PromoService service;

    @BeforeEach
    void setUp() {
        service = new PromoService(promoCodeRepository, reservationRepository, messages, settings,
                java.time.Clock.systemUTC(), null);
        lenient().when(settings.get(anyString(), anyInt())).thenAnswer(inv -> inv.getArgument(1));
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static PromoCode personal(Instant expiresAt) {
        PromoCode p = promo().id(UuidUtil.randomBytes()).code("THANKS-ABCDEF").discountPercent(5).maxUses(1).ownerUserId(OWNER).expiresAt(expiresAt).source(PromoCode.SOURCE_REVIEW_BONUS).build();
        return p;
    }

    @Test
    void ownerGetsTheDiscount() {
        PromoCode p = personal(Instant.now().plus(Duration.ofDays(10)));
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("THANKS-ABCDEF")).thenReturn(Optional.of(p));

        PromoPreviewDto result = service.reserve("THANKS-ABCDEF", SUBTOTAL, OWNER);

        assertThat(result.valid()).isTrue();
        assertThat(result.discountMinor()).isEqualTo(5_000L);
    }

    @Test
    void reviewBonusCeilingInPreviewAndHold() {
        PromoCode p = personal(Instant.now().plus(Duration.ofDays(10)));
        with(p, b -> b.maxDiscountMinor(10_000)); // −5 % (до 100 ₴)
        when(promoCodeRepository.findByCodeAndActiveTrue("THANKS-ABCDEF")).thenReturn(Optional.of(p));
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("THANKS-ABCDEF")).thenReturn(Optional.of(p));

        PromoPreviewDto preview = service.preview("THANKS-ABCDEF", 1_000_000L, OWNER);
        assertThat(preview.valid()).isTrue();
        assertThat(preview.discountMinor()).isEqualTo(10_000L);
        assertThat(preview.totalMinor()).isEqualTo(990_000L);

        PromoPreviewDto held = service.reserve("THANKS-ABCDEF", 1_000_000L, OWNER);
        assertThat(held.discountMinor()).isEqualTo(10_000L);

        // A small cart stays at 5 %.
        assertThat(service.preview("THANKS-ABCDEF", SUBTOTAL, OWNER).discountMinor()).isEqualTo(5_000L);
    }

    @Test
    void someoneElseCannotUseIt() {
        PromoCode p = personal(Instant.now().plus(Duration.ofDays(10)));
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("THANKS-ABCDEF")).thenReturn(Optional.of(p));

        PromoPreviewDto result = service.reserve("THANKS-ABCDEF", SUBTOTAL, OTHER);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("api.promo.notFound");
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void guestPreviewAsksToSignIn() {
        PromoCode p = personal(null);
        when(promoCodeRepository.findByCodeAndActiveTrue("THANKS-ABCDEF")).thenReturn(Optional.of(p));

        PromoPreviewDto result = service.preview("THANKS-ABCDEF", SUBTOTAL, null);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("api.promo.personalSignIn");
    }

    @Test
    void expiredCodeIsRefusedEvenToTheOwner() {
        PromoCode p = personal(Instant.now().minusSeconds(1));
        when(promoCodeRepository.findByCodeAndActiveTrue("THANKS-ABCDEF")).thenReturn(Optional.of(p));

        PromoPreviewDto result = service.preview("THANKS-ABCDEF", SUBTOTAL, OWNER);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("api.promo.expired");
    }

    @Test
    void ordinaryCodesAreUnaffected() {
        PromoCode p = promo().code("SALE").build();
        assertThat(PromoService.personalRejection(p, null, Instant.now())).isNull();
        assertThat(PromoService.personalRejection(p, OTHER, Instant.now())).isNull();
    }
}
