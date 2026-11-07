package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.app.AiApplySteps;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.function.Supplier;

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
    ProductQuickEdit quick = mock(ProductQuickEdit.class);
    AdminAuditService audit = mock(AdminAuditService.class);
    SiteRevalidator revalidator = mock(SiteRevalidator.class);
    AiApplySteps steps = stepsRunningInPlace();
    AdminProducts admin = new AdminProducts(service, quick, audit, revalidator, steps);

    /** Without an application id the step simply runs. */
    private static AiApplySteps stepsRunningInPlace() {
        AiApplySteps steps = mock(AiApplySteps.class);
        when(steps.within(any(), any(), any(), any())).thenAnswer(inv -> inv.<Supplier<?>>getArgument(3).get());
        return steps;
    }

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
    void quickEditIsAuditedAsSuchAndRebuildsTheProductPages() {
        AdminProductDto before = product(true, "NEW");
        AdminProductDto after = product(true, "NEW");
        ProductQuickEditRequest req = new ProductQuickEditRequest(5_000L, null, null, null, null, null);
        when(service.get("p1")).thenReturn(before);
        when(quick.apply("p1", req)).thenReturn(after);

        admin.quickEdit("p1", req);

        verify(audit).record(eq("PRODUCT_UPDATE"), eq("PRODUCT"), eq("p1"), contains("быстрая правка"));
        verify(revalidator).productChanged("mouse", "mouse", Set.of());
    }

    @Test
    void aRefusedQuickEditLeavesNoJournalEntryAndNoRebuild() {
        ProductQuickEditRequest req = new ProductQuickEditRequest(null, null, 1, 5, null, null);
        AdminProductDto before = product(true, "NEW");
        when(service.get("p1")).thenReturn(before);
        when(quick.apply("p1", req)).thenThrow(new DomainException.Conflict(CatalogError.STOCK_CONFLICT, "x", "5", "3"));

        assertThatThrownBy(() -> admin.quickEdit("p1", req)).isInstanceOf(DomainException.Conflict.class);

        verify(audit, never()).record(anyString(), anyString(), anyString(), any());
        verify(revalidator, never()).productChanged(any(), any(), any());
    }

    @Test
    void aFailedSaveLeavesNoJournalEntryAndNoRebuild() {
        when(service.setActive("p1", true, false)).thenThrow(new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));

        assertThatThrownBy(() -> admin.setActive("p1", true, false)).isInstanceOf(DomainException.NotFound.class);

        verify(audit, never()).record(anyString(), anyString(), anyString(), any());
        verify(revalidator, never()).productChanged(any(), any(), any());
    }
}
