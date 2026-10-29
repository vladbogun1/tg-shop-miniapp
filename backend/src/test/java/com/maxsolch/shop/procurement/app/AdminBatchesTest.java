package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveLineResult;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveResult;
import com.maxsolch.shop.procurement.app.BatchDtos.CancelRequest;
import com.maxsolch.shop.site.app.SiteRevalidator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The audit and the site refresh that go with the admin's batch buttons. */
class AdminBatchesTest {

    PreorderBatchService batches = mock(PreorderBatchService.class);
    AdminAuditService audit = mock(AdminAuditService.class);
    SiteRevalidator revalidator = mock(SiteRevalidator.class);
    AdminBatches admin;

    @BeforeEach
    void setUp() {
        admin = new AdminBatches(batches, audit, revalidator);
    }

    private static ArriveResult arrived(boolean dryRun) {
        return new ArriveResult(dryRun, "QUEUE_HOLD", 24, List.of(
                new ArriveLineResult(1, "Lamzu", null, 4, 5, 2, 2, 0, 0, 0, 0)));
    }

    @Test
    void aRealArrivalIsAuditedAndRefreshesTheSite() {
        ArriveRequest req = new ArriveRequest(false, null, null, null);
        when(batches.arrive(5L, req)).thenReturn(arrived(false));

        admin.arrive(5L, req);

        verify(audit).record(eq("PREORDER_BATCH_ARRIVE"), eq("PREORDER_BATCH"), eq("5"), contains("приехало 4 шт."));
        verify(revalidator).allChanged();
    }

    @Test
    void aDryRunLeavesNoTrace() {
        ArriveRequest req = new ArriveRequest(true, null, null, null);
        when(batches.arrive(5L, req)).thenReturn(arrived(true));

        admin.arrive(5L, req);

        verify(audit, never()).record(anyString(), anyString(), anyString(), any());
        verify(revalidator, never()).allChanged();
    }

    @Test
    void cancellingSaysWhetherTheQueueWasClosed() {
        admin.cancel(5L, new CancelRequest(true, null), false);
        admin.cancel(6L, null, false);

        verify(audit).record("PREORDER_BATCH_CANCEL", "PREORDER_BATCH", "5", "с закрытием очереди");
        verify(audit).record("PREORDER_BATCH_CANCEL", "PREORDER_BATCH", "6", "очередь оставлена");
    }
}
