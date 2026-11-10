package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.translation.domain.TranslationGlossary;
import com.maxsolch.shop.catalog.domain.CardPromptText;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Статические куски промпта (заголовок: задача, правила, формат, глоссарий) совпадают с TS-источником в админке.
 * Читает исходники прямо из ../frontend-admin; без них — пропускается. Поменяли текст в prompt.ts — поправьте
 * {@link CardPromptText} / {@link TranslationGlossary} (и golden-эталон админки).
 */
class CardPromptInSyncTest {

    private static final Path PROMPT = Path.of("../frontend-admin/features/cards/model/prompt.ts");
    private static final Path TRANSLATION_PROMPT = Path.of("../frontend-admin/features/translation/model/prompt.ts");

    @Test
    void glossaryEqualsTranslationGlossary() throws IOException {
        String ts = source(TRANSLATION_PROMPT);
        String raw = between(ts, "export const GLOSSARY = `", "`.trim();");

        assertThat(TranslationGlossary.TEXT).isEqualTo(jsTemplateValue(raw).strip());
    }

    @Test
    void headerEqualsBuildCardPromptHeader() throws IOException {
        String raw = between(source(PROMPT), "return `Ты — контент-менеджер", "`;\n}");
        String expected = ("Ты — контент-менеджер" + jsTemplateValue(raw))
                .replace("${partLine}", "Всего товаров: 3.");

        assertThat(CardPromptText.header(3)).isEqualTo(expected);
    }

    @Test
    void photoHintEqualsTs() throws IOException {
        String ts = source(PROMPT);

        assertThat(ts).contains("NO_PHOTOS_HINT = \"" + NewProductCards.NO_PHOTOS_HINT + "\"");
    }

    private static String source(Path p) throws IOException {
        assumeTrue(Files.exists(p), "нет ../frontend-admin — сверка с админкой пропущена");
        return Files.readString(p, StandardCharsets.UTF_8).replace("\r\n", "\n");
    }

    private static String between(String text, String start, String end) {
        int a = text.indexOf(start);
        assertThat(a).as("начало «%s»", start).isGreaterThanOrEqualTo(0);
        a += start.length();
        int b = text.indexOf(end, a);
        assertThat(b).as("конец «%s»", end).isGreaterThan(a);
        return text.substring(a, b);
    }

    /** Значение шаблонной строки JS: \` → `, \\ → \, \$ → $ (остальное как есть). */
    private static String jsTemplateValue(String raw) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '\\' && i + 1 < raw.length() && "`\\$".indexOf(raw.charAt(i + 1)) >= 0) {
                sb.append(raw.charAt(++i));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
