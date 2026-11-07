package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.promo.domain.PromoError;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.promo.domain.PromoOrigin;
import com.maxsolch.shop.promo.infra.PromoSpecs;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * Promo-code administration (was inline in the controller, without a transaction).
 *
 * <p>Edits take the promo row lock — the same one checkout takes to count a use. Saving the form
 * writes the whole row, and without the lock a checkout that took a use between "load" and "save"
 * had its {@code uses_count++} overwritten by the stale form, i.e. the usage limit leaked a use.
 */
@Service
public class PromoAdminService {


    private final PromoCodeRepository promoCodeRepository;
    private final PromoUsage usage;
    private final Clock clock;
    private final ShopZone zone;

    public PromoAdminService(PromoCodeRepository promoCodeRepository, PromoUsage usage, Clock clock, ShopZone zone) {
        this.promoCodeRepository = promoCodeRepository;
        this.usage = usage;
        this.clock = clock;
        this.zone = zone;
    }

    /** The code of the URL: 400 for a malformed id, 404 for an unknown one. */
    @Transactional(readOnly = true)
    public PromoCode get(String id) {
        return promoCodeRepository.findById(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound(PromoError.PROMO_NOT_FOUND));
    }

    @Transactional(readOnly = true)
    public List<PromoCode> list() {
        return promoCodeRepository.findAllByOrderByCreatedAtDesc();
    }

    /** One page of codes, newest first; filters are applied by the database ({@link PromoSpecs}). */
    @Transactional(readOnly = true)
    public Page<PromoCode> page(PromoOrigin origin, String search, String state, int page, int size) {
        var spec = PromoSpecs.origin(origin).and(PromoSpecs.search(search)).and(PromoSpecs.state(state, clock.instant()));
        return promoCodeRepository.findAll(spec, PageRequest.of(page, size,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.asc("id"))));
    }

    /** How many codes the origin has, ignoring search and state (the tab counter). */
    @Transactional(readOnly = true)
    public long countOrigin(PromoOrigin origin) {
        return promoCodeRepository.count(PromoSpecs.origin(origin));
    }

    @Transactional
    public PromoCode create(PromoCodeUpsertRequest req) {
        String code = req.code().trim();
        if (promoCodeRepository.findByCode(code).isPresent()) {
            throw new DomainException.BadRequest(PromoError.CODE_TAKEN);
        }
        PromoCode p = PromoCode.named(code);
        apply(p, req);
        applyExpiry(p, req);
        return promoCodeRepository.save(p);
    }

    /** The saved code plus the code it had before (differs only on a rename). */
    public record Updated(PromoCode promo, String previousCode) {
    }

    @Transactional
    public Updated update(String id, PromoCodeUpsertRequest req) {
        PromoCode p = promoCodeRepository.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound(PromoError.PROMO_NOT_FOUND));
        String previousCode = p.getCode();
        String code = req.code().trim();
        if (!code.equals(previousCode)) {
            // Orders keep the code as text (orders.promo_code); releasing a use on cancel/delete
            // looks the code up by that text. After a rename the old orders' uses could never be
            // given back — so a code that has been used keeps its name.
            if (p.getUsesCount() > 0 && !code.equalsIgnoreCase(previousCode)) {
                throw new DomainException.BadRequest(PromoError.CODE_ALREADY_USED_RENAME);
            }
            promoCodeRepository.findByCode(code)
                    .filter(other -> !java.util.Arrays.equals(other.getId(), p.getId()))
                    .ifPresent(other -> {
                        throw new DomainException.BadRequest(PromoError.CODE_TAKEN);
                    });
            p.rename(code);
        }
        apply(p, req);
        applyExpiry(p, req);
        return new Updated(promoCodeRepository.save(p), previousCode);
    }

    @Transactional
    public PromoCode delete(String id) {
        PromoCode p = promoCodeRepository.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound(PromoError.PROMO_NOT_FOUND));
        // A used code is history (orders keep it as text, reports and refunds look it up): only switch it off.
        if (p.getUsesCount() > 0 || usage.usedInOrders(p.getCode())) {
            throw new DomainException.BadRequest(PromoError.PROMO_USED);
        }
        promoCodeRepository.delete(p);
        return p;
    }

    static void apply(PromoCode p, PromoCodeUpsertRequest req) {
        if (req.discountPercent() <= 0 && req.discountAmountMinor() <= 0) {
            throw new DomainException.BadRequest(PromoError.DISCOUNT_REQUIRED);
        }
        p.edit(req.discountPercent(), req.discountAmountMinor(), req.maxUses(), req.maxDiscountMinor(), req.active());
    }

    /**
     * The expiry of the form: {@code noExpiry} removes it, {@code expiresOn} sets the end of that shop day, nothing
     * leaves it as it was. A day that already passed is refused — unless it is the day the code already has (an
     * expired code can still be edited without touching its date).
     */
    private void applyExpiry(PromoCode p, PromoCodeUpsertRequest req) {
        if (Boolean.TRUE.equals(req.noExpiry())) {
            p.expireAt(null);
            return;
        }
        if (req.expiresOn() == null || req.expiresOn().isBlank()) {
            return;
        }
        Instant end = zone.day(req.expiresOn(), true).minusSeconds(1);
        if (end.equals(p.getExpiresAt())) {
            return;
        }
        if (!end.isAfter(clock.instant())) {
            throw new DomainException.BadRequest(PromoError.EXPIRY_IN_PAST);
        }
        p.expireAt(end);
    }

    private static byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(PromoError.INVALID_ID);
        }
    }
}
