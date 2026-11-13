package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.ParcelLink;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.domain.ShipmentStatusMapper;
import com.maxsolch.shop.delivery.infra.ParcelLinkRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Asks NP about the linked waybills that are not final yet (every 30 min with the parcels, {@link ShipmentJobs}):
 * {@code getStatusDocuments} in batches of 100 with the customer's phone from the order — 13.11.2026 the return
 * waybills answered in full with it. Followed for {@link #FOLLOW} after they were found.
 */
@Slf4j
@Service
public class LinkedParcelPolling {

    static final Duration FOLLOW = Duration.ofDays(30);

    private final ParcelLinkRepository links;
    private final LinkedParcels linked;
    private final ShipmentOrders orders;
    private final NovaPoshtaGateway api;
    private final SettingsService settings;
    private final Clock clock;

    LinkedParcelPolling(ParcelLinkRepository links, LinkedParcels linked, ShipmentOrders orders, NovaPoshtaGateway api,
                        SettingsService settings, Clock clock) {
        this.links = links;
        this.linked = linked;
        this.orders = orders;
        this.api = api;
        this.settings = settings;
        this.clock = clock;
    }

    /** @return how many linked waybills were asked about */
    public int pollDue() {
        if (!settings.getBool(DeliverySettings.NP_TRACKING) || !api.keyConfigured()) {
            return 0;
        }
        Instant now = clock.instant();
        List<ParcelLink> due = links.findDueForPoll(
                List.of(ShipmentStage.RECEIVED.name(), ShipmentStage.CANCELLED.name()),
                now.minus(FOLLOW), now.minus(ShipmentTrackingService.MIN_INTERVAL), PageRequest.of(0, 300));
        for (int i = 0; i < due.size(); i += ShipmentTrackingService.BATCH) {
            poll(due.subList(i, Math.min(due.size(), i + ShipmentTrackingService.BATCH)));
        }
        return due.size();
    }

    void poll(List<ParcelLink> all) {
        // Demo numbers (NP_DRY_RUN) do not exist at NP: stamped, never asked about.
        List<ParcelLink> batch = all.stream().filter(l -> !DryRunLabels.isDry(l.getTtn())).toList();
        if (batch.size() < all.size()) {
            linked.stamp(all.stream().filter(l -> DryRunLabels.isDry(l.getTtn())).map(ParcelLink::getId).toList(), null);
        }
        if (batch.isEmpty()) {
            return;
        }
        JsonNode data;
        try {
            data = api.call("TrackingDocument", "getStatusDocuments", request(batch));
        } catch (RuntimeException e) {
            log.warn("NP poll of {} linked waybills failed: {}", batch.size(), e.getMessage());
            linked.stamp(batch.stream().map(ParcelLink::getId).toList(), e.getMessage() == null ? "" : e.getMessage());
            return;
        }
        Map<String, JsonNode> byTtn = new HashMap<>();
        if (data != null && data.isArray()) {
            data.forEach(n -> {
                String number = NpJson.trimmed(n, "Number");
                if (number != null) {
                    byTtn.put(number, n);
                }
            });
        }
        Map<Integer, ShipmentStage> overrides =
                ShipmentStatusMapper.parseOverrides(settings.getString(DeliverySettings.NP_STATUS_OVERRIDES));
        for (ParcelLink l : batch) {
            JsonNode n = byTtn.get(l.getTtn());
            try {
                if (n == null) {
                    linked.stamp(List.of(l.getId()), null);
                } else {
                    String code = NpJson.text(n, "StatusCode");
                    linked.apply(l.getId(), ShipmentStatusMapper.stageOf(code, overrides), code,
                            ShipmentTrackingService.statusText(n), storageFrom(n));
                }
            } catch (RuntimeException e) {
                log.warn("NP status of linked waybill {} not applied: {}", l.getTtn(), e.getMessage());
            }
        }
    }

    private ObjectNode request(List<ParcelLink> batch) {
        Map<String, String> phones = new HashMap<>();
        orders.findAll(batch.stream().map(ParcelLink::getOrderId).toList())
                .forEach(o -> phones.put(UuidUtil.toString(o.id()), phone(o)));
        ArrayNode docs = api.array();
        for (ParcelLink l : batch) {
            ObjectNode d = docs.addObject();
            d.put("DocumentNumber", l.getTtn());
            d.put("Phone", phones.getOrDefault(UuidUtil.toString(l.getOrderId()), ""));
        }
        ObjectNode props = api.props();
        props.set("Documents", docs);
        return props;
    }

    private static String phone(ShippingOrder o) {
        String p = NovaPoshtaSenderService.normalizePhone(o.phone());
        return p == null ? "" : p;
    }

    static LocalDate storageFrom(JsonNode n) {
        LocalDate d = ShipmentTrackingService.date(NpJson.text(n, "DateFirstDayStorage"));
        return d != null ? d : ShipmentTrackingService.date(NpJson.text(n, "DatePayedKeeping"));
    }
}
