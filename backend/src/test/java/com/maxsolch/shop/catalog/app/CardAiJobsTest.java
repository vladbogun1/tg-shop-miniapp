package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.app.AiJobs;
import com.maxsolch.shop.ai.domain.AiError;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.catalog.domain.ProductBrief;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The rules a card job fixes itself: one product, medium effort, one-product budget, feature from the screen. */
class CardAiJobsTest {

    private static final String ID = "0b1c2d3e-0000-4000-8000-000000000042";

    private final AiJobs jobs = mock(AiJobs.class);
    private final ProductBriefs products = mock(ProductBriefs.class);
    private final CardAiJobs cards = new CardAiJobs(jobs, products);

    private void productExists() {
        when(products.briefs(any())).thenReturn(Map.of(ID, new ProductBrief("Мышь", "mouse", null, true)));
    }

    private CardAiJobs.Start start(boolean created, String version) {
        return new CardAiJobs.Start(ID.toUpperCase(), created, version, "Заполни", "card-1");
    }

    @Test
    void aCardJobIsAlwaysMediumEffortWithTheBudgetOfOneProduct() {
        productExists();
        cards.start(start(true, "c1-abc"), "key-1");
        ArgumentCaptor<AiJobs.CreateJob> sent = ArgumentCaptor.forClass(AiJobs.CreateJob.class);
        verify(jobs).create(sent.capture(), eq("key-1"));
        AiJobs.CreateJob job = sent.getValue();
        assertThat(job.effort()).isEqualTo("medium");
        assertThat(job.researchItems()).isEqualTo(1);
        assertThat(job.mode()).isEqualTo(JobMode.NORMAL);
        assertThat(job.subjectType()).isEqualTo("PRODUCT");
        assertThat(job.subjectId()).isEqualTo(ID);
        assertThat(job.subjectVersion()).isEqualTo("c1-abc");
        assertThat(job.promptVersion()).isEqualTo("card-1");
        assertThat(job.feature()).isEqualTo(AiFeature.CARD);
    }

    @Test
    void fillingAnExistingCardIsTheCompletionFeature() {
        productExists();
        cards.start(start(false, "c1-abc"), null);
        ArgumentCaptor<AiJobs.CreateJob> sent = ArgumentCaptor.forClass(AiJobs.CreateJob.class);
        verify(jobs).create(sent.capture(), any());
        assertThat(sent.getValue().feature()).isEqualTo(AiFeature.COMPLETION);
    }

    @Test
    void anUnknownProductIsNotFoundAndStartsNothing() {
        when(products.briefs(any())).thenReturn(Map.of());
        assertThatThrownBy(() -> cards.start(start(true, "c1"), null)).isInstanceOf(DomainException.NotFound.class)
                .extracting(e -> ((DomainException) e).errorCode()).isEqualTo(AiError.SUBJECT_NOT_FOUND);
        verify(jobs, never()).create(any(), any());
    }

    @Test
    void badInputIsRefusedBeforeTheLookup() {
        assertThat(refused(new CardAiJobs.Start("not-a-uuid", true, "v", "p", null))).isTrue();
        assertThat(refused(start(true, " "))).isTrue();
        assertThat(refused(start(true, "x".repeat(65)))).isTrue();
        assertThat(refused(new CardAiJobs.Start(ID, true, "v", "p", "y".repeat(33)))).isTrue();
        verify(products, never()).briefs(any());
    }

    private boolean refused(CardAiJobs.Start req) {
        try {
            cards.start(req, null);
            return false;
        } catch (DomainException.BadRequest e) {
            return true;
        }
    }
}
