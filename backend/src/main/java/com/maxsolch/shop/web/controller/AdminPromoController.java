package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.domain.PromoOrigin;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.repository.PromoReservationRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.PromoAdminService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.PromoCodeDto;
import com.maxsolch.shop.web.dto.PromoCodeUpsertRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.time.Instant;

@RestController
@RequestMapping("/api/admin/promocodes")
@RequiredAdmin
@Tag(name = "Admin Promocodes", description = "Admin promo-code management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPromoController {

    private final PromoAdminService promoAdminService;
    private final PromoCodeRepository promoCodeRepository;
    private final PromoReservationRepository reservationRepository;
    private final AdminAuditService audit;

    public AdminPromoController(PromoAdminService promoAdminService,
                                PromoCodeRepository promoCodeRepository,
                                PromoReservationRepository reservationRepository,
                                AdminAuditService audit) {
        this.promoAdminService = promoAdminService;
        this.promoCodeRepository = promoCodeRepository;
        this.reservationRepository = reservationRepository;
        this.audit = audit;
    }

    @GetMapping
    @Operation(summary = "List promo codes (with live reservations); origin=OURS|PERSONAL|REVIEW narrows the list")
    public List<PromoCodeDto> list(@RequestParam(required = false) String origin) {
        PromoOrigin only;
        try {
            only = PromoOrigin.parse(origin);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("origin: OURS, PERSONAL или REVIEW");
        }
        Map<String, Long> reserved = new HashMap<>();
        for (Object[] r : reservationRepository.liveCounts(Instant.now())) {
            reserved.put(UuidUtil.toString((byte[]) r[0]), ((Number) r[1]).longValue());
        }
        return promoAdminService.list().stream()
                .filter(p -> only == null || PromoOrigin.of(p) == only)
                .map(p -> toDto(p, reserved.getOrDefault(UuidUtil.toString(p.getId()), 0L)))
                .toList();
    }

    @GetMapping("/manual-discounts")
    @Operation(summary = "Orders with a manual amount/percent discount, newest first (max 200)")
    public List<PromoCodeDto.ManualDiscountDto> manualDiscounts() {
        return promoCodeRepository.ordersWithManualDiscount(PromoOrigin.MANUAL_DISCOUNT_LABEL,
                        org.springframework.data.domain.PageRequest.of(0, 200)).stream()
                .map(o -> new PromoCodeDto.ManualDiscountDto(UuidUtil.toString(o.getId()),
                        o.getStatus() == null ? null : o.getStatus().name(),
                        o.getCustomerName(), o.getUserId(), o.getPromoCode(),
                        o.getTotalMinor(), o.getDiscountMinor(), o.getCreatedAt()))
                .toList();
    }

    @GetMapping("/{id}/orders")
    @Operation(summary = "Orders placed with this code, newest first (max 100)")
    public List<PromoCodeDto.PromoOrderDto> orders(@PathVariable String id) {
        PromoCode promo = load(id);
        return promoCodeRepository.ordersWithCode(promo.getCode(),
                        org.springframework.data.domain.PageRequest.of(0, 100)).stream()
                .map(o -> new PromoCodeDto.PromoOrderDto(UuidUtil.toString(o.getId()),
                        o.getStatus() == null ? null : o.getStatus().name(),
                        o.getCustomerName(), o.getTotalMinor(), o.getDiscountMinor(), o.getCreatedAt()))
                .toList();
    }

    @PostMapping
    @Operation(summary = "Create promo code")
    public PromoCodeDto create(@Valid @RequestBody PromoCodeUpsertRequest req) {
        PromoCodeDto created = toDto(promoAdminService.create(req));
        audit.record("PROMO_CREATE", "PROMO", created.id(), created.code());
        return created;
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update promo code (a code that was already used cannot be renamed)")
    public PromoCodeDto update(@PathVariable String id, @Valid @RequestBody PromoCodeUpsertRequest req) {
        PromoAdminService.Updated result = promoAdminService.update(id, req);
        PromoCodeDto updated = toDto(result.promo());
        audit.record("PROMO_UPDATE", "PROMO", id,
                result.previousCode().equals(updated.code()) ? updated.code()
                        : result.previousCode() + " -> " + updated.code());
        return updated;
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete promo code")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        PromoCode promo = promoAdminService.delete(id);
        // Journal after the delete: a 404 must not leave a deletion that never happened.
        audit.record("PROMO_DELETE", "PROMO", id,
                promo.getCode() + ", использован " + promo.getUsesCount() + " раз");
        return ResponseEntity.noContent().build();
    }

    private PromoCode load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неверный идентификатор");
        }
        return promoCodeRepository.findById(key).orElseThrow(() -> new NotFoundException("промокод не найден"));
    }

    private PromoCodeDto toDto(PromoCode p) {
        return toDto(p, 0L);
    }

    private PromoCodeDto toDto(PromoCode p, long reserved) {
        return new PromoCodeDto(
                UuidUtil.toString(p.getId()),
                p.getCode(),
                p.getDiscountPercent(),
                p.getDiscountAmountMinor(),
                p.getMaxUses(),
                p.getUsesCount(),
                p.isActive(),
                reserved,
                p.getOwnerUserId(),
                p.getExpiresAt(),
                p.getSource(),
                PromoOrigin.of(p).name());
    }
}
