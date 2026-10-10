package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.PromoCodeUpsertRequest;
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

    private final PromoCodeRepository promoCodeRepository;

    public PromoAdminService(PromoCodeRepository promoCodeRepository) {
        this.promoCodeRepository = promoCodeRepository;
    }

    @Transactional(readOnly = true)
    public List<PromoCode> list() {
        return promoCodeRepository.findAllByOrderByCreatedAtDesc();
    }

    @Transactional
    public PromoCode create(PromoCodeUpsertRequest req) {
        String code = req.code().trim();
        if (promoCodeRepository.findByCode(code).isPresent()) {
            throw new BadRequestException("такой промокод уже есть");
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
                .orElseThrow(() -> new NotFoundException("промокод не найден"));
        String previousCode = p.getCode();
        String code = req.code().trim();
        if (!code.equals(previousCode)) {
            // Orders keep the code as text (orders.promo_code); releasing a use on cancel/delete
            // looks the code up by that text. After a rename the old orders' uses could never be
            // given back — so a code that has been used keeps its name.
            if (p.getUsesCount() > 0 && !code.equalsIgnoreCase(previousCode)) {
                throw new BadRequestException(
                        "код уже применялся в заказах — переименовать нельзя, создайте новый");
            }
            promoCodeRepository.findByCode(code)
                    .filter(other -> !java.util.Arrays.equals(other.getId(), p.getId()))
                    .ifPresent(other -> {
                        throw new BadRequestException("такой промокод уже есть");
                    });
            p.setCode(code);
        }
        apply(p, req);
        return new Updated(promoCodeRepository.save(p), previousCode);
    }

    @Transactional
    public PromoCode delete(String id) {
        PromoCode p = promoCodeRepository.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new NotFoundException("промокод не найден"));
        promoCodeRepository.delete(p);
        return p;
    }

    static void apply(PromoCode p, PromoCodeUpsertRequest req) {
        if (req.discountPercent() <= 0 && req.discountAmountMinor() <= 0) {
            throw new BadRequestException("укажите процент или сумму скидки");
        }
        p.setDiscountPercent(req.discountPercent());
        p.setDiscountAmountMinor(req.discountAmountMinor());
        p.setMaxUses(req.maxUses());
        if (req.active() != null) {
            p.setActive(req.active());
        }
    }

    private static byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неверный идентификатор");
        }
    }
}
