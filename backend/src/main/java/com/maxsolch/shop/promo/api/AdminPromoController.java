package com.maxsolch.shop.promo.api;

import com.maxsolch.shop.promo.domain.PromoError;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.app.AdminPromos;
import com.maxsolch.shop.promo.app.PromoCodeUpsertRequest;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.domain.PromoOrigin;
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

/**
 * Promo codes of the admin panel. The pages «Заказы с кодом» and «Персональные скидки» are about orders and live in
 * the order module ({@code AdminPromoOrdersController}) under the same URLs.
 */
@RestController
@RequestMapping("/api/admin/promocodes")
@RequiredAdmin
@Tag(name = "Admin Promocodes", description = "Admin promo-code management")
@SecurityRequirement(name = "bearer-jwt")
public class AdminPromoController {

    private final AdminPromos promos;

    public AdminPromoController(AdminPromos promos) {
        this.promos = promos;
    }

    @GetMapping
    @Operation(summary = "List promo codes (with live reservations); origin=OURS|PERSONAL|REVIEW narrows the list")
    public List<PromoCodeDto> list(@RequestParam(required = false) String origin) {
        PromoOrigin only;
        try {
            only = PromoOrigin.parse(origin);
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(PromoError.INVALID_ORIGIN);
        }
        return promos.list(only).stream().map(l -> toDto(l.promo(), l.reserved())).toList();
    }

    @PostMapping
    @Operation(summary = "Create promo code")
    public PromoCodeDto create(@Valid @RequestBody PromoCodeUpsertRequest req) {
        return toDto(promos.create(req), 0L);
    }

    @PatchMapping("/{id}")
    @Operation(summary = "Update promo code (a code that was already used cannot be renamed)")
    public PromoCodeDto update(@PathVariable String id, @Valid @RequestBody PromoCodeUpsertRequest req) {
        return toDto(promos.update(id, req), 0L);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete promo code")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        promos.delete(id);
        return ResponseEntity.noContent().build();
    }

    private PromoCodeDto toDto(PromoCode p, long reserved) {
        return new PromoCodeDto(
                UuidUtil.toString(p.getId()),
                p.getCode(),
                p.getDiscountPercent(),
                p.getDiscountAmountMinor(),
                p.getMaxDiscountMinor(),
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
