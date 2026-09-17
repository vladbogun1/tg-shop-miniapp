package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.domain.PromoReservation;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.PromoReservationRepository;
import com.maxsolch.shop.web.dto.PromoPreviewDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

/**
 * Promo codes as the CART sees them: is this code worth anything, and is it still mine when I
 * reach the last step?
 *
 * <p>The cart used to accept any string, show the full price, and let the checkout fail with
 * {@code invalid promo code} on the final step — where the field is no longer editable, so the
 * only way out was to abandon the whole checkout. Validation now happens where the code is typed.
 *
 * <p>That alone would still lie to the customer about a code with a usage limit: the last use can
 * be taken by somebody else between the cart and the order. So a limited code is HELD for
 * {@link #HOLD} once it checks out, and the remaining-uses count subtracts other people's live
 * holds. Unlimited codes are never held — there is nothing to run out of.
 */
@Slf4j
@Service
public class PromoService {

    /** How long a limited code stays reserved for one customer without an order. */
    public static final Duration HOLD = Duration.ofMinutes(30);

    private final PromoCodeRepository promoCodeRepository;
    private final PromoReservationRepository reservationRepository;

    public PromoService(PromoCodeRepository promoCodeRepository,
                        PromoReservationRepository reservationRepository) {
        this.promoCodeRepository = promoCodeRepository;
        this.reservationRepository = reservationRepository;
    }

    /**
     * What the code is worth, without touching anything. {@code userId} may be null (the cart of a
     * customer whose Telegram sign-in has not completed yet); the answer is then simply the
     * optimistic one, since there is nobody to hold the code for.
     */
    @Transactional(readOnly = true)
    public PromoPreviewDto preview(String code, long subtotalMinor, Long userId) {
        long subtotal = Math.max(0, subtotalMinor);
        String normalized = normalize(code);
        if (normalized == null) {
            return invalid(subtotal, "Введите промокод");
        }
        Optional<PromoCode> found = promoCodeRepository.findByCodeAndActiveTrue(normalized);
        if (found.isEmpty()) {
            return invalid(subtotal, "Промокод не найден");
        }
        PromoCode promo = found.get();
        if (remainingUses(promo, userId) <= 0) {
            return invalid(subtotal, "Промокод больше не действует");
        }
        return valid(promo, subtotal, null);
    }

    /**
     * Validates the code and, if it is limited, holds it for this customer for {@link #HOLD}.
     * Calling it again refreshes the same hold instead of creating a second one.
     */
    @Transactional
    public PromoPreviewDto reserve(String code, long subtotalMinor, long userId) {
        long subtotal = Math.max(0, subtotalMinor);
        String normalized = normalize(code);
        if (normalized == null) {
            return invalid(subtotal, "Введите промокод");
        }
        // The same row lock the order path takes: without it two carts can both see "one use left"
        // and both walk away thinking the code is theirs.
        Optional<PromoCode> found = promoCodeRepository.findByCodeAndActiveTrueForUpdate(normalized);
        if (found.isEmpty()) {
            return invalid(subtotal, "Промокод не найден");
        }
        PromoCode promo = found.get();
        if (remainingUses(promo, userId) <= 0) {
            return invalid(subtotal, "Промокод больше не действует");
        }
        if (promo.getMaxUses() == null) {
            return valid(promo, subtotal, null);
        }

        Instant until = Instant.now().plus(HOLD);
        PromoReservation reservation = reservationRepository
                .find(promo.getId(), userId)
                .orElseGet(() -> {
                    PromoReservation fresh = new PromoReservation();
                    fresh.setPromoCodeId(promo.getId());
                    fresh.setTelegramUserId(userId);
                    return fresh;
                });
        reservation.setExpiresAt(until);
        reservationRepository.save(reservation);
        return valid(promo, subtotal, until);
    }

    /** Gives the hold back — the customer cleared or replaced the code. */
    @Transactional
    public void release(String code, long userId) {
        String normalized = normalize(code);
        if (normalized == null) {
            return;
        }
        promoCodeRepository.findByCode(normalized)
                .ifPresent(promo -> reservationRepository.release(promo.getId(), userId));
    }

    /**
     * Drops the hold because the order was placed: the use is now counted on the promo code itself,
     * and keeping the reservation would block one more use for half an hour. Runs inside the order
     * transaction, so it is rolled back with a failed checkout.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void consume(byte[] promoCodeId, long userId) {
        reservationRepository.release(promoCodeId, userId);
    }

    /**
     * Uses left for this customer: the code's own remaining uses minus everybody else's live holds.
     * Own hold is not subtracted — it exists precisely so this customer can still use the code.
     *
     * <p>The order path calls this too, so a code someone is holding is not handed to a different
     * checkout that happens to submit first.
     */
    public long remainingUses(PromoCode promo, Long userId) {
        if (promo.getMaxUses() == null) {
            return Long.MAX_VALUE;
        }
        long left = (long) promo.getMaxUses() - promo.getUsesCount();
        if (left <= 0) {
            return 0;
        }
        long heldByOthers = reservationRepository.countOthers(
                promo.getId(), userId == null ? Long.MIN_VALUE : userId, Instant.now());
        return left - heldByOthers;
    }

    /**
     * Expired holds are already ignored by every query; this only keeps the table from growing
     * forever.
     */
    @Scheduled(fixedDelayString = "${app.promo.reservation-sweep-ms:600000}", initialDelay = 60_000)
    @Transactional
    public void sweepExpired() {
        int removed = reservationRepository.deleteExpired(Instant.now());
        if (removed > 0) {
            log.debug("Released {} expired promo reservation(s)", removed);
        }
    }

    private static String normalize(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        return code.trim();
    }

    private static PromoPreviewDto invalid(long subtotal, String message) {
        return new PromoPreviewDto(false, 0, subtotal, message, null);
    }

    private static PromoPreviewDto valid(PromoCode promo, long subtotal, Instant reservedUntil) {
        long discount = OrderService.discountFor(promo, subtotal);
        return new PromoPreviewDto(true, discount, subtotal - discount, null, reservedUntil);
    }
}
