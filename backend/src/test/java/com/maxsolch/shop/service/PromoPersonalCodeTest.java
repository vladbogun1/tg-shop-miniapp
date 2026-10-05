package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.PromoReservationRepository;
import com.maxsolch.shop.web.dto.PromoPreviewDto;
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
    com.maxsolch.shop.i18n.Messages messages;
    @Mock
    com.maxsolch.shop.settings.SettingsService settings;

    PromoService service;

    @BeforeEach
    void setUp() {
        service = new PromoService(promoCodeRepository, reservationRepository, messages, settings);
        lenient().when(settings.get(anyString(), anyInt())).thenAnswer(inv -> inv.getArgument(1));
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    private static PromoCode personal(Instant expiresAt) {
        PromoCode p = new PromoCode();
        p.setId(UuidUtil.randomBytes());
        p.setCode("THANKS-ABCDEF");
        p.setDiscountPercent(5);
        p.setMaxUses(1);
        p.setOwnerUserId(OWNER);
        p.setExpiresAt(expiresAt);
        p.setSource(PromoCode.SOURCE_REVIEW_BONUS);
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
        PromoCode p = new PromoCode();
        p.setCode("SALE");
        assertThat(PromoService.personalRejection(p, null, Instant.now())).isNull();
        assertThat(PromoService.personalRejection(p, OTHER, Instant.now())).isNull();
    }
}
