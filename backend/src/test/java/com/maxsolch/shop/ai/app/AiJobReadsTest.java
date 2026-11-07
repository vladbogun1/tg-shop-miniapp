package com.maxsolch.shop.ai.app;

import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.AiJobBody;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.infra.AiJobBodyRepository;
import com.maxsolch.shop.ai.infra.AiJobRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * An invoice's answer holds purchase prices: the admin who uploaded the pictures and an admin with the finance right
 * get it, the other admins do not. The prompt is for the finance admins (like for every feature).
 */
class AiJobReadsTest {

    private final AiJobRepository jobs = mock(AiJobRepository.class);
    private final AiJobBodyRepository bodies = mock(AiJobBodyRepository.class);
    private final AiJobReads reads = new AiJobReads(jobs, bodies, mock(AiSubjectChanges.class));

    private void stored(AiFeature feature, long id) {
        AiJob job = AiJob.queued(new AiJob.Spec(feature, 7L, "X", "1", null, JobMode.NORMAL, "low", 1, null, null, null),
                Instant.parse("2026-11-07T10:00:00Z"));
        ReflectionTestUtils.setField(job, "id", id);
        AiJobBody body = AiJobBody.of(id, "закупка 120 USD", null, Instant.parse("2026-11-07T10:00:00Z"));
        body.answered("{\"lines\":[{\"price\":120}]}");
        when(jobs.findById(id)).thenReturn(Optional.of(job));
        when(bodies.findById(id)).thenReturn(Optional.of(body));
    }

    @Test
    void theInvoiceTextsAreHiddenFromAnotherAdminWithoutFinance() {
        stored(AiFeature.SUPPLY_EXTRACT, 1);
        AiJobDto body = reads.read(1, 8L, false).orElseThrow();
        assertThat(body.prompt()).isNull();
        assertThat(body.answer()).isNull();
    }

    @Test
    void theAdminWhoStartedTheReadingSeesItsAnswerButNotTheMoney() {
        stored(AiFeature.SUPPLY_EXTRACT, 1);
        AiJobDto body = reads.read(1, 7L, false).orElseThrow();
        assertThat(body.answer()).contains("120");
        assertThat(body.prompt()).isNull();
        assertThat(body.costMinor()).isNull();
    }

    @Test
    void theFinanceAdminSeesThemAndOtherFeaturesAreOpen() {
        stored(AiFeature.SUPPLY_EXTRACT, 1);
        assertThat(reads.read(1, 8L, true).orElseThrow().answer()).contains("120");
        stored(AiFeature.CARD, 2);
        assertThat(reads.read(2, 8L, false).orElseThrow().answer()).contains("120");
    }
}
