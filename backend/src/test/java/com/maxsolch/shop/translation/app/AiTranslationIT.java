package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.ai.domain.AiJob;
import com.maxsolch.shop.ai.domain.ResultWriter;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The answer of a translation task on a real MySQL: it is written through the import of the translation module as
 * drafts of the built-in AI (marked by the sign of {@code updated_by}, nobody has reviewed them), the Russian source is
 * checked again at the moment of writing, a translation a person wrote is not replaced and a bad answer is not written.
 */
class AiTranslationIT extends AbstractMysqlIT {

    private static final long ADMIN = 7L;

    @Autowired
    AiTranslationApply apply;
    @Autowired
    TranslationReport report;
    @Autowired
    TranslationImport imports;

    private String newOption(String title) {
        PaymentOption po = new PaymentOption();
        po.setTitle(title);
        po.setSortOrder(0);
        return UuidUtil.toString(paymentOptions.save(po).getId());
    }

    private static String promptOf(String title) {
        String id = "t" + com.maxsolch.shop.translation.domain.SourceHash.sha256Hex(title).substring(0, 8);
        return "Переведи:\n```json\n{\"" + id + "\": {\"ru\": \"" + title + "\"}}\n```";
    }

    private static String answerOf(String title, String uk, String en) {
        String id = "t" + com.maxsolch.shop.translation.domain.SourceHash.sha256Hex(title).substring(0, 8);
        return "```json\n{\"" + id + "\": {\"ru\": \"" + title + "\", \"uk\": \"" + uk + "\", \"en\": \"" + en + "\"}}\n```";
    }

    private static AiJob job() {
        AiJob job = mock(AiJob.class);
        when(job.getAdminId()).thenReturn(ADMIN);
        when(job.getId()).thenReturn(1L);
        return job;
    }

    private ExportItem item(String locale, String optionId) {
        return report.export(locale, null, "PAYMENT_OPTION").stream()
                .filter(i -> i.entityId().equals(optionId)).findFirst().orElseThrow();
    }

    @Test
    void writesDraftsOfTheBuiltInAiAndSurvivesARepeat() {
        String title = "Тест перевода " + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
        String num = title.substring(title.lastIndexOf(' ') + 1);
        String optionId = newOption(title);

        ResultWriter.Written w = apply.write(job(), promptOf(title),
                answerOf(title, "Тест перекладу " + num, "Translation test " + num));

        assertThat(w.applied()).isEqualTo(2);
        assertThat(w.rejected()).isZero();
        assertThat(w.ignoredLocked()).isZero();
        ExportItem uk = item("uk", optionId);
        assertThat(uk.status()).isEqualTo("TRANSLATED");
        assertThat(uk.text()).isEqualTo("Тест перекладу " + num);
        assertThat(uk.origin()).isEqualTo("AI");
        assertThat(uk.builtinAi()).isTrue();
        assertThat(uk.reviewed()).isFalse();
        assertThat(item("en", optionId).text()).isEqualTo("Translation test " + num);

        ResultWriter.Written again = apply.write(job(), promptOf(title),
                answerOf(title, "Тест перекладу " + num, "Translation test " + num));
        assertThat(again.applied()).isZero();
    }

    @Test
    void aManualTranslationIsNotReplaced() {
        String title = "Ручной перевод " + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
        String num = title.substring(title.lastIndexOf(' ') + 1);
        String optionId = newOption(title);
        // a person translated into English by hand, then the Russian text changed: the manual row is stale
        String old = "Старый текст " + num;
        imports.importTranslations(new TranslationDtos.ImportRequest("en", "MANUAL", false, List.of(
                new ImportItem("PAYMENT_OPTION", optionId, "title",
                        com.maxsolch.shop.translation.domain.SourceHash.sha256Hex(title), "Old text " + num))), ADMIN);
        jdbc.update("update content_translations set source_hash = ? where entity_id = ? and locale = 'en'",
                com.maxsolch.shop.translation.domain.SourceHash.sha256Hex(old), UuidUtil.toBytes(optionId));

        ResultWriter.Written w = apply.write(job(), promptOf(title),
                answerOf(title, "Ручний переклад " + num, "Manual translation " + num));

        assertThat(w.applied()).isEqualTo(1);
        assertThat(w.ignoredLocked()).isEqualTo(1);
        assertThat(item("en", optionId).text()).isEqualTo("Old text " + num);
        assertThat(item("en", optionId).builtinAi()).isFalse();
        assertThat(item("uk", optionId).builtinAi()).isTrue();
    }

    @Test
    void aBadAnswerIsNotWritten() {
        String title = "Плохой ответ " + ThreadLocalRandom.current().nextInt(10_000_000, 99_999_999);
        String optionId = newOption(title);

        ResultWriter.Written w = apply.write(job(), promptOf(title), answerOf(title, "Без числа", "No number"));

        assertThat(w.applied()).isZero();
        assertThat(w.rejected()).isEqualTo(2);
        assertThat(item("uk", optionId).status()).isEqualTo("MISSING");
    }
}
