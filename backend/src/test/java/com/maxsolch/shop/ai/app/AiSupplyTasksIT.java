package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.web.CurrentActor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * The tasks of a supply (a draft's steps, the invoice of the manual way) are decided on the supply screens, not in
 * «ИИ-задачи → Проверить»: they are listed in «История» only, are not counted as waiting for a review, and get their
 * outcome from the supply (accepted → APPLIED, deleted → REJECTED), once.
 */
class AiSupplyTasksIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;

    @Autowired
    AiTaskList tasks;
    @Autowired
    AiOutcome outcome;

    @MockitoBean
    CurrentActor actor;
    @MockitoBean
    AdminAccess access;

    @BeforeEach
    void setUp() {
        when(actor.userId()).thenReturn(ADMIN);
        when(access.canSeeFinance(ADMIN)).thenReturn(false);
    }

    private long doneJob(String feature, String subjectType, String subjectId) {
        jdbc.update("insert into ai_jobs (feature, status, admin_id, subject_type, subject_id, effort, created_at, finished_at) "
                + "values (?, 'DONE', ?, ?, ?, 'low', now(6), now(6))", feature, ADMIN, subjectType, subjectId);
        return jdbc.queryForObject("select max(id) from ai_jobs", Long.class);
    }

    private List<Long> ids(String tab) {
        return tasks.page(tab, 0, AiTaskList.MAX_SIZE).items().stream().map(r -> r.job().id()).toList();
    }

    private String outcomeOf(long id) {
        return jdbc.queryForObject("select outcome from ai_jobs where id = ?", String.class, id);
    }

    @Test
    void supplyTasksAreNotWaitingForAReviewButAreInTheHistory() {
        String draft = "d" + System.nanoTime();
        long read = doneJob("SUPPLY_EXTRACT", "SUPPLY_DRAFT", draft + "-read");
        long files = doneJob("SUPPLY_MATCH", "SUPPLY_FILES", "m" + System.nanoTime());
        long card = doneJob("CARD", "PRODUCT", UUID.randomUUID().toString());

        assertThat(ids("REVIEW")).contains(card).doesNotContain(read, files);
        assertThat(ids("HISTORY")).contains(card, read, files);
    }

    @Test
    void theSupplySettlesItsTasksOnce() {
        String draft = "d" + System.nanoTime();
        long read = doneJob("SUPPLY_EXTRACT", "SUPPLY_DRAFT", draft + "-read");
        long unused = doneJob("CARD", "SUPPLY_DRAFT", draft + "-c-L2");

        outcome.settle(List.of(read), List.of(unused));
        outcome.settle(List.of(unused), List.of(read));

        assertThat(outcomeOf(read)).isEqualTo("APPLIED");
        assertThat(outcomeOf(unused)).isEqualTo("REJECTED");
    }
}
