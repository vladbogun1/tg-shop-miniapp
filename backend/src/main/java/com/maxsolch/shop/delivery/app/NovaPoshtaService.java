package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaCity;
import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
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

    // NP TypeOfWarehouse refs (stable, Address.getWarehouseTypes) → friendly categories of the map filter.
    // «Вантажне відділення» (9a68df70) is a branch, «Пункт приймання-видачі (з обмеженнями)» (6f8c7162) a point.
    static final List<String> TYPES_POSTOMAT = List.of(
            "f9316480-5f2d-425d-bc2c-ac7cd29decf0",  // Поштомат
            "95dc212d-479c-4ffb-a8ab-8c1b9073d0bc"); // Поштомат ПриватБанку
    static final List<String> TYPES_BRANCH = List.of(
            "841339c7-591a-42e2-8233-7a0a00f0ed6f",  // Поштове відділення
            "9a68df70-0267-42a8-bb5c-37f427e36ee4"); // Вантажне відділення
    static final List<String> TYPES_POINT = List.of(
            "6f8c7162-4b72-4b0a-88e5-906948c6a92f"); // Пункт приймання-видачі (з обмеженнями)

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
        List<NovaPoshtaCity> cities = (q == null || withoutApostrophes(q).isBlank())
                ? cityRepository.findTop50ByOrderByNameAsc()
                : cityRepository.searchRanked(withoutApostrophes(q.trim().toLowerCase(java.util.Locale.ROOT)));
        return cities.stream()
                .map(c -> new NpCityDto(c.getRef(), c.getName(), c.getArea()))
                .toList();
    }

    @Transactional(readOnly = true)
    @Cacheable(value = "npWarehouses",
            key = "(#cityRef == null ? '' : #cityRef) + '|' + (#q == null ? '' : #q.trim().toLowerCase())")
    public List<NpWarehouseDto> searchWarehouses(String cityRef, String q) {
        return searchWarehouses(cityRef, q, null);
    }

    /**
     * {@code kind}: {@code warehouse} = branches and partner points (the «Відділення» tab),
     * {@code postomat} = parcel lockers, anything else = all.
     */
    public List<NpWarehouseDto> searchWarehouses(String cityRef, String q, String kind) {
        List<NpWarehouseDto> all = searchAll(cityRef, q);
        String k = kind == null ? "" : kind.trim().toLowerCase();
        return switch (k) {
            case "postomat" -> all.stream().filter(w -> "POSTOMAT".equals(w.category())).toList();
            case "warehouse", "branch" -> all.stream()
                    .filter(w -> "BRANCH".equals(w.category()) || "POINT".equals(w.category())).toList();
            default -> all;
        };
    }

    private List<NpWarehouseDto> searchAll(String cityRef, String q) {
        if (cityRef == null || cityRef.isBlank()) {
            return List.of();
        }
        List<NovaPoshtaWarehouse> warehouses = (q == null || q.isBlank())
                ? warehouseRepository.findByCityRefAndActiveTrueOrderByNumberAsc(cityRef)
                : warehouseRepository.findTop100ByCityRefAndActiveTrueAndDescriptionContainingIgnoreCaseOrderByNumberAsc(
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
        List<String> typeRefs = typeRefsFor(category);
        List<String> cats = categoriesFor(category);
        String like = (q == null || q.isBlank()) ? null : "%" + q.trim().toLowerCase() + "%";
        int cap = Math.max(1, Math.min(limit, 2000));
        return warehouseRepository
                .findInBox(minLat, maxLat, minLng, maxLng, cats == null, cats == null ? List.of("") : cats,
                        typeRefs == null ? List.of("") : typeRefs, like, PageRequest.of(0, cap))
                .stream()
                .map(NovaPoshtaService::toDto)
                .toList();
    }

    private static List<String> typeRefsFor(String category) {
        if (category == null) {
            return null;
        }
        return switch (category.trim().toLowerCase()) {
            case "postomat" -> TYPES_POSTOMAT;
            case "branch" -> TYPES_BRANCH;
            case "point" -> TYPES_POINT;
            default -> null; // "all" / unknown
        };
    }

    /** Categories of the map filter (postomat → POSTOMAT…); null = all. */
    private static List<String> categoriesFor(String category) {
        if (category == null) {
            return null;
        }
        return switch (category.trim().toLowerCase()) {
            case "postomat" -> List.of("POSTOMAT");
            case "branch" -> List.of("BRANCH");
            case "point" -> List.of("POINT");
            default -> null;
        };
    }

    /**
     * The category the directory sync stored (from Address.getWarehouseTypes, review «хардкод»);
     * the built-in refs only for a row synced before V66.
     */
    public static String categoryOf(NovaPoshtaWarehouse w) {
        return w.getCategory() != null && !w.getCategory().isBlank() ? w.getCategory() : categoryOf(w.getType());
    }

    /**
     * Category from a TypeOfWarehouse description («Поштомат», «Пункт приймання-видачі»,
     * «Вантажне відділення»…) — how the sync classifies a type it has not seen.
     */
    public static String categoryOfTypeName(String ref, String description) {
        String known = categoryOf(ref);
        if (!"OTHER".equals(known)) {
            return known;
        }
        String d = description == null ? "" : description.toLowerCase(java.util.Locale.ROOT);
        if (d.contains("поштомат") || d.contains("почтомат") || d.contains("parcel locker")) return "POSTOMAT";
        if (d.contains("пункт")) return "POINT";
        if (d.contains("відділення") || d.contains("отделение")) return "BRANCH";
        return "OTHER";
    }

    /** POSTOMAT | BRANCH | POINT | OTHER for a TypeOfWarehouse ref (built-in, the fallback). */
    public static String categoryOf(String typeRef) {
        if (typeRef == null) return "OTHER";
        if (TYPES_POSTOMAT.contains(typeRef)) return "POSTOMAT";
        if (TYPES_BRANCH.contains(typeRef)) return "BRANCH";
        if (TYPES_POINT.contains(typeRef)) return "POINT";
        return "OTHER";
    }

    private static NpWarehouseDto toDto(NovaPoshtaWarehouse w) {
        return new NpWarehouseDto(w.getRef(), w.getNumber(), w.getDescription(), w.getType(),
                categoryOf(w), w.getCityRef(), w.getCityName(), w.getLat(), w.getLng(), w.getMaxWeightKg());
    }

    /** «Ком'яти», «Ком’яти», «Комʼяти» and «Комяти» are the same village to the person typing. */
    static String withoutApostrophes(String q) {
        return q.replace("'", "").replace("’", "").replace("ʼ", "");
    }
}
