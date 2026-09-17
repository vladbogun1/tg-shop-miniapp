package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.domain.PromoReservation;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.PromoReservationRepository;
import com.maxsolch.shop.web.dto.PromoPreviewDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The half-hour hold, which is what keeps the cart's promise honest: the cart now shows a
 * discounted total, so the code behind it must still be there when the order is submitted.
 */
@ExtendWith(MockitoExtension.class)
class PromoServiceTest {

    private static final long USER = 100L;
    private static final long OTHER_USER = 200L;
    private static final long SUBTOTAL = 100_000L;

    @Mock
    PromoCodeRepository promoCodeRepository;
    @Mock
    PromoReservationRepository reservationRepository;

    PromoService service;

    @BeforeEach
    void setUp() {
        service = new PromoService(promoCodeRepository, reservationRepository);
    }

    private PromoCode code(String value, Integer maxUses, int usesCount) {
        PromoCode promo = new PromoCode();
        promo.setId(UuidUtil.randomBytes());
        promo.setCode(value);
        promo.setDiscountPercent(10);
        promo.setMaxUses(maxUses);
        promo.setUsesCount(usesCount);
        return promo;
    }

    @Test
    void previewRejectsUnknownCode() {
        when(promoCodeRepository.findByCodeAndActiveTrue("NOPE")).thenReturn(Optional.empty());

        PromoPreviewDto result = service.preview("NOPE", SUBTOTAL, USER);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("Промокод не найден");
        assertThat(result.totalMinor()).isEqualTo(SUBTOTAL);
    }

    @Test
    void previewComputesTheDiscountWithoutHoldingAnything() {
        when(promoCodeRepository.findByCodeAndActiveTrue("TEN")).thenReturn(Optional.of(code("TEN", null, 0)));

        PromoPreviewDto result = service.preview("TEN", SUBTOTAL, USER);

        assertThat(result.valid()).isTrue();
        assertThat(result.discountMinor()).isEqualTo(10_000L);
        assertThat(result.totalMinor()).isEqualTo(90_000L);
        assertThat(result.reservedUntil()).isNull();
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void reserveHoldsALimitedCodeForThisCustomer() {
        PromoCode promo = code("LIMITED", 3, 1);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("LIMITED")).thenReturn(Optional.of(promo));
        when(reservationRepository.countOthers(eq(promo.getId()), eq(USER), any())).thenReturn(0L);
        when(reservationRepository.find(promo.getId(), USER)).thenReturn(Optional.empty());

        Instant before = Instant.now();
        PromoPreviewDto result = service.reserve("LIMITED", SUBTOTAL, USER);

        assertThat(result.valid()).isTrue();
        assertThat(result.reservedUntil()).isAfter(before.plusSeconds(PromoService.HOLD.toSeconds() - 60));

        ArgumentCaptor<PromoReservation> saved = ArgumentCaptor.forClass(PromoReservation.class);
        verify(reservationRepository).save(saved.capture());
        assertThat(saved.getValue().getTelegramUserId()).isEqualTo(USER);
        assertThat(saved.getValue().getPromoCodeId()).isEqualTo(promo.getId());
    }

    @Test
    void reserveDoesNotHoldAnUnlimitedCode() {
        PromoCode promo = code("FOREVER", null, 42);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("FOREVER")).thenReturn(Optional.of(promo));

        PromoPreviewDto result = service.reserve("FOREVER", SUBTOTAL, USER);

        assertThat(result.valid()).isTrue();
        assertThat(result.reservedUntil()).isNull();
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void theLastUseHeldBySomebodyElseIsNotOffered() {
        PromoCode promo = code("LASTONE", 2, 1);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("LASTONE")).thenReturn(Optional.of(promo));
        // One use left on paper, but another customer is holding it.
        when(reservationRepository.countOthers(eq(promo.getId()), eq(USER), any())).thenReturn(1L);

        PromoPreviewDto result = service.reserve("LASTONE", SUBTOTAL, USER);

        assertThat(result.valid()).isFalse();
        assertThat(result.message()).isEqualTo("Промокод больше не действует");
        verify(reservationRepository, never()).save(any());
    }

    @Test
    void ownHoldDoesNotBlockTheOwner() {
        PromoCode promo = code("MINE", 1, 0);
        when(promoCodeRepository.findByCodeAndActiveTrueForUpdate("MINE")).thenReturn(Optional.of(promo));
        // countOthers excludes this customer, so their own existing hold is invisible here.
        when(reservationRepository.countOthers(eq(promo.getId()), eq(USER), any())).thenReturn(0L);
        PromoReservation existing = new PromoReservation();
        existing.setPromoCodeId(promo.getId());
        existing.setTelegramUserId(USER);
        existing.setExpiresAt(Instant.now());
        when(reservationRepository.find(promo.getId(), USER)).thenReturn(Optional.of(existing));

        PromoPreviewDto result = service.reserve("MINE", SUBTOTAL, USER);

        assertThat(result.valid()).isTrue();
        // Refreshed, not duplicated.
        verify(reservationRepository).save(existing);
        assertThat(existing.getExpiresAt()).isAfter(Instant.now().plusSeconds(60));
    }

    @Test
    void releaseGivesTheHoldBack() {
        PromoCode promo = code("LIMITED", 3, 1);
        when(promoCodeRepository.findByCode("LIMITED")).thenReturn(Optional.of(promo));

        service.release("LIMITED", OTHER_USER);

        verify(reservationRepository).release(promo.getId(), OTHER_USER);
    }

    @Test
    void releaseOfABlankCodeTouchesNothing() {
        service.release("  ", USER);

        verify(reservationRepository, never()).release(any(), anyLong());
    }
}
