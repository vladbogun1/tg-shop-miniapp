package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * Taking and giving back a use of a promo code for an order. All three run inside the caller's (order's)
 * transaction: the row lock is held until that transaction ends, so a code limited to one use cannot be taken by
 * several simultaneous checkouts and the two increments cannot overwrite each other.
 */
@Service
public class PromoUses {

    private final PromoCodeRepository promoCodeRepository;

    public PromoUses(PromoCodeRepository promoCodeRepository) {
        this.promoCodeRepository = promoCodeRepository;
    }

    /** An active code by its text, with a row lock. */
    public Optional<PromoCode> lockActive(String code) {
        return promoCodeRepository.findByCodeAndActiveTrueForUpdate(code);
    }

    /** One more use of a code that {@link #lockActive} returned. */
    public void countUse(PromoCode promo) {
        promo.setUsesCount(promo.getUsesCount() + 1);
        promoCodeRepository.save(promo);
    }

    /** Gives one use back (an order cancelled or edited); a code that is not found or has no uses is left alone. */
    public void release(String code) {
        // Locked like the checkout increment, or the two could overwrite each other's count.
        promoCodeRepository.findByCodeForUpdate(code).ifPresent(p -> {
            if (p.getUsesCount() > 0) {
                p.setUsesCount(p.getUsesCount() - 1);
                promoCodeRepository.save(p);
            }
        });
    }
}
