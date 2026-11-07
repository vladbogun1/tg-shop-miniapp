package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.maxsolch.shop.ai.domain.JobStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The structural verdict: something to review, only empty fields, or nothing readable. */
class AiAnswerCheckTest {

    private final AiAnswerCheck check = new AiAnswerCheck(new ObjectMapper());

    private static String block(String json) {
        return "Вот ответ.\n```json\n" + json + "\n```\n";
    }

    @Test
    void aFilledObjectIsDone() {
        assertThat(check.check(block("{\"weight\": 54, \"sensor\": \"Focus Pro\"}"), 1)).isEqualTo(JobStatus.DONE);
    }

    @Test
    void theLastBlockWins() {
        String text = block("{\"a\": 1}") + "Поправка:" + block("{\"a\": \"\"}");

        assertThat(check.check(text, 1)).isEqualTo(JobStatus.EMPTY);
    }

    @Test
    void onlyEmptyFieldsAreEmpty() {
        assertThat(check.check(block("{\"id\": 5, \"weight\": null, \"tags\": [], \"note\": \"  \"}"), 1))
                .isEqualTo(JobStatus.EMPTY);
    }

    @Test
    void theIdOfTheSubjectIsNotData() {
        assertThat(check.check(block("{\"productId\": 12, \"sku\": \"X1\"}"), 1)).isEqualTo(JobStatus.EMPTY);
    }

    @Test
    void noBlockOrBrokenJsonIsABadAnswer() {
        assertThat(check.check("Просто текст", 1)).isEqualTo(JobStatus.BAD_ANSWER);
        assertThat(check.check(block("{\"a\": "), 1)).isEqualTo(JobStatus.BAD_ANSWER);
        assertThat(check.check(null, 1)).isEqualTo(JobStatus.BAD_ANSWER);
    }

    @Test
    void wrappedListsAreReadPerSubject() {
        assertThat(check.check(block("{\"products\": [{\"id\": 1, \"w\": 50}, {\"id\": 2, \"w\": 60}]}"), 2))
                .isEqualTo(JobStatus.DONE);
        assertThat(check.check(block("[{\"id\": 1, \"w\": 50}]"), 2)).isEqualTo(JobStatus.BAD_ANSWER);
    }

    @Test
    void oneFilledSubjectIsEnoughForDone() {
        assertThat(check.check(block("{\"items\": [{\"id\": 1}, {\"id\": 2, \"w\": 60}]}"), 2))
                .isEqualTo(JobStatus.DONE);
    }

    @Test
    void aBareJsonAnswerWithoutFencesIsRead() {
        assertThat(check.check("{\"w\": 5}", 1)).isEqualTo(JobStatus.DONE);
    }
}
