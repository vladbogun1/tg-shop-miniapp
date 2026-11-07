package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.domain.SubjectEditors.Edit;
import com.maxsolch.shop.audit.app.AdminAuditQueries;
import com.maxsolch.shop.audit.domain.AdminAuditEntry;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.CatalogDtos.CardsImportRequest;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Who edited a card after an AI task started: from the product's audit, only the actions that change the card, one
 * line per person with the last change; and a one-card import is journaled with its product so it counts.
 */
class ProductCardEditorsTest {

    private static final String ID = "0b6c9d2e-1111-4a8b-9c3d-2e4f5a6b7c8d";
    private static final Instant SINCE = Instant.parse("2026-11-07T12:00:00Z");

    private final AdminAuditQueries audit = mock(AdminAuditQueries.class);
    private final ProductCardEditors editors = new ProductCardEditors(audit);

    @Test
    void onePersonPerLineNewestFirstOnlyCardActions() {
        when(audit.search(null, "PRODUCT", ID, null, SINCE, null, 0, 100)).thenReturn(List.of(
                entry("Иван", "PRODUCT_UPDATE", "2026-11-07T12:20:00Z"),
                entry("Анна", "PRODUCT_ACTIVE", "2026-11-07T12:15:00Z"),
                entry("Анна", "CARDS_IMPORT", "2026-11-07T12:10:00Z"),
                entry("Иван", "CARD_ACCEPT", "2026-11-07T12:05:00Z"),
                entry(null, "PRODUCT_UPDATE", "2026-11-07T12:01:00Z")));

        List<Edit> out = editors.since(ID, SINCE);

        assertThat(out).containsExactly(new Edit("Иван", Instant.parse("2026-11-07T12:20:00Z")),
                new Edit("Анна", Instant.parse("2026-11-07T12:10:00Z")));
    }

    @Test
    void nobodyWhenTheJournalIsQuiet() {
        when(audit.search(eq(null), eq("PRODUCT"), eq(ID), eq(null), eq(SINCE), eq(null), eq(0), eq(100)))
                .thenReturn(List.of());

        assertThat(editors.since(ID, SINCE)).isEmpty();
    }

    @Test
    void aOneCardImportIsJournaledWithItsProduct() {
        assertThat(AdminCards.onlyProduct(request(ID))).isEqualTo(ID);
        assertThat(AdminCards.onlyProduct(request(ID, ID))).isEqualTo(ID);
        assertThat(AdminCards.onlyProduct(request(ID, "1b6c9d2e-1111-4a8b-9c3d-2e4f5a6b7c8d"))).isNull();
        assertThat(AdminCards.onlyProduct(new CardsImportRequest(null, false))).isNull();
        assertThat(AdminCards.onlyProduct(null)).isNull();
    }

    private static CardsImportRequest request(String... ids) {
        return new CardsImportRequest(Arrays.stream(ids).map(ProductCardEditorsTest::item).toList(), false);
    }

    private static CardImportItem item(String id) {
        CardImportItem empty = mock(CardImportItem.class);
        when(empty.productId()).thenReturn(id);
        return empty;
    }

    private static AdminAuditEntry entry(String who, String action, String at) {
        AdminAuditEntry e = new AdminAuditEntry();
        e.setAdminName(who);
        e.setAction(action);
        e.setCreatedAt(Instant.parse(at));
        return e;
    }
}
