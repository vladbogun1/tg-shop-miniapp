package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.inbox.app.InboxDtos.Item;
import com.maxsolch.shop.inbox.domain.InboxItemType;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.DraftSummary;
import com.maxsolch.shop.procurement.domain.SupplyDraft.Status;
import com.maxsolch.shop.procurement.domain.SupplyDraft.Step;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** «Внимание» → «Поставки ждут проверки» rows. */
class SupplyDraftInboxSourceTest {

    private static final Instant NOW = Instant.parse("2026-11-08T12:00:00Z");

    private static DraftSummary draft(Status status, String title, String failure, int lines, int fresh, int open,
                                      Instant ready, Instant updated) {
        return new DraftSummary(12L, status, Step.DONE, title, failure, lines, fresh, open, NOW.minus(Duration.ofDays(2)),
                updated, ready);
    }

    @Test
    void readyDraftWaitsForTheCheck() {
        Instant ready = NOW.minus(Duration.ofHours(30));
        Item it = SupplyDraftInboxSource.row(draft(Status.READY, "WESTLAB 08.11", null, 12, 3, 2, ready,
                NOW.minus(Duration.ofMinutes(5))), NOW);

        assertThat(it.type()).isEqualTo(InboxItemType.SUPPLY_DRAFT.name());
        assertThat(it.key()).isEqualTo("SUPPLY_DRAFT:12");
        assertThat(it.entityId()).isEqualTo("12");
        assertThat(it.title()).isEqualTo("WESTLAB 08.11");
        assertThat(it.subtitle()).isEqualTo("Готово — проверьте: 12 строк, 3 новых товара, 2 без решения");
        // corrections on the check screen move updatedAt, not the version: a snoozed row stays snoozed
        assertThat(it.version()).isEqualTo("READY:" + ready.toEpochMilli());
        assertThat(it.since()).isEqualTo(ready);
        assertThat(it.waitMinutes()).isEqualTo(30 * 60);
        assertThat(it.overdue()).isTrue();
        assertThat(it.orderId()).isNull();
    }

    @Test
    void failedDraftSaysWhyAndIsNeverOverdue() {
        Instant failedAt = NOW.minus(Duration.ofDays(3));
        Item it = SupplyDraftInboxSource.row(draft(Status.FAILED, null, "Накладную не удалось прочитать:\nстрок не найдено",
                0, 0, 0, null, failedAt), NOW);

        assertThat(it.title()).isEqualTo("Черновик поставки №12");
        assertThat(it.subtitle()).isEqualTo("Накладную не удалось прочитать: строк не найдено");
        assertThat(it.version()).isEqualTo("FAILED:" + failedAt.toEpochMilli());
        assertThat(it.overdue()).isFalse();
    }

    @Test
    void readyTextOmitsZerosAndAgreesWithTheNumber() {
        assertThat(SupplyDraftInboxSource.readyText(draft(Status.READY, "x", null, 1, 0, 0, NOW, NOW)))
                .isEqualTo("Готово — проверьте: 1 строка");
        assertThat(SupplyDraftInboxSource.readyText(draft(Status.READY, "x", null, 22, 1, 0, NOW, NOW)))
                .isEqualTo("Готово — проверьте: 22 строки, 1 новый товар");
        assertThat(SupplyDraftInboxSource.plural(11, "a", "b", "c")).isEqualTo("c");
        assertThat(SupplyDraftInboxSource.plural(5, "a", "b", "c")).isEqualTo("c");
    }
}
