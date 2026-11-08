package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.procurement.app.SupplyDraftDtos.SameInvoice;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * «Эта накладная уже в черновике №N»: the same file uploaded again (same SHA-256) points to the drafts the admin can
 * open — still checked or accepted; another admin's draft only with the finance right; files of old drafts that the
 * storage no longer keeps, and files stored without a hash, do not count.
 */
class SupplyDraftDuplicatesIT extends AbstractMysqlIT {

    private static final long ME = 81L;
    private static final long OTHER = 82L;
    private static final String SHA = "a".repeat(64);

    @Autowired
    SupplyDraftDuplicates duplicates;

    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from supply_drafts");
        jdbc.update("delete from ai_files");
        when(actor.userId()).thenReturn(ME);
        when(access.canSeeFinance(ME)).thenReturn(false);
    }

    private long file(long admin, String sha) {
        jdbc.update("insert into ai_files (admin_id, upload_id, name, object_key, mime, size, content_sha256, created_at, expires_at) "
                        + "values (?, ?, 'n.png', ?, 'image/png', 1, ?, now(6), now(6) + interval 7 day)",
                admin, UUID.randomUUID().toString(), "k/" + UUID.randomUUID(), sha);
        return jdbc.queryForObject("select max(id) from ai_files", Long.class);
    }

    private long draft(long admin, String status, long fileId, String createdAgo) {
        jdbc.update("insert into supply_drafts (admin_id, status, step, title, file_ids, state, batch_id, created_at, updated_at) "
                        + "values (?, ?, 'DONE', 'WESTLAB', ?, '{}', ?, now(6) - interval " + createdAgo + ", now(6))",
                admin, status, String.valueOf(fileId), "ACCEPTED".equals(status) ? 5L : null);
        return jdbc.queryForObject("select max(id) from supply_drafts", Long.class);
    }

    @Test
    void theSameFileUploadedAgainPointsToItsDrafts() {
        long open = draft(ME, "READY", file(ME, SHA), "1 hour");
        long accepted = draft(ME, "ACCEPTED", file(ME, SHA), "2 day");
        draft(ME, "READY", file(ME, "b".repeat(64)), "1 hour");
        draft(OTHER, "READY", file(OTHER, SHA), "1 hour");
        draft(ME, "READY", file(ME, SHA), "9 day");
        long again = file(ME, SHA);

        List<SameInvoice> found = duplicates.sameInvoice(List.of(again));

        assertThat(found).extracting(SameInvoice::id).containsExactly(accepted, open);
        assertThat(found.get(0).batchId()).isEqualTo(5L);
    }

    @Test
    void financeSeesOtherAdminsDraftsAndFilesWithoutAHashMatchNothing() {
        when(access.canSeeFinance(ME)).thenReturn(true);
        long theirs = draft(OTHER, "RUNNING", file(OTHER, SHA), "1 hour");
        draft(ME, "READY", file(ME, null), "1 hour");

        assertThat(duplicates.sameInvoice(List.of(file(ME, SHA)))).extracting(SameInvoice::id).containsExactly(theirs);
        assertThat(duplicates.sameInvoice(List.of(file(ME, null)))).isEmpty();
    }
}
