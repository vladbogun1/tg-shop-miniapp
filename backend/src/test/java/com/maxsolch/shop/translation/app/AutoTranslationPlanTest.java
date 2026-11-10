package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.app.AutoTranslationPlan.Item;
import com.maxsolch.shop.translation.app.TranslatableSource.Field;
import com.maxsolch.shop.translation.app.TranslationService.Key;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class AutoTranslationPlanTest {

    private static final Key TITLE = key(TranslationEntityType.PRODUCT, "a", "title");
    private static final Key DESC = key(TranslationEntityType.PRODUCT, "a", "description");
    private static final Key VARIANT = key(TranslationEntityType.VARIANT, "b", "name");
    private static final Key BOT = key(TranslationEntityType.BOT_TEXT, "c", "body");
    private static final Set<TranslationEntityType> SKIP = Set.of(TranslationEntityType.BOT_TEXT);

    private final Map<Key, Field> sources = new LinkedHashMap<>();
    private final Map<Key, ContentTranslation> rows = new HashMap<>();

    private static Key key(TranslationEntityType type, String n, String field) {
        return new Key(type, "00000000-0000-0000-0000-00000000000" + n, field);
    }

    private void row(Key k, String translatedFrom, TranslationOrigin origin) {
        ContentTranslation r = new ContentTranslation(new ContentTranslationId(k.type(), new byte[16], k.field(), "uk"));
        r.setText("x");
        r.setSourceHash(SourceHash.sha256Hex(translatedFrom));
        r.setSourceText(translatedFrom);
        r.setOrigin(origin);
        rows.put(k, r);
    }

    private List<Item> pending(Set<String> unusable) {
        return AutoTranslationPlan.pending(sources, rows, SKIP, unusable::contains);
    }

    @Test
    void missingAndStaleAreSentCurrentAreNot() {
        sources.put(TITLE, new Field("Мышь Lamzu", true));
        sources.put(DESC, new Field("Лёгкая беспроводная мышь", true));
        sources.put(VARIANT, new Field("белая", true));
        row(TITLE, "Мышь Lamzu", TranslationOrigin.AI);
        row(DESC, "Старое описание", TranslationOrigin.AI);

        assertThat(pending(Set.of())).extracting(Item::source).containsExactly("белая", "Лёгкая беспроводная мышь");
    }

    @Test
    void manualTranslationIsNeverReplacedEvenWhenStale() {
        sources.put(TITLE, new Field("Мышь Lamzu новая", true));
        row(TITLE, "Мышь Lamzu", TranslationOrigin.MANUAL);

        assertThat(pending(Set.of())).isEmpty();
    }

    @Test
    void hiddenBlankSkippedTypesAndUnusableTextsAreLeftOut() {
        sources.put(TITLE, new Field("Мышь в архиве", false));
        sources.put(DESC, new Field("   ", true));
        sources.put(BOT, new Field("Фраза бота", true));
        sources.put(VARIANT, new Field("чёрная", true));

        assertThat(pending(Set.of(SourceHash.sha256Hex("чёрная")))).isEmpty();
    }

    @Test
    void sameTextInSeveralPlacesIsOneItem() {
        sources.put(TITLE, new Field("белая", true));
        sources.put(VARIANT, new Field("белая", true));

        List<Item> items = pending(Set.of());

        assertThat(items).hasSize(1);
        assertThat(items.get(0).keys()).containsExactlyInAnyOrder(TITLE, VARIANT);
    }

    @Test
    void callsStopAtTheBudgetAndRespectTheCallLimits() {
        List<Item> items = List.of(item("aa"), item("bbb"), item("cccc"), item("ddddd"));

        assertThat(AutoTranslationPlan.calls(items, 9, 50, 1000)).hasSize(1).first().asList().hasSize(3);
        assertThat(AutoTranslationPlan.calls(items, 100, 2, 1000)).hasSize(2);
        assertThat(AutoTranslationPlan.calls(items, 100, 50, 5)).extracting(List::size).containsExactly(2, 1, 1);
        assertThat(AutoTranslationPlan.calls(items, 0, 50, 1000)).isEmpty();
        assertThat(AutoTranslationPlan.calls(items, -5, 50, 1000)).isEmpty();
    }

    private static Item item(String source) {
        return new Item(source, SourceHash.sha256Hex(source), List.of(TITLE));
    }
}
