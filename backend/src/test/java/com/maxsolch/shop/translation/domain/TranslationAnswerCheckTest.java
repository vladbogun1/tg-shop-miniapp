package com.maxsolch.shop.translation.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class TranslationAnswerCheckTest {

    @Test
    void goodTranslationHasNoErrors() {
        assertThat(TranslationAnswerCheck.errors("Миша Lamzu Atlantis, 55 г", "uk", "Миша Lamzu Atlantis, 55 г")).isEmpty();
        assertThat(TranslationAnswerCheck.errors("Беспроводная мышь на 60 часов", "en", "Wireless mouse, 60 hours of use"))
                .isEmpty();
    }

    @Test
    void emptyLostNumberPlaceholderAndLines() {
        assertThat(TranslationAnswerCheck.errors("Мышь", "en", " ")).containsExactly("пусто");
        assertThat(TranslationAnswerCheck.errors("Вес 55 грамм", "en", "Weight in grams")).anyMatch(e -> e.contains("55"));
        assertThat(TranslationAnswerCheck.errors("Привет, {name}", "uk", "Привіт")).anyMatch(e -> e.contains("{name}"));
        assertThat(TranslationAnswerCheck.errors("Строка один\nстрока два", "en", "One line only"))
                .anyMatch(e -> e.startsWith("строк"));
    }

    @Test
    void ukrainianKeepsLatinAndHasNoRussianLetters() {
        assertThat(TranslationAnswerCheck.errors("Коврик Artisan Zero", "uk", "Килимок")).anyMatch(e -> e.contains("Artisan"));
        assertThat(TranslationAnswerCheck.errors("Это съёмный чехол для мыши", "uk", "Это съёмный чехол для мыши"))
                .anyMatch(e -> e.contains("русские"));
    }

    @Test
    void lengthFarFromSourceIsAnError() {
        String src = "Длинное описание товара, которое занимает много места";
        assertThat(TranslationAnswerCheck.errors(src, "en", "Mouse")).anyMatch(e -> e.startsWith("длина"));
    }

    @Test
    void normalizeKeepsOuterWhitespaceOnlyIfSourceHasIt() {
        assertThat(TranslationAnswerCheck.normalize("текст", "  text \n")).isEqualTo("text");
        assertThat(TranslationAnswerCheck.normalize(" текст ", " text ")).isEqualTo(" text ");
    }
}
