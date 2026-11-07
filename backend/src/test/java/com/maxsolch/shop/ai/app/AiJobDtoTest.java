package com.maxsolch.shop.ai.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.maxsolch.shop.ai.domain.AiFeature;
import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.JobMode;
import com.maxsolch.shop.ai.domain.JobStatus;
import com.maxsolch.shop.ai.domain.JobTotals;
import com.maxsolch.shop.ai.domain.TokenUsage;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** The owner's rule in the reply itself: an admin without the finance right gets no money, tokens, prompt or error text. */
class AiJobDtoTest {

    private static final Instant T0 = Instant.parse("2026-11-07T10:00:00Z");
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());

    private static AiJob finished() {
        AiJob j = AiJob.queued(new AiJob.Spec(AiFeature.CARD, 7, "PRODUCT", "42", "v1", JobMode.NORMAL, "medium", 1,
                "card-1", null, null), T0);
        org.springframework.test.util.ReflectionTestUtils.setField(j, "id", 3L);
        j.claim("w", T0, Duration.ofMinutes(5));
        j.fail("MODEL_FAILED", "HTTP 500 secret provider text",
                new JobTotals(4_800, 42_000, new TokenUsage(1000, 0, 500), 3, 2, 1, true), T0);
        return j;
    }

    @Test
    void anAdminWithoutFinanceSeesNoMoneyNoPromptNoProviderText() throws Exception {
        JsonNode out = json.valueToTree(AiJobDto.of(finished(), new AiJobDto.Body("секретный промпт", "ответ"), false));

        for (String field : new String[]{"prompt", "costMicroUsd", "costMinor", "rateMilli", "inputTokens",
                "cachedTokens", "outputTokens", "modelCalls", "searches", "pages", "repaired", "promptVersion",
                "errorNote"}) {
            assertThat(out.has(field)).as(field).isFalse();
        }
        assertThat(out.get("answer").asText()).isEqualTo("ответ");
        assertThat(out.get("status").asText()).isEqualTo(JobStatus.FAILED.name());
        assertThat(out.get("errorCode").asText()).isEqualTo("MODEL_FAILED");
        assertThat(json.writeValueAsString(out)).doesNotContain("секретный").doesNotContain("secret provider");
    }

    @Test
    void theOwnerSeesTheMoneyAndThePrompt() {
        JsonNode out = json.valueToTree(AiJobDto.of(finished(), new AiJobDto.Body("секретный промпт", "ответ"), true));

        assertThat(out.get("prompt").asText()).isEqualTo("секретный промпт");
        assertThat(out.get("costMicroUsd").asLong()).isEqualTo(4_800);
        assertThat(out.get("costMinor").asLong()).isEqualTo(21);
        assertThat(out.get("rateMilli").asInt()).isEqualTo(42_000);
        assertThat(out.get("modelCalls").asInt()).isEqualTo(3);
        assertThat(out.get("repaired").asBoolean()).isTrue();
        assertThat(out.get("errorNote").asText()).contains("HTTP 500");
    }

    @Test
    void aListRowHasNoTexts() {
        JsonNode out = json.valueToTree(AiJobDto.of(finished(), null, true));

        assertThat(out.has("prompt")).isFalse();
        assertThat(out.has("answer")).isFalse();
    }
}
