package com.maxsolch.shop.novaposhta;

import com.maxsolch.shop.domain.NovaPoshtaCity;
import com.maxsolch.shop.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.repository.NovaPoshtaCityRepository;
import com.maxsolch.shop.repository.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.web.dto.NpCityDto;
import com.maxsolch.shop.web.dto.NpWarehouseDto;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Read-side queries against the locally-synced Nova Poshta directory. Results are Caffeine-cached.
 */
@Service
public class NovaPoshtaService {

    // NP TypeOfWarehouse refs (stable) → friendly categories used by the map filter.
    private static final String TYPE_POSTOMAT = "f9316480-5f2d-425d-bc2c-ac7cd29decf0";
    private static final String TYPE_BRANCH = "841339c7-591a-42e2-8233-7a0a00f0ed6f";
    private static final String TYPE_POINT = "9a68df70-0267-42a8-bb5c-37f427e36ee4";

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
        return warehouses.stream().map(NovaPoshtaService::toDto).toList();
    }

    /**
     * Warehouses inside a map viewport (bounding box), optionally filtered by category
     * (all|postomat|branch|point) and a number/address query. Capped at {@code limit}.
     */
    @Transactional(readOnly = true)
    public List<NpWarehouseDto> warehousesInBox(double minLat, double maxLat, double minLng, double maxLng,
                                                String category, String q, int limit) {
        String typeRef = typeRefFor(category);
        String like = (q == null || q.isBlank()) ? null : "%" + q.trim().toLowerCase() + "%";
        int cap = Math.max(1, Math.min(limit, 2000));
        return warehouseRepository
                .findInBox(minLat, maxLat, minLng, maxLng, typeRef, like, PageRequest.of(0, cap))
                .stream()
                .map(NovaPoshtaService::toDto)
                .toList();
    }

    private static String typeRefFor(String category) {
        if (category == null) {
            return null;
        }
        return switch (category.trim().toLowerCase()) {
            case "postomat" -> TYPE_POSTOMAT;
            case "branch" -> TYPE_BRANCH;
            case "point" -> TYPE_POINT;
            default -> null; // "all" / unknown
        };
    }

    private static String categoryOf(String typeRef) {
        if (TYPE_POSTOMAT.equals(typeRef)) return "POSTOMAT";
        if (TYPE_BRANCH.equals(typeRef)) return "BRANCH";
        if (TYPE_POINT.equals(typeRef)) return "POINT";
        return "OTHER";
    }

    private static NpWarehouseDto toDto(NovaPoshtaWarehouse w) {
        return new NpWarehouseDto(w.getRef(), w.getNumber(), w.getDescription(), w.getType(),
                categoryOf(w.getType()), w.getCityRef(), w.getCityName(), w.getLat(), w.getLng());
    }
}
