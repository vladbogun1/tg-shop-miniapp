package com.maxsolch.shop.novaposhta;

import com.maxsolch.shop.domain.NovaPoshtaCity;
import com.maxsolch.shop.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.repository.NovaPoshtaCityRepository;
import com.maxsolch.shop.repository.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.web.dto.NpCityDto;
import com.maxsolch.shop.web.dto.NpWarehouseDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Read-side queries against the locally-synced Nova Poshta directory. Results are Caffeine-cached.
 */
@Service
public class NovaPoshtaService {

    private final NovaPoshtaCityRepository cityRepository;
    private final NovaPoshtaWarehouseRepository warehouseRepository;

    public NovaPoshtaService(NovaPoshtaCityRepository cityRepository,
                             NovaPoshtaWarehouseRepository warehouseRepository) {
        this.cityRepository = cityRepository;
        this.warehouseRepository = warehouseRepository;
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "npCities", key = "#q == null ? '' : #q.trim().toLowerCase()")
    public List<NpCityDto> searchCities(String q) {
        List<NovaPoshtaCity> cities = (q == null || q.isBlank())
                ? cityRepository.findTop50ByOrderByNameAsc()
                : cityRepository.findTop50ByNameContainingIgnoreCaseOrderByNameAsc(q.trim());
        return cities.stream()
                .map(c -> new NpCityDto(c.getRef(), c.getName(), c.getArea()))
                .toList();
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "npWarehouses",
            key = "(#cityRef == null ? '' : #cityRef) + '|' + (#q == null ? '' : #q.trim().toLowerCase())")
    public List<NpWarehouseDto> searchWarehouses(String cityRef, String q) {
        if (cityRef == null || cityRef.isBlank()) {
            return List.of();
        }
        List<NovaPoshtaWarehouse> warehouses = (q == null || q.isBlank())
                ? warehouseRepository.findByCityRefOrderByNumberAsc(cityRef)
                : warehouseRepository.findTop100ByCityRefAndDescriptionContainingIgnoreCaseOrderByNumberAsc(
                        cityRef, q.trim());
        return warehouses.stream()
                .map(w -> new NpWarehouseDto(w.getRef(), w.getNumber(), w.getDescription(), w.getType()))
                .toList();
    }
}
