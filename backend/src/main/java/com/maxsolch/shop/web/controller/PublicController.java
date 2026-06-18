package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.novaposhta.NovaPoshtaService;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.web.dto.NpCityDto;
import com.maxsolch.shop.web.dto.NpWarehouseDto;
import com.maxsolch.shop.web.dto.PaymentOptionDto;
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

    public PublicController(PaymentOptionRepository paymentOptionRepository,
                            NovaPoshtaService novaPoshtaService) {
        this.paymentOptionRepository = paymentOptionRepository;
        this.novaPoshtaService = novaPoshtaService;
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
}
