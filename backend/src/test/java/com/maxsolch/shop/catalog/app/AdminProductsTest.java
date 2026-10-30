package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The audit entry and the site refresh that go with the admin's product buttons. */
class AdminProductsTest {

    AdminProductService service = mock(AdminProductService.class);
    AdminAuditService audit = mock(AdminAuditService.class);
    SiteRevalidator revalidator = mock(SiteRevalidator.class);
    AdminProducts admin = new AdminProducts(service, audit, revalidator);

    private static AdminProductDto product(boolean active, String condition) {
        AdminProductDto p = mock(AdminProductDto.class);
        when(p.id()).thenReturn("p1");
        when(p.title()).thenReturn("Мышь");
        when(p.slug()).thenReturn("mouse");
        when(p.active()).thenReturn(active);
        when(p.condition()).thenReturn(condition);
        return p;
    }

    @Test
    void hidingIsAuditedAndRebuildsTheProductPages() {
        AdminProductDto saved = product(false, "NEW");
        when(service.setActive("p1", false, false)).thenReturn(saved);

        admin.setActive("p1", false, false);

        verify(audit).record("PRODUCT_ACTIVE", "PRODUCT", "p1", "скрыт");
        verify(revalidator).productChanged("mouse", null, Set.of());
    }

    @Test
    void aMarkdownProductAlsoRebuildsTheMarkdownCollection() {
        AdminProductDto saved = product(true, "MARKDOWN");
        when(service.setArchived("p1", true)).thenReturn(saved);

        admin.setArchived("p1", true);

        verify(audit).record("PRODUCT_ARCHIVE", "PRODUCT", "p1", "в архив");
        verify(revalidator).productChanged("mouse", null, Set.of(MarkdownCollection.SLUG));
    }

    @Test
    void publishingWithForceIsMarkedInTheJournal() {
        AdminProductDto before = product(false, "NEW");
        AdminProductDto after = product(true, "NEW");
        when(service.get("p1")).thenReturn(before);
        when(service.update(eq("p1"), any(), eq(true))).thenReturn(after);

        admin.update("p1", mock(ProductUpsertRequest.class), true);

        verify(audit).record(eq("PRODUCT_UPDATE"), eq("PRODUCT"), eq("p1"), contains("выложен без оформления"));
    }

    @Test
    void aFailedSaveLeavesNoJournalEntryAndNoRebuild() {
        when(service.setActive("p1", true, false)).thenThrow(new DomainException.NotFound("нет", null));

        assertThatThrownBy(() -> admin.setActive("p1", true, false)).isInstanceOf(DomainException.NotFound.class);

        verify(audit, never()).record(anyString(), anyString(), anyString(), any());
        verify(revalidator, never()).productChanged(any(), any(), any());
    }
}
