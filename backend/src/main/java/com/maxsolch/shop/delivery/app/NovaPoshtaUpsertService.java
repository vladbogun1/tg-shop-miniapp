package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.domain.NovaPoshtaApi.ApiWarehouse;
import com.maxsolch.shop.delivery.domain.NovaPoshtaCity;
import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Writes one API page of the Nova Poshta directory in one transaction. A separate bean purely so
 * {@code @Transactional} is honoured (a call to a transactional method on {@code this} would go straight to the
 * implementation and get no transaction at all).
 */
@Service
public class NovaPoshtaUpsertService {

    private final NovaPoshtaCityRepository cityRepository;
    private final NovaPoshtaWarehouseRepository warehouseRepository;

    public NovaPoshtaUpsertService(NovaPoshtaCityRepository cityRepository,
                                   NovaPoshtaWarehouseRepository warehouseRepository) {
        this.cityRepository = cityRepository;
        this.warehouseRepository = warehouseRepository;
    }

    /** Same, without the types directory and the run stamp (tests). */
    @Transactional
    public int upsertPage(List<ApiWarehouse> warehouses, Map<String, NovaPoshtaCity> cities) {
        return upsertPage(warehouses, cities, Map.of(), null);
    }

    /** Closes every warehouse the run that started at {@code since} did not list. */
    @Transactional
    public int deactivateNotSeen(Instant since) {
        return warehouseRepository.deactivateNotSeenSince(since);
    }

    /**
     * Upserts a whole API page in one transaction. Returns how many warehouses were handled.
     *
     * @param types  TypeOfWarehouse ref → POSTOMAT / BRANCH / POINT / OTHER from getWarehouseTypes (may be empty)
     * @param seenAt start of this run, whole seconds; null = not stamped
     */
    @Transactional
    public int upsertPage(List<ApiWarehouse> warehouses, Map<String, NovaPoshtaCity> cities,
                          Map<String, String> types, Instant seenAt) {
        List<NovaPoshtaWarehouse> batch = new ArrayList<>(warehouses.size());
        for (ApiWarehouse w : warehouses) {
            String ref = w.ref();
            if (ref == null || ref.isBlank()) {
                continue;
            }
            String cityRef = w.cityRef();
            String cityName = w.cityName();

            NovaPoshtaWarehouse wh = warehouseRepository.findById(ref).orElseGet(() -> {
                NovaPoshtaWarehouse n = new NovaPoshtaWarehouse();
                n.setRef(ref);
                return n;
            });
            wh.setCityRef(cityRef == null ? "" : cityRef);
            wh.setCityName(cityName);
            wh.setNumber(w.number());
            wh.setDescription(w.description());
            wh.setType(w.type());
            applyDirectoryState(wh, w, types, seenAt);
            Double lat = parseDouble(w.latitude());
            Double lng = parseDouble(w.longitude());
            // The NP directory has branches with the pair swapped (Kharkiv's postomat 23338
            // came as 36.37 / 49.95 - northern Iran). Swapped, it lands in Ukraine: store it so.
            if (lat != null && lng != null && !inUkraine(lat, lng) && inUkraine(lng, lat)) {
                Double tmp = lat;
                lat = lng;
                lng = tmp;
            }
            wh.setLat(lat);
            wh.setLng(lng);
            batch.add(wh);

            if (cityRef != null && !cityRef.isBlank() && !cities.containsKey(cityRef)) {
                NovaPoshtaCity city = cityRepository.findById(cityRef).orElseGet(() -> {
                    NovaPoshtaCity c = new NovaPoshtaCity();
                    c.setRef(cityRef);
                    return c;
                });
                city.setName(cityName == null ? cityRef : cityName);
                city.setArea(w.areaName());
                cities.put(cityRef, city);
            }
        }
        warehouseRepository.saveAll(batch);
        return batch.size();
    }

    @Transactional
    public void saveCities(Iterable<NovaPoshtaCity> cities) {
        cityRepository.saveAll(cities);
    }

    private static void applyDirectoryState(NovaPoshtaWarehouse wh, ApiWarehouse w, Map<String, String> types,
                                            Instant seenAt) {
        wh.setCategory(category(w.type(), w.npCategory(), types));
        String status = w.status();
        wh.setStatus(status == null ? null : status.length() > 32 ? status.substring(0, 32) : status);
        wh.setActive(working(status));
        if (seenAt != null) {
            wh.setSeenAt(seenAt);
        }
        wh.setMaxLengthMm(w.maxLengthMm());
        wh.setMaxWidthMm(w.maxWidthMm());
        wh.setMaxHeightMm(w.maxHeightMm());
        wh.setMaxWeightKg(w.maxWeightKg());
    }

    /** From getWarehouseTypes when known, then the built-in refs, then NP's own CategoryOfWarehouse. */
    static String category(String typeRef, String npCategory, Map<String, String> types) {
        String fromTypes = typeRef == null ? null : types.get(typeRef);
        if (fromTypes != null && !"OTHER".equals(fromTypes)) {
            return fromTypes;
        }
        String builtIn = NovaPoshtaService.categoryOf(typeRef);
        if (!"OTHER".equals(builtIn)) {
            return builtIn;
        }
        String c = npCategory == null ? "" : npCategory.trim().toLowerCase(Locale.ROOT);
        return switch (c) {
            case "postomat" -> "POSTOMAT";
            case "branch" -> "BRANCH";
            case "" -> "OTHER";
            default -> "POINT"; // Store, DropOff… — partner points
        };
    }

    /** «Working» (or no status at all) = open; NotWorking / Closed / anything else = not offered. */
    static boolean working(String status) {
        return status == null || status.isBlank() || "working".equalsIgnoreCase(status.trim());
    }

    /** Ukraine with a margin. */
    static boolean inUkraine(double lat, double lng) {
        return lat >= 44 && lat <= 52.6 && lng >= 22 && lng <= 40.5;
    }

    private static Double parseDouble(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
