package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Promo codes as other modules need them: a code they issue themselves (review bonus, gift-case prize), their
 * own list for a customer, a lookup by code. Applying a code to an order is {@link PromoService}'s job.
 */
@Service
public class PromoCodes {

    private final PromoCodeRepository repository;

    public PromoCodes(PromoCodeRepository repository) {
        this.repository = repository;
    }

    /** Saves a code inside the caller's transaction. */
    public PromoCode save(PromoCode code) {
        return repository.save(code);
    }

    @Transactional(readOnly = true)
    public Optional<PromoCode> find(String code) {
        return repository.findByCode(code);
    }

    /** A customer's personal codes, newest first. */
    @Transactional(readOnly = true)
    public List<PromoCode> ownedBy(long userId) {
        return repository.findByOwnerUserIdOrderByCreatedAtDesc(userId);
    }
}
