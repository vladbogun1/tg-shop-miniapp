package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.security.RequiredAdmin;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/admin/promocodes")
@RequiredAdmin
@Tag(name = "Admin Promocodes", description = "Admin promo-code management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPromoController {

    private final PromoCodeRepository promoCodeRepository;
    private final AdminAuditService audit;

    public AdminPromoController(PromoCodeRepository promoCodeRepository, AdminAuditService audit) {
        this.promoCodeRepository = promoCodeRepository;
        this.audit = audit;
    }

    @GetMapping
    @Operation(summary = "List promo codes")
    public List<PromoCodeDto> list() {
        return promoCodeRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toDto)
                .toList();
    }

    @PostMapping
    @Operation(summary = "Create promo code")
    public PromoCodeDto create(@Valid @RequestBody PromoCodeUpsertRequest req) {
        if (promoCodeRepository.findByCode(req.code().trim()).isPresent()) {
            throw new BadRequestException("promo code already exists");
        }
        PromoCode p = new PromoCode();
        p.setCode(req.code().trim());
        apply(p, req);
        PromoCodeDto created = toDto(promoCodeRepository.save(p));
        audit.record("PROMO_CREATE", "PROMO", created.id(), created.code());
        return created;
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update promo code")
    public PromoCodeDto update(@PathVariable String id, @Valid @RequestBody PromoCodeUpsertRequest req) {
        PromoCode p = load(id);
        String previousCode = p.getCode();
        p.setCode(req.code().trim());
        apply(p, req);
        PromoCodeDto updated = toDto(promoCodeRepository.save(p));
        audit.record("PROMO_UPDATE", "PROMO", id,
                previousCode.equals(updated.code()) ? updated.code()
                        : previousCode + " -> " + updated.code());
        return updated;
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete promo code")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        PromoCode promo = load(id);
        audit.record("PROMO_DELETE", "PROMO", id,
                promo.getCode() + ", использован " + promo.getUsesCount() + " раз");
        promoCodeRepository.delete(promo);
        return ResponseEntity.noContent().build();
    }

    private void apply(PromoCode p, PromoCodeUpsertRequest req) {
        p.setDiscountPercent(req.discountPercent());
        p.setDiscountAmountMinor(req.discountAmountMinor());
        p.setMaxUses(req.maxUses());
        if (req.active() != null) {
            p.setActive(req.active());
        }
    }

    private PromoCode load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("invalid id");
        }
        return promoCodeRepository.findById(key).orElseThrow(() -> new NotFoundException("promo code not found"));
    }

    private PromoCodeDto toDto(PromoCode p) {
        return new PromoCodeDto(
                UuidUtil.toString(p.getId()),
                p.getCode(),
                p.getDiscountPercent(),
                p.getDiscountAmountMinor(),
                p.getMaxUses(),
                p.getUsesCount(),
                p.isActive());
    }
}
