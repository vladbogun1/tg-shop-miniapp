package com.maxsolch.shop.translation.app;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class TranslationAnswerJsonTest {

    @Test
    void readsAnswersFromFenceWithTrailingCommaAndLowercasesIds() {
        String text = "Вот:\n```json\n{\"T1A2\": {\"ru\": \"x\", \"uk\": \"юк\", \"en\": \"en\",},}\n```";
        Map<String, TranslationAnswerJson.Entry> a = TranslationAnswerJson.answers(text);
        assertThat(a).containsOnlyKeys("t1a2");
        assertThat(a.get("t1a2")).isEqualTo(new TranslationAnswerJson.Entry("юк", "en"));
    }

    @Test
    void plainJsonWithoutFenceAndFirstWins() {
        Map<String, TranslationAnswerJson.Entry> a = TranslationAnswerJson.answers(
                "{\"t1\": {\"uk\": \"a\"}, \"T1\": {\"uk\": \"b\", \"en\": \"c\"}}");
        assertThat(a.get("t1")).isEqualTo(new TranslationAnswerJson.Entry("a", null));
    }

    @Test
    void askedIsTheLastBlockOfThePrompt() {
        String prompt = "Пример:\n```json\n{\"t0\": {}}\n```\nДанные:\n```json\n"
                + "{\"tab\": {\"ru\": \"x\"}, \"tcd\": {\"ru\": \"y\"}}\n```";
        assertThat(TranslationAnswerJson.asked(prompt)).containsExactly("tab", "tcd");
        assertThat(TranslationAnswerJson.asked("нет json")).isNull();
    }

    @Test
    void garbageGivesNothing() {
        assertThat(TranslationAnswerJson.answers("```json\n{oops\n```")).isEmpty();
        assertThat(TranslationAnswerJson.answers(null)).isEmpty();
    }
}
