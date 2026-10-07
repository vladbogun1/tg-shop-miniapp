package com.maxsolch.shop.support;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.inbox.InboxDtos.Item;
import com.maxsolch.shop.inbox.InboxExtraSource;
import com.maxsolch.shop.inbox.InboxItemType;
import com.maxsolch.shop.inbox.InboxMark;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * «Внимание» → «Вопросы в поддержку»: one row per open thread whose customer waits for an answer.
 * The row leaves once an admin answers or closes the thread; a newer customer message brings a
 * snoozed row back (the version is the time of the last message).
 */
@Component
public class SupportInboxSource implements InboxExtraSource {

    /** A customer waiting longer than this is shown as overdue (same as the order chat). */
    static final Duration OVERDUE = Duration.ofHours(2);
    private static final int LIMIT = 200;

    private final SupportService support;

    public SupportInboxSource(SupportService support) {
        this.support = support;
    }

    @Override
    public List<Item> items(Instant now) {
        return support.awaiting(LIMIT).stream().map(t -> row(t, now)).toList();
    }

    static Item row(SupportThread t, Instant now) {
        String id = UuidUtil.toString(t.getId());
        String name = t.getCustomerName() == null || t.getCustomerName().isBlank() ? "Покупатель" : t.getCustomerName();
        String about = t.getProductTitle() != null && !t.getProductTitle().isBlank()
                ? t.getProductTitle() : "Общий вопрос";
        String preview = t.getLastPreview() == null || t.getLastPreview().isBlank() ? "Вложение" : t.getLastPreview();
        String subtitle = shorten(about + " · " + preview, 160);
        Instant since = t.getAwaitingSince();
        long wait = since == null ? 0 : Math.max(0, Duration.between(since, now).toMinutes());
        boolean overdue = since != null && Duration.between(since, now).compareTo(OVERDUE) >= 0;
        String version = t.getLastMessageAt() == null ? "0" : String.valueOf(t.getLastMessageAt().toEpochMilli());
        return new Item(InboxMark.key(InboxItemType.SUPPORT, id), InboxItemType.SUPPORT.name(), id, version,
                name, subtitle, null, null, t.getStatus().name(), null, null,
                t.getProductId() == null ? null : UuidUtil.toString(t.getProductId()), null, null, null,
                Math.max(1, t.getAdminUnread()), since, wait, overdue);
    }

    private static String shorten(String s, int max) {
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= max ? flat : flat.substring(0, max - 1) + "…";
    }
}
