package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.ErrorCode;
import com.maxsolch.shop.promo.app.PromoCodeUpsertRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public static final String PROMO_USED = "PROMO_USED";

    private final PromoCodeRepository promoCodeRepository;
    private final PromoUsage usage;

    public PromoAdminService(PromoCodeRepository promoCodeRepository, PromoUsage usage) {
        this.promoCodeRepository = promoCodeRepository;
        this.usage = usage;
    }

    /** The code of the URL: 400 for a malformed id, 404 for an unknown one. */
    @Transactional(readOnly = true)
    public PromoCode get(String id) {
        return promoCodeRepository.findById(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound("промокод не найден"));
    }

    @Transactional(readOnly = true)
    public List<PromoCode> list() {
        return promoCodeRepository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional
    public PromoCode create(PromoCodeUpsertRequest req) {
        String code = req.code().trim();
        if (promoCodeRepository.findByCode(code).isPresent()) {
            throw new DomainException.BadRequest("такой промокод уже есть");
        }
        PromoCode p = new PromoCode();
        p.setCode(code);
        apply(p, req);
        return promoCodeRepository.save(p);
    }

    /** The saved code plus the code it had before (differs only on a rename). */
    public record Updated(PromoCode promo, String previousCode) {
    }

    @Transactional
    public Updated update(String id, PromoCodeUpsertRequest req) {
        PromoCode p = promoCodeRepository.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound("промокод не найден"));
        String previousCode = p.getCode();
        String code = req.code().trim();
        if (!code.equals(previousCode)) {
            // Orders keep the code as text (orders.promo_code); releasing a use on cancel/delete
            // looks the code up by that text. After a rename the old orders' uses could never be
            // given back — so a code that has been used keeps its name.
            if (p.getUsesCount() > 0 && !code.equalsIgnoreCase(previousCode)) {
                throw new DomainException.BadRequest(
                        "код уже применялся в заказах — переименовать нельзя, создайте новый");
            }
            promoCodeRepository.findByCode(code)
                    .filter(other -> !java.util.Arrays.equals(other.getId(), p.getId()))
                    .ifPresent(other -> {
                        throw new DomainException.BadRequest("такой промокод уже есть");
                    });
            p.setCode(code);
        }
        apply(p, req);
        return new Updated(promoCodeRepository.save(p), previousCode);
    }

    @Transactional
    public PromoCode delete(String id) {
        PromoCode p = promoCodeRepository.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound("промокод не найден"));
        // A used code is history (orders keep it as text, reports and refunds look it up): only switch it off.
        if (p.getUsesCount() > 0 || usage.usedInOrders(p.getCode())) {
            throw new DomainException.BadRequest("Промокод уже использовали — его можно только выключить", ErrorCode.of(PROMO_USED));
        }
        promoCodeRepository.delete(p);
        return p;
    }

    static void apply(PromoCode p, PromoCodeUpsertRequest req) {
        if (req.discountPercent() <= 0 && req.discountAmountMinor() <= 0) {
            throw new DomainException.BadRequest("укажите процент или сумму скидки");
        }
        p.setDiscountPercent(req.discountPercent());
        p.setDiscountAmountMinor(req.discountAmountMinor());
        p.setMaxUses(req.maxUses());
        if (req.maxDiscountMinor() != null) {
            p.setMaxDiscountMinor(req.maxDiscountMinor());
        }
        if (req.active() != null) {
            p.setActive(req.active());
        }
    }

    private static byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest("неверный идентификатор");
        }
    }
}
