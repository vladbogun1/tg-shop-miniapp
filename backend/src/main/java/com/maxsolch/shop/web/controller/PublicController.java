package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.novaposhta.NovaPoshtaService;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.dto.NpCityDto;
import com.maxsolch.shop.web.dto.NpWarehouseDto;
import com.maxsolch.shop.web.dto.PaymentOptionDto;
import com.maxsolch.shop.web.dto.PromoPreviewDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
@Tag(name = "Public", description = "Public payment options and Nova Poshta directory")
public class PublicController {

    private final PaymentOptionRepository paymentOptionRepository;
    private final NovaPoshtaService novaPoshtaService;
    private final PromoCodeRepository promoCodeRepository;

    public PublicController(PaymentOptionRepository paymentOptionRepository,
                            NovaPoshtaService novaPoshtaService,
                            PromoCodeRepository promoCodeRepository) {
        this.paymentOptionRepository = paymentOptionRepository;
        this.novaPoshtaService = novaPoshtaService;
        this.promoCodeRepository = promoCodeRepository;
    }

    /**
     * What a promo code is worth for this cart.
     *
     * <p>Checkout could only say "скидка применится на сервере" and show the pre-discount total,
     * so the customer confirmed one amount and got another. This computes the same discount the
     * order will use — read-only, and it does not consume a use.
     */
    @GetMapping("/promo-codes/preview")
    @Operation(summary = "Preview a promo code's discount for a subtotal")
    public PromoPreviewDto previewPromo(@RequestParam String code,
                                        @RequestParam long subtotalMinor) {
        long subtotal = Math.max(0, subtotalMinor);
        if (code == null || code.isBlank()) {
            return new PromoPreviewDto(false, 0, subtotal, "Введите промокод");
        }
        return promoCodeRepository.findByCodeAndActiveTrue(code.trim())
                .map(promo -> {
                    if (promo.getMaxUses() != null && promo.getUsesCount() >= promo.getMaxUses()) {
                        return new PromoPreviewDto(false, 0, subtotal, "Промокод больше не действует");
                    }
                    long discount = OrderService.discountFor(promo, subtotal);
                    return new PromoPreviewDto(true, discount, subtotal - discount, null);
                })
                .orElseGet(() -> new PromoPreviewDto(false, 0, subtotal, "Промокод не найден"));
    }

    @GetMapping("/payment-options")
    @Operation(summary = "List active payment options")
    public List<PaymentOptionDto> paymentOptions() {
        return paymentOptionRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(p -> new PaymentOptionDto(
                        UuidUtil.toString(p.getId()),
                        p.getTitle(),
                        p.getDescription(),
                        p.isRequiresPrepayment(),
                        p.getPrepaymentMinor()))
                .toList();
    }

    @GetMapping("/np/cities")
    @Operation(summary = "Search Nova Poshta cities")
    public List<NpCityDto> cities(@RequestParam(required = false) String q) {
        return novaPoshtaService.searchCities(q);
    }

    @GetMapping("/np/warehouses")
    @Operation(summary = "Search Nova Poshta warehouses for a city")
    public List<NpWarehouseDto> warehouses(@RequestParam String cityRef,
                                           @RequestParam(required = false) String q) {
        return novaPoshtaService.searchWarehouses(cityRef, q);
    }

    @GetMapping("/np/warehouses/bbox")
    @Operation(summary = "Nova Poshta warehouses inside a map viewport (bounding box) for the map picker")
    public List<NpWarehouseDto> warehousesBbox(@RequestParam double minLat,
                                               @RequestParam double maxLat,
                                               @RequestParam double minLng,
                                               @RequestParam double maxLng,
                                               @RequestParam(required = false, defaultValue = "all") String category,
                                               @RequestParam(required = false) String q,
                                               @RequestParam(required = false, defaultValue = "1200") int limit) {
        return novaPoshtaService.warehousesInBox(minLat, maxLat, minLng, maxLng, category, q, limit);
    }
}
