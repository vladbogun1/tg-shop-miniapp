package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AiTranslationPlanTest {

    private static final String RU_A = "Беспроводная мышь Lamzu на 60 часов";
    private static final String RU_B = "Коврик для мыши большой";
    private static final Key A = new Key(TranslationEntityType.PRODUCT, "00000000-0000-0000-0000-00000000000a", "title");
    private static final Key A2 = new Key(TranslationEntityType.VARIANT, "00000000-0000-0000-0000-0000000000a2", "name");
    private static final Key B = new Key(TranslationEntityType.PRODUCT, "00000000-0000-0000-0000-00000000000b", "title");
    private static final String UK_A = "Бездротова миша Lamzu на 60 годин";
    private static final String EN_A = "Wireless Lamzu mouse, 60 hours";

    private final Map<Key, Field> sources = new LinkedHashMap<>();
    private final Map<String, Map<Key, ContentTranslation>> rows = new HashMap<>();

    AiTranslationPlanTest() {
        sources.put(A, new Field(RU_A, true));
        sources.put(A2, new Field(RU_A, true));
        sources.put(B, new Field(RU_B, true));
        rows.put("uk", new HashMap<>());
        rows.put("en", new HashMap<>());
    }

    private static String id(String ru) {
        return "t" + SourceHash.sha256Hex(ru).substring(0, 8);
    }

    private static ContentTranslation row(Key k, String locale, String src, TranslationOrigin origin) {
        ContentTranslation r = new ContentTranslation(new ContentTranslationId(k.type(), new byte[16], k.field(), locale));
        r.setText("x");
        r.setSource(src);
        r.setOrigin(origin);
        return r;
    }

    private static Map<String, TranslationAnswerJson.Entry> answers(String... kv) {
        Map<String, TranslationAnswerJson.Entry> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 3) {
            m.put(kv[i], new TranslationAnswerJson.Entry(kv[i + 1], kv[i + 2]));
        }
        return m;
    }

    private AiTranslationPlan.Result plan(Set<String> asked, Map<String, TranslationAnswerJson.Entry> a) {
        return new AiTranslationPlan(sources, rows).plan(asked, a);
    }

    @Test
    void oneAnswerFillsEveryPlaceOfTheText() {
        AiTranslationPlan.Result r = plan(Set.of(id(RU_A)), answers(id(RU_A), UK_A, EN_A));
        assertThat(r.items().get("uk")).extracting(ImportItem::field).containsExactlyInAnyOrder("title", "name");
        assertThat(r.items().get("en")).hasSize(2);
        assertThat(r.rejected()).isZero();
        assertThat(r.ignoredLocked()).isZero();
    }

    @Test
    void manualTranslationIsNotReplacedEvenWhenStale() {
        rows.get("en").put(A, row(A, "en", "старый текст", TranslationOrigin.MANUAL));
        AiTranslationPlan.Result r = plan(Set.of(id(RU_A)), answers(id(RU_A), UK_A, EN_A));
        assertThat(r.items().get("en")).extracting(ImportItem::field).containsExactly("name");
        assertThat(r.items().get("uk")).hasSize(2);
        assertThat(r.ignoredLocked()).isEqualTo(1);
    }

    @Test
    void alreadyTranslatedIsLeftAloneAndNotCounted() {
        rows.get("uk").put(A, row(A, "uk", RU_A, TranslationOrigin.AI));
        AiTranslationPlan.Result r = plan(Set.of(id(RU_A)), answers(id(RU_A), UK_A, EN_A));
        assertThat(r.items().get("uk")).extracting(ImportItem::field).containsExactly("name");
        assertThat(r.rejected()).isZero();
    }

    @Test
    void missingBadAndUnknownAnswersAreRejected() {
        // B: no answer, 2 languages; A: uk loses the number 60 in 2 places, en is fine; "tzz" matches nothing
        AiTranslationPlan.Result r = plan(Set.of(id(RU_B), id(RU_A), "tzz"),
                answers(id(RU_A), "Бездротова миша Lamzu на годин", EN_A));
        assertThat(r.items().get("uk")).isEmpty();
        assertThat(r.items().get("en")).hasSize(2);
        assertThat(r.rejected()).isEqualTo(2 + 2 + 1);
    }

    @Test
    void onlyAskedIdsAreWritten() {
        AiTranslationPlan.Result r = plan(Set.of(id(RU_A)), answers(id(RU_A), UK_A, EN_A,
                id(RU_B), "Килимок для миші великий", "Large mouse pad"));
        assertThat(r.items().get("uk")).hasSize(2);
    }
}
