package com.maxsolch.shop.delivery.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.maxsolch.shop.delivery.domain.NpJson;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.ParcelLink;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.ParcelLinkRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * The waybills NP makes on the basis of ours (V103): found in the poll answer of our parcel, then tracked by
 * {@link LinkedParcelPolling}. A linked waybill NEVER moves the order (no {@code markShipped} / {@code markDelivered}):
 * its «отримано» is the shop picking up a return, or the customer getting a redirected parcel — both are the admin's
 * call. What it does: the stage and NP's text for the order's «Посылки», one Telegram line to the sellers per stage
 * that needs them, rows on «Внимание» ({@link LinkedParcelIssues}).
 */
@Slf4j
@Service
public class LinkedParcels {

    private final ParcelLinkRepository links;
    private final LinkedParcelNotifier notifier;
    private final TransactionTemplate tx;
    private final Clock clock;

    LinkedParcels(ParcelLinkRepository links, LinkedParcelNotifier notifier, TransactionTemplate tx, Clock clock) {
        this.links = links;
        this.notifier = notifier;
        this.tx = tx;
        this.clock = clock;
    }

    /** What one getStatusDocuments row of our parcel says was made on its basis. */
    record Spotted(ParcelLink.Kind kind, String ttn) {
    }

    /**
     * {@code LastCreatedOnTheBasisNumber} with its type (CargoReturn / Redirecting) and {@code LightReturnNumber}: the
     * numbers worth following; our own number, demo numbers and blanks are not.
     */
    static List<Spotted> found(OrderShipment s, JsonNode n) {
        List<Spotted> out = new ArrayList<>(2);
        ParcelLink.Kind basis = ParcelLink.Kind.ofBasisType(NpJson.trimmed(n, "LastCreatedOnTheBasisDocumentType"));
        add(out, s, basis, NpJson.trimmed(n, "LastCreatedOnTheBasisNumber"));
        add(out, s, ParcelLink.Kind.LIGHT_RETURN, NpJson.trimmed(n, "LightReturnNumber"));
        return out;
    }

    private static void add(List<Spotted> out, OrderShipment s, ParcelLink.Kind kind, String number) {
        if (kind == null || number == null || number.isBlank() || "0".equals(number) || number.equals(s.getTtn())
                || DryRunLabels.isDry(number)) {
            return;
        }
        out.add(new Spotted(kind, number));
    }

    /** Starts following what NP made on the basis of our parcel {@code s} (the poll answer {@code n}). */
    public void discover(OrderShipment s, JsonNode n) {
        for (Spotted f : found(s, n)) {
            if (links.findByTtn(f.ttn()).isPresent()) {
                continue;
            }
            ParcelLink saved = new ParcelLink(s.getOrderId(), s.getId(), f.kind(), f.ttn());
            try {
                tx.executeWithoutResult(t -> links.save(saved));
            } catch (DataIntegrityViolationException e) {
                continue; // the webhook or another poll saved it first
            }
            log.info("NP: {} waybill {} linked to {}", f.kind(), f.ttn(), s.getTtn());
            if (f.kind() == ParcelLink.Kind.LIGHT_RETURN) {
                notifier.lightReturnSent(saved);
            }
        }
    }

    /**
     * NP's status of a linked waybill ({@code next} = its stage, mapped with the admin's overrides); the sellers hear
     * about a stage that needs them once.
     */
    public void apply(byte[] linkId, ShipmentStage next, String code, String text, LocalDate storageFrom) {
        ParcelLink told = tx.execute(t -> links.findById(linkId).map(l -> {
            ShipmentStage reached = l.report(next, code, text, storageFrom, clock.instant());
            return reached != null && LinkedParcelNotifier.worthTelling(l.kindEnum(), reached)
                    && l.claimNotice(reached) ? l : null;
        }).orElse(null));
        if (told != null) {
            notifier.stageReached(told);
        }
    }

    /** NP did not answer about these: stamped, so they leave the head of the queue. */
    public void stamp(List<byte[]> ids, String error) {
        tx.executeWithoutResult(t -> ids.forEach(id -> links.findById(id).ifPresent(l -> {
            l.setLastPolledAt(clock.instant());
            if (error != null) {
                l.setPollError(NpJson.cut(error, 500));
            }
        })));
    }

    /** The order card: the linked waybills of one order, oldest first; a malformed id has none. */
    public List<LinkedParcelView> views(String orderId) {
        byte[] id;
        try {
            id = UuidUtil.toBytes(orderId);
        } catch (IllegalArgumentException e) {
            return List.of();
        }
        return links.findByOrderIdOrderByCreatedAtAsc(id).stream().map(LinkedParcelView::of).toList();
    }
}
