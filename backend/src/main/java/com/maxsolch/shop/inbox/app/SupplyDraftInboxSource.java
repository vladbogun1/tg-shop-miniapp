package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.inbox.app.InboxDtos.Item;
import com.maxsolch.shop.inbox.domain.InboxItemType;
import com.maxsolch.shop.inbox.domain.InboxMark;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSummary;
import com.maxsolch.shop.procurement.app.SupplyDrafts;
import com.maxsolch.shop.procurement.domain.SupplyDraft;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * «Внимание» → «Поставки ждут проверки»: one row per «Поставка с ИИ» draft that is ready to check or failed, shown to
 * whoever may open it (its author and the finance admins). The row leaves once the draft is accepted or deleted; a new
 * outcome (ready again after «Повторить», or a new failure) brings a snoozed row back — the version is the status and
 * the time it was reached, not the time of the last correction on the check screen.
 */
@Component
public class SupplyDraftInboxSource implements InboxExtraSource {

    /** A ready draft unchecked for longer than this is shown as overdue: the goods are likely on the way. */
    static final Duration OVERDUE = Duration.ofHours(24);

    private final SupplyDrafts drafts;

    public SupplyDraftInboxSource(SupplyDrafts drafts) {
        this.drafts = drafts;
    }

    @Override
    public List<Item> items(Instant now) {
        return drafts.awaitingAdmin().stream().map(d -> row(d, now)).toList();
    }

    static Item row(DraftSummary d, Instant now) {
        String id = String.valueOf(d.id());
        boolean failed = d.status() == SupplyDraft.Status.FAILED;
        String title = d.title() == null || d.title().isBlank() ? "Черновик поставки №" + d.id() : d.title();
        Instant since = !failed && d.readyAt() != null ? d.readyAt() : d.updatedAt();
        long wait = since == null ? 0 : Math.max(0, Duration.between(since, now).toMinutes());
        boolean overdue = !failed && since != null && Duration.between(since, now).compareTo(OVERDUE) >= 0;
        String version = d.status().name() + ":" + (since == null ? 0 : since.toEpochMilli());
        return new Item(InboxMark.key(InboxItemType.SUPPLY_DRAFT, id), InboxItemType.SUPPLY_DRAFT.name(), id, version,
                title, failed ? failedText(d) : readyText(d), null, null, d.status().name(), null, null, null, null,
                null, null, null, since, wait, overdue);
    }

    /** «Готово — проверьте: 12 строк, 3 новых товара, 2 без решения». */
    static String readyText(DraftSummary d) {
        StringBuilder s = new StringBuilder("Готово — проверьте: ").append(d.lines()).append(' ')
                .append(plural(d.lines(), "строка", "строки", "строк"));
        if (d.newProducts() > 0) {
            s.append(", ").append(d.newProducts()).append(' ')
                    .append(plural(d.newProducts(), "новый товар", "новых товара", "новых товаров"));
        }
        if (d.open() > 0) {
            s.append(", ").append(d.open()).append(" без решения");
        }
        return s.toString();
    }

    private static String failedText(DraftSummary d) {
        String why = d.failure() == null || d.failure().isBlank() ? "ИИ не справился. Нажмите «Повторить»." : d.failure();
        return shorten(why, 160);
    }

    static String plural(int n, String one, String few, String many) {
        int m100 = Math.abs(n) % 100;
        int m10 = m100 % 10;
        if (m100 >= 11 && m100 <= 14) {
            return many;
        }
        if (m10 == 1) {
            return one;
        }
        return m10 >= 2 && m10 <= 4 ? few : many;
    }

    private static String shorten(String s, int max) {
        String flat = s.replaceAll("\\s+", " ").trim();
        return flat.length() <= max ? flat : flat.substring(0, max - 1) + "…";
    }
}
