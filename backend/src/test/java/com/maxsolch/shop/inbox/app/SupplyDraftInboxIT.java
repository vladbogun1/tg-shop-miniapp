package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.inbox.app.InboxDtos.Item;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * «Поставки ждут проверки»: ready and failed drafts, to their author and the finance admins; running and accepted
 * drafts are not there, and a background caller without an admin (the push badge) gets none.
 */
class SupplyDraftInboxIT extends AbstractMysqlIT {

    private static final long AUTHOR = 71L;
    private static final long OTHER = 72L;
    private static final long FINANCE = 73L;

    @Autowired
    SupplyDraftInboxSource source;

    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;

    @BeforeEach
    void setUp() {
        jdbc.update("delete from supply_drafts");
        when(actor.isPresent()).thenReturn(true);
        when(access.canSeeFinance(FINANCE)).thenReturn(true);
    }

    private long draft(String status) {
        jdbc.update("insert into supply_drafts (admin_id, status, step, title, file_ids, state, created_at, updated_at, ready_at) "
                + "values (?, ?, 'DONE', ?, '1', '{}', now(6), now(6), now(6))", AUTHOR, status, "Поставка " + status);
        return jdbc.queryForObject("select max(id) from supply_drafts", Long.class);
    }

    private List<String> ids(long viewer) {
        when(actor.userId()).thenReturn(viewer);
        return source.items(Instant.now()).stream().map(Item::entityId).toList();
    }

    @Test
    void readyAndFailedDraftsGoToTheirAuthorAndFinance() {
        long ready = draft("READY");
        long failed = draft("FAILED");
        draft("RUNNING");
        draft("ACCEPTED");

        assertThat(ids(AUTHOR)).containsExactly(String.valueOf(failed), String.valueOf(ready));
        assertThat(ids(FINANCE)).containsExactly(String.valueOf(failed), String.valueOf(ready));
        assertThat(ids(OTHER)).isEmpty();
    }

    @Test
    void noAdminNoRows() {
        draft("READY");
        when(actor.isPresent()).thenReturn(false);

        assertThat(source.items(Instant.now())).isEmpty();
    }
}
