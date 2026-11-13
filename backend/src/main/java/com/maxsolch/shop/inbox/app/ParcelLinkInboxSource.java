package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.delivery.app.LinkedParcelIssues;
import com.maxsolch.shop.inbox.app.InboxDtos.Item;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

/** «Посылки» rows of the waybills NP made on the basis of ours (returns, redirects); which is {@link LinkedParcelIssues}. */
@Slf4j
@Component
public class ParcelLinkInboxSource implements InboxExtraSource {

    private final LinkedParcelIssues issues;

    public ParcelLinkInboxSource(LinkedParcelIssues issues) {
        this.issues = issues;
    }

    @Override
    public List<Item> items(Instant now) {
        try {
            return issues.current(now).stream().map(i -> ParcelInboxSource.row(i, now)).toList();
        } catch (RuntimeException e) {
            log.warn("Linked parcel inbox rows failed: {}", e.getMessage());
            return List.of();
        }
    }
}
