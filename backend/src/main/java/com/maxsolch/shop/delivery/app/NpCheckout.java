package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.infra.NovaPoshtaCityRepository;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Checkout helpers for the Nova Poshta courier and the price hint (public, like the directory): street search
 * through our server (the key stays here, answers cached a day, {@link DeliveryCaches#NP_STREETS}) and «≈ ціна
 * доставки». Only cities from our directory reach NP: a public endpoint must not relay any string.
 */
@Slf4j
@Service
public class NpCheckout {

    /** Lines of a cart considered for the hint; a longer list is not a real cart. */
    static final int MAX_LINES = 30;
    /** Ceiling for the amounts in the hint request (1 000 000 ₴). */
    static final long MAX_AMOUNT_MINOR = 100_000_000L;

    private final NovaPoshtaGateway api;
    private final NovaPoshtaPriceService prices;
    private final ParcelSizeService parcels;
    private final SettingsService settings;
    private final NovaPoshtaCityRepository cities;
    private final CacheManager caches;

    NpCheckout(NovaPoshtaGateway api, NovaPoshtaPriceService prices, ParcelSizeService parcels,
               SettingsService settings, NovaPoshtaCityRepository cities, CacheManager caches) {
        this.api = api;
        this.prices = prices;
        this.parcels = parcels;
        this.settings = settings;
        this.cities = cities;
        this.caches = caches;
    }

    /** A street of a city: {@code ref} goes into the order (npStreetRef), {@code name} is shown. */
    public record Street(String ref, String name, String type) {
    }

    /** {@code serviceType}: WAREHOUSE | POSTOMAT | DOORS. */
    public record EstimateRequest(String cityRef, String serviceType, List<ParcelSizeService.CartLine> items,
                                  Long totalMinor, Long payOnDeliveryMinor) {
    }

    /**
     * @param available false = no hint (switched off, no key, NP did not answer) — show nothing
     * @param deliveryMinor everything the customer pays NP on receipt besides the goods: delivery, boxes and, when
     *                      part of the order is paid on receipt, the transfer fee — one number
     * @param codFeeMinor the transfer fee included in {@code deliveryMinor} (0 = paid in full online)
     */
    public record EstimateResponse(boolean available, Long deliveryMinor, Long codFeeMinor) {
    }

    /** Which checkout tabs and hints are on (settings «Нова пошта»); the server checks them again on order. */
    public record CheckoutConfig(boolean postomatEnabled, boolean courierEnabled, boolean estimateEnabled) {
    }

    public CheckoutConfig config() {
        return new CheckoutConfig(settings.getBool(DeliverySettings.NP_POSTOMAT_ENABLED),
                settings.getBool(DeliverySettings.NP_COURIER_ENABLED),
                settings.getBool(DeliverySettings.NP_CHECKOUT_ESTIMATE));
    }

    private boolean knownCity(String cityRef) {
        return cityRef != null && !cityRef.isBlank() && cityRef.length() <= 64 && cities.existsById(cityRef.trim());
    }

    @SuppressWarnings("unchecked")
    public List<Street> streets(String cityRef, String q) {
        String query = q == null ? "" : q.trim();
        if (query.length() < 2 || !api.keyConfigured() || !knownCity(cityRef)) {
            return List.of();
        }
        String needle = query.length() > 60 ? query.substring(0, 60) : query;
        String key = cityRef.trim() + '|' + needle.toLowerCase(Locale.ROOT);
        Cache cache = caches.getCache(DeliveryCaches.NP_STREETS);
        List<Street> hit = cache == null ? null : cache.get(key, List.class);
        if (hit != null) {
            return hit;
        }
        try {
            ObjectNode p = api.props();
            p.put("CityRef", cityRef.trim());
            p.put("FindByString", needle);
            p.put("Page", "1");
            p.put("Limit", "25");
            JsonNode data = api.callQuick("Address", "getStreet", p);
            List<Street> out = new ArrayList<>();
            if (data != null && data.isArray()) {
                for (JsonNode n : data) {
                    String ref = NpJson.text(n, "Ref");
                    String name = NpJson.text(n, "Description");
                    if (ref != null && name != null) {
                        out.add(new Street(ref, name, NpJson.text(n, "StreetsType")));
                    }
                }
            }
            List<Street> result = List.copyOf(out);
            if (cache != null) {
                cache.put(key, result);
            }
            return result;
        } catch (RuntimeException e) {
            log.info("NP street search failed: {}", e.getMessage());
            return List.of();
        }
    }

    public EstimateResponse estimate(EstimateRequest body) {
        EstimateResponse none = new EstimateResponse(false, null, null);
        if (body == null || !settings.getBool(DeliverySettings.NP_CHECKOUT_ESTIMATE) || body.items() == null
                || body.items().isEmpty() || body.items().size() > MAX_LINES || !knownCity(body.cityRef())) {
            return none;
        }
        NpServiceType service;
        try {
            service = NpServiceType.parseStrict(body.serviceType());
        } catch (IllegalArgumentException e) {
            return none;
        }
        Parcel parcel = parcels.forCart(body.items());
        long total = body.totalMinor() == null ? 0 : Math.min(MAX_AMOUNT_MINOR, Math.max(0, body.totalMinor()));
        long cod = body.payOnDeliveryMinor() == null ? 0 : Math.min(total, Math.max(0, body.payOnDeliveryMinor()));
        return prices.estimate(body.cityRef().trim(), service == null ? NpServiceType.WAREHOUSE : service, parcel,
                        total, cod)
                .map(e -> new EstimateResponse(true, e.totalMinor(), e.codFeeMinor()))
                .orElse(none);
    }
}
