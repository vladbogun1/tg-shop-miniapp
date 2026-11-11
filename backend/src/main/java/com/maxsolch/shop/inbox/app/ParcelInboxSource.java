package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.delivery.app.ParcelIssues;
import com.maxsolch.shop.inbox.app.InboxDtos.Item;
import com.maxsolch.shop.inbox.domain.InboxItemType;
import com.maxsolch.shop.inbox.domain.InboxMark;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/** «Посылки»: Nova Poshta parcels that need a look; which and why is {@link ParcelIssues}. */
@Slf4j
@Component
public class ParcelInboxSource implements InboxExtraSource {

    private final ParcelIssues issues;

    public ParcelInboxSource(ParcelIssues issues) {
        this.issues = issues;
    }

    @Override
    public List<Item> items(Instant now) {
        try {
            return issues.current(now).stream().map(i -> row(i, now)).toList();
        } catch (RuntimeException e) {
            log.warn("Parcel inbox rows failed: {}", e.getMessage());
            return List.of();
        }
    }

    static Item row(ParcelIssues.ParcelIssue i, Instant now) {
        String name = i.customerName() == null || i.customerName().isBlank() ? "Без имени" : i.customerName().trim();
        long wait = i.since() == null ? 0 : Math.max(0, Duration.between(i.since(), now).toMinutes());
        return new Item(InboxMark.key(InboxItemType.PARCEL, i.shipmentId()), InboxItemType.PARCEL.name(),
                i.shipmentId(), i.stage() + ":" + i.kind(), name, i.text() + " · ТТН " + i.ttn(),
                i.orderId(), i.shortId(), i.orderStatus(), i.codMinor(),
                i.codMinor() == null ? null : "наложенный платёж",
                null, null, null, null, null, i.since(), wait, i.urgent());
    }
}
