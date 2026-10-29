package com.maxsolch.shop.delivery.api;

import com.maxsolch.shop.delivery.app.NovaPoshtaService;
import com.maxsolch.shop.delivery.app.NpCityDto;
import com.maxsolch.shop.delivery.app.NpWarehouseDto;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The public Nova Poshta directory: cities, a city's warehouses, warehouses inside a map viewport. */
@RestController
@RequestMapping("/api/np")
@Tag(name = "Nova Poshta", description = "Public Nova Poshta directory")
public class NovaPoshtaController {

    private final NovaPoshtaService novaPoshtaService;

    public NovaPoshtaController(NovaPoshtaService novaPoshtaService) {
        this.novaPoshtaService = novaPoshtaService;
    }

    @GetMapping("/cities")
    @Operation(summary = "Search Nova Poshta cities")
    public List<NpCityDto> cities(@RequestParam(required = false) String q) {
        return novaPoshtaService.searchCities(q);
    }

    @GetMapping("/warehouses")
    @Operation(summary = "Search Nova Poshta warehouses for a city")
    public List<NpWarehouseDto> warehouses(@RequestParam String cityRef,
                                           @RequestParam(required = false) String q) {
        return novaPoshtaService.searchWarehouses(cityRef, q);
    }

    @GetMapping("/warehouses/bbox")
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
