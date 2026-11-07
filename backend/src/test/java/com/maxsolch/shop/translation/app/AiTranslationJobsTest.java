package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.ai.app.AiBatches;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class AiTranslationJobsTest {

    private final AiBatches batches = mock(AiBatches.class);
    private final AiTranslationJobs jobs = new AiTranslationJobs(batches);

    private static String prompt(int strings) {
        String body = IntStream.range(0, strings).mapToObj(i -> "\"t" + i + "\": {\"ru\": \"x\"}")
                .collect(Collectors.joining(", "));
        return "Переведи:\n```json\n{" + body + "}\n```";
    }

    @Test
    void partOfSixtyStringsStartsOneTaskPerPart() {
        jobs.start(new AiTranslationJobs.Start(List.of(new AiTranslationJobs.Part(1, prompt(60)),
                new AiTranslationJobs.Part(2, prompt(5))), "v1"), "k1");
        verify(batches).create(any(AiBatches.Create.class), eq("k1"));
    }

    @Test
    void moreThanSixtyStringsOrNoJsonIsRejected() {
        assertThatThrownBy(() -> jobs.start(new AiTranslationJobs.Start(
                List.of(new AiTranslationJobs.Part(1, prompt(61))), null), null))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> jobs.start(new AiTranslationJobs.Start(
                List.of(new AiTranslationJobs.Part(1, "без json")), null), null))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> jobs.start(new AiTranslationJobs.Start(List.of(), null), null))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void labelsNameThePartByItsNumber() {
        assertThat(new TranslationSubjectLabels().labels(List.of("3-abc123"))).containsEntry("3-abc123", "Перевод, часть 3");
    }
}
