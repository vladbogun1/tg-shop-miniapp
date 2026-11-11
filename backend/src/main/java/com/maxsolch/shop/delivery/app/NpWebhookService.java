package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.delivery.app.ShipmentStatusApplier.StatusUpdate;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.infra.DeliveryProperties;
import com.maxsolch.shop.delivery.infra.NpWebhookEventStore;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Optional;

/**
 * Webhooks of the new Nova Poshta REST (tracking-push): an accelerator on top of the poll of
 * {@link ShipmentTrackingService}, which stays the source of truth. NP signs nothing — the secret comes back in
 * {@code X-NP-Key} and is compared in constant time. Each message carries the whole history; the current status is
 * the entry with the latest date. Retries reuse the message UUID ({@code x-np-attempt: <uuid>.<try>}), which is
 * claimed in {@code np_webhook_events} first.
 */
@Slf4j
@Service
public class NpWebhookService {

    /** Claims are only for retries (minutes); kept a month. */
    static final Duration KEEP = Duration.ofDays(30);

    private final DeliveryProperties props;
    private final OrderShipmentRepository shipments;
    private final ShipmentStatusApplier applier;
    private final NpWebhookEventStore events;
    private final Clock clock;

    NpWebhookService(DeliveryProperties props, OrderShipmentRepository shipments, ShipmentStatusApplier applier,
                     NpWebhookEventStore events, Clock clock) {
        this.props = props;
        this.shipments = shipments;
        this.applier = applier;
        this.events = events;
        this.clock = clock;
    }

    public enum Outcome { APPLIED, DUPLICATE, UNKNOWN_TTN, IGNORED }

    /** One webhook body: the waybill and its newest status. */
    record Event(String ttn, StatusUpdate update) {
    }

    /** Blank secret = the endpoint is off (answers 404). */
    public boolean enabled() {
        String s = props.getNovaposhta().getWebhookSecret();
        return s != null && !s.isBlank();
    }

    public boolean authorized(String header) {
        return secretMatches(props.getNovaposhta().getWebhookSecret(), header);
    }

    static boolean secretMatches(String secret, String given) {
        if (secret == null || secret.isBlank() || given == null) {
            return false;
        }
        return MessageDigest.isEqual(secret.trim().getBytes(StandardCharsets.UTF_8),
                given.trim().getBytes(StandardCharsets.UTF_8));
    }

    /** {@code 8f14e45f-….2} → {@code 8f14e45f-…}; null when the header is missing. */
    static String eventId(String attempt) {
        if (attempt == null || attempt.isBlank()) {
            return null;
        }
        String s = attempt.trim();
        int dot = s.lastIndexOf('.');
        String id = dot > 0 ? s.substring(0, dot) : s;
        return id.length() > 64 ? id.substring(0, 64) : id;
    }

    /** Reads the body; empty when it has no number or no history. */
    static Optional<Event> parse(JsonNode body) {
        String ttn = NpJson.text(body, "number");
        JsonNode history = body == null ? null : body.get("history_tracking");
        if (ttn == null || ttn.isBlank() || history == null || !history.isArray() || history.isEmpty()) {
            return Optional.empty();
        }
        JsonNode latest = null;
        Instant latestAt = null;
        for (JsonNode h : history) {
            Instant at = instant(NpJson.text(h, "date"));
            // Undated entries lose to dated ones; among equal dates the later in the list wins.
            if (latest == null || (at != null && (latestAt == null || !at.isBefore(latestAt)))) {
                latest = h;
                latestAt = at;
            }
        }
        String code = NpJson.text(latest, "code");
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new Event(ttn.trim(), new StatusUpdate(code.trim(), NpJson.text(latest, "code_name"),
                NpJson.date(NpJson.text(body, "scheduled_delivery_date")), null, null, latestAt)));
    }

    static Instant instant(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw.trim());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /**
     * Handles one message. The event id is claimed before the status is applied and released when applying fails,
     * so NP's retry gets another chance; a replay of a handled message is a no-op.
     */
    public Outcome handle(String attempt, JsonNode body) {
        Optional<Event> ev = parse(body);
        if (ev.isEmpty()) {
            return Outcome.IGNORED;
        }
        String ttn = ev.get().ttn();
        List<OrderShipment> active = shipments.findByTtnAndActiveTrue(ttn);
        if (active.isEmpty()) {
            // Not ours (a «legal» subscription sees every waybill of the cabinet) or already cancelled.
            return Outcome.UNKNOWN_TTN;
        }
        String id = eventId(attempt);
        if (id != null && !events.claim(id, ttn)) {
            return Outcome.DUPLICATE;
        }
        try {
            for (OrderShipment s : active) {
                applier.apply(s.getId(), ev.get().update(), false);
            }
        } catch (RuntimeException e) {
            if (id != null) {
                events.release(id);
            }
            throw e;
        }
        log.info("NP webhook: waybill {} → code {}", ttn, ev.get().update().code());
        return Outcome.APPLIED;
    }

    public int purgeOld() {
        return events.purgeBefore(clock.instant().minus(KEEP));
    }
}
