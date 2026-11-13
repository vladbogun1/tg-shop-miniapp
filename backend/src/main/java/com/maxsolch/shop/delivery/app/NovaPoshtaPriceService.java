package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaException;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.WaybillRequest;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * «≈105 ₴ за тарифом НП»: {@code InternetDocument.getDocumentPrice} from the shop's main sending branch, cached by
 * city + service + weight/size/value buckets (12 h, {@link DeliveryCaches#NP_PRICE}) so the checkout does not ask
 * NP on every keystroke. One quick attempt (5 s); when NP does not answer, the hint is skipped for everybody for
 * 60 s ({@link DeliveryCaches#NP_DOWN}). The money-transfer fee of «Контроль оплати» is not in NP's answer: it is
 * added from the settings ({@code novaposhta.codFeePct} % + {@code novaposhta.codFeeFixedUah} ₴) when part of the
 * order is paid on receipt; the branch's box price is added from the packing.
 */
@Slf4j
@Service
public class NovaPoshtaPriceService {

    private static final String DOWN_KEY = "np";

    private final NovaPoshtaGateway api;
    private final NovaPoshtaSenderService sender;
    private final SettingsService settings;
    private final CacheManager caches;

    public NovaPoshtaPriceService(NovaPoshtaGateway api, NovaPoshtaSenderService sender, SettingsService settings,
                                  CacheManager caches) {
        this.api = api;
        this.sender = sender;
        this.settings = settings;
        this.caches = caches;
    }

    /**
     * @param deliveryMinor NP delivery price by the public tariff plus what the branch charges for the boxes
     * @param codFeeMinor   «Контроль оплати» fee for the money NP collects on receipt (0 when nothing is collected)
     */
    public record Estimate(long deliveryMinor, Long codFeeMinor) {
        /** What the customer pays NP on receipt besides the goods: one number for the checkout. */
        public long totalMinor() {
            return deliveryMinor + (codFeeMinor == null ? 0 : codFeeMinor);
        }
    }

    /** «Контроль оплати»: pct % of the collected amount + a fixed part, in kopecks; 0 if nothing is collected. */
    public Long codFee(long codMinor) {
        if (codMinor <= 0) {
            return 0L;
        }
        long pct = Math.max(0, settings.getInt(DeliverySettings.NP_COD_FEE_PCT));
        long fixed = Math.max(0, settings.getInt(DeliverySettings.NP_COD_FEE_FIXED)) * 100L;
        return Math.round(codMinor * pct / 100.0) + fixed;
    }

    /**
     * Delivery price to {@code cityRef}; empty when the key or the sender is not set up or NP did not answer (the
     * checkout then simply shows no estimate).
     */
    public Optional<Estimate> estimate(String cityRef, NpServiceType service, Parcel parcel, long declaredMinor,
                                       long codMinor) {
        if (cityRef == null || cityRef.isBlank() || !api.keyConfigured()) {
            return Optional.empty();
        }
        NovaPoshtaSenderService.SenderConfig cfg = sender.get()
                .filter(NovaPoshtaSenderService.SenderConfig::complete).orElse(null);
        String fromCity = cfg == null ? null
                : cfg.warehouse(null).map(NovaPoshtaSenderService.SenderWarehouse::cityRef).orElse(null);
        if (fromCity == null) {
            return Optional.empty();
        }
        // Buckets: 0.5 kg per seat, whole cm; the declared value to the hryvnia (its 0.5 % fee is part of the
        // price, a 500 ₴ bucket overstated it by up to 2.5 ₴ — test waybill 2026-10-23).
        List<Parcel.Seat> seats = parcel.seats().stream()
                .map(s -> new Parcel.Seat((int) (Math.ceil(Math.max(100, s.weightG()) / 500.0) * 500),
                        s.lengthMm(), s.widthMm(), s.heightMm(), s.box()))
                .toList();
        Parcel bucketed = Parcel.of(seats, parcel.source(), parcel.packMinor()).withDocuments(parcel.documents());
        long declared = (long) (Math.ceil(Math.max(declaredMinor, 100) / 100.0) * 100);
        StringBuilder key = new StringBuilder(fromCity).append('|').append(cityRef).append('|').append(service)
                .append('|').append(declared).append('|').append(bucketed.cargoType());
        for (Parcel.Seat s : seats) {
            key.append('|').append(s.weightG()).append(':').append(WaybillRequest.cm(s.lengthMm())).append('x')
                    .append(WaybillRequest.cm(s.widthMm())).append('x').append(WaybillRequest.cm(s.heightMm()));
        }
        return price(key.toString(), cfg, fromCity, cityRef, service, bucketed, declared)
                .map(e -> new Estimate(e + Math.max(0, parcel.packMinor()), codFee(codMinor)));
    }

    /** The NP price of a bucketed parcel, kopecks, cached; without the branch's box price. */
    private Optional<Long> price(String key, NovaPoshtaSenderService.SenderConfig cfg, String fromCity,
                                 String cityRef, NpServiceType service, Parcel bucketed, long declared) {
        Cache cache = caches.getCache(DeliveryCaches.NP_PRICE);
        Long hit = cache == null ? null : cache.get(key, Long.class);
        if (hit != null) {
            return Optional.of(hit);
        }
        if (npDown()) {
            // NP failed a moment ago: do not make every customer wait for the same timeout.
            return Optional.empty();
        }
        try {
            ObjectNode p = api.props();
            p.put("Sender", cfg.counterpartyRef());
            p.put("CitySender", fromCity);
            p.put("CityRecipient", cityRef);
            p.put("ServiceType", service.npServiceType());
            p.put("CargoType", WaybillRequest.cargoType(bucketed, service == NpServiceType.POSTOMAT));
            p.put("SeatsAmount", String.valueOf(bucketed.seats().size()));
            p.put("Weight", WaybillRequest.weight(bucketed));
            p.put("Cost", WaybillRequest.uahCeil(declared));
            // Without OptionsSeat NP prices by the total weight only (audit: 148.5 instead of 193.5);
            // «Документи» are priced by weight on purpose.
            if (!bucketed.documents()) {
                WaybillRequest.seats(p.putArray("OptionsSeat"), bucketed);
            }
            JsonNode data = api.callQuick("InternetDocument", "getDocumentPrice", p);
            JsonNode first = data.isArray() && !data.isEmpty() ? data.get(0) : null;
            if (first == null || !first.hasNonNull("Cost")) {
                return Optional.empty();
            }
            long minor = Math.round(first.get("Cost").asDouble() * 100);
            if (cache != null) {
                cache.put(key, minor);
            }
            return Optional.of(minor);
        } catch (RuntimeException e) {
            log.info("NP price estimate failed: {}", e.getMessage());
            // Only an unreachable NP pauses the hint for everyone; its «success: false» about one city (a bad
            // ref, a service not offered there) must not switch the hint off for all.
            if (!(e instanceof NovaPoshtaException n) || n.isUnavailable()) {
                markDown();
            }
            return Optional.empty();
        }
    }

    /** NP did not answer a quick hint less than a minute ago. */
    boolean npDown() {
        Cache down = caches.getCache(DeliveryCaches.NP_DOWN);
        return down != null && down.get(DOWN_KEY) != null;
    }

    void markDown() {
        Cache down = caches.getCache(DeliveryCaches.NP_DOWN);
        if (down != null) {
            down.put(DOWN_KEY, Boolean.TRUE);
        }
    }
}
