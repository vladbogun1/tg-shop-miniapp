package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.domain.PromoOrigin;
import com.maxsolch.shop.promo.infra.PromoReservationRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * What the admin does with promo codes, one method per button: runs {@link PromoAdminService} and writes the audit
 * entry after its transaction has committed (a failed scenario leaves no entry). The controller only maps.
 */
@Service
public class AdminPromos {

    /** A code with the number of live customer holds on it. */
    public record Listed(PromoCode promo, long reserved) {
    }

    private final PromoAdminService promoAdminService;
    private final PromoReservationRepository reservationRepository;
    private final AdminAuditService audit;
    private final Clock clock;

    public AdminPromos(PromoAdminService promoAdminService, PromoReservationRepository reservationRepository,
                       AdminAuditService audit, Clock clock) {
        this.promoAdminService = promoAdminService;
        this.reservationRepository = reservationRepository;
        this.audit = audit;
        this.clock = clock;
    }

    /** All codes, newest first; {@code only} narrows to one origin (null = all). */
    public List<Listed> list(PromoOrigin only) {
        Map<String, Long> reserved = new HashMap<>();
        for (Object[] r : reservationRepository.liveCounts(clock.instant())) {
            reserved.put(UuidUtil.toString((byte[]) r[0]), ((Number) r[1]).longValue());
        }
        return promoAdminService.list().stream()
                .filter(p -> only == null || PromoOrigin.of(p) == only)
                .map(p -> new Listed(p, reserved.getOrDefault(UuidUtil.toString(p.getId()), 0L)))
                .toList();
    }

    public PromoCode create(PromoCodeUpsertRequest req) {
        PromoCode created = promoAdminService.create(req);
        audit.record("PROMO_CREATE", "PROMO", UuidUtil.toString(created.getId()), created.getCode());
        return created;
    }

    public PromoCode update(String id, PromoCodeUpsertRequest req) {
        PromoAdminService.Updated result = promoAdminService.update(id, req);
        PromoCode updated = result.promo();
        audit.record("PROMO_UPDATE", "PROMO", id,
                result.previousCode().equals(updated.getCode()) ? updated.getCode()
                        : result.previousCode() + " -> " + updated.getCode());
        return updated;
    }

    public void delete(String id) {
        PromoCode promo = promoAdminService.delete(id);
        // Journal after the delete: a 404 must not leave a deletion that never happened.
        audit.record("PROMO_DELETE", "PROMO", id,
                promo.getCode() + ", использован " + promo.getUsesCount() + " раз");
    }
}
