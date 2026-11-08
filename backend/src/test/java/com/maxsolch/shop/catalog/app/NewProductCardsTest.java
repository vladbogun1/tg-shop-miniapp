package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.app.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.app.NewProductCards.Input;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Промпт, разбор ответа ИИ и сборка записи импорта для нового товара. */
class NewProductCardsTest {

    private static final String GOOD = """
            Вот карточка:
            ```json
            {
              "p0a1b2c3d": {
                "category": "myshki-wireless",
                "brand": "VGN",
                "specs": { "weight_g": 51, "sensor": "paw3950", "rgb": null, "dpi": {"min": 50, "max": 30000}, "empty": "" },
                "confidence": { "weight_g": 95, "sensor": 0.9, "dpi": "80", "ghost": 70 },
                "overall": 92,
                "title": { "ru": "Мышь VGN F2", "uk": "Мишка VGN F2", "en": "VGN F2 Mouse" },
                "description": { "ru": "Лёгкая мышь.\\nДля шутеров.", "uk": "Легка мишка.\\nДля шутерів.", "en": "Light mouse.\\nFor shooters." },
                "sources": ["https://vgnlab.com/f2", "не ссылка"],
                "photos": ["https://a.example/1.png", "https://a.example/1.png", "ftp://x/2.png", {"url": "https://a.example/3.jpg"}],
                "field_sources": { "sensor": "https://vgnlab.com/sensor", "weight_g": "nope" },
                "notes": "Вес без кабеля.",
              },
            }
            ```
            """;

    private final CatalogDirectory directory = mock(CatalogDirectory.class);
    private final NewProductCards cards = new NewProductCards(directory);

    NewProductCardsTest() {
        when(directory.snapshot()).thenReturn(CardPromptFixtures.snapshot());
    }

    @Test
    void promptHasKeySchemaAndNoPhotoHint() {
        String p = cards.prompt(List.of(new Input("p0a1b2c3d", "Мышь", "VGN", CardPromptFixtures.WIRELESS,
                List.of("белая"), 2499L, "строка 5: Мышь VGN x2")));

        assertThat(p).contains("Всего товаров: 1.", "## Глоссарий", "### myshki-wireless — Мышки › Беспроводные",
                "- weight_g — Вес", "\"p0a1b2c3d\": {", "\"priceUah\": 2499", "\"invoiceLine\": \"строка 5: Мышь VGN x2\"",
                NewProductCards.NO_PHOTOS_HINT);
        assertThat(p).containsPattern("\"(p[0-9a-f]{8,32})\"\\s*:");
        assertThat(p).doesNotContain("У части товаров нет категории");
    }

    @Test
    void parsesGoodAnswer() {
        CardDraft d = cards.parse(GOOD, "p0a1b2c3d").orElseThrow();

        assertThat(d.categorySlug()).isEqualTo("myshki-wireless");
        assertThat(d.categoryId()).isEqualTo(CardPromptFixtures.WIRELESS);
        assertThat(d.brand()).isEqualTo("VGN");
        assertThat(d.specs()).containsOnlyKeys("weight_g", "sensor", "dpi");
        assertThat(d.specs().get("weight_g")).isEqualTo(51);
        assertThat(d.specs().get("dpi")).isEqualTo(Map.of("min", 50, "max", 30000));
        assertThat(d.confidence()).containsEntry("weight_g", 95).containsEntry("sensor", 90).containsEntry("dpi", 80);
        assertThat(d.overall()).isEqualTo(92);
        assertThat(d.title()).containsEntry("ru", "Мышь VGN F2").containsEntry("en", "VGN F2 Mouse");
        assertThat(d.description().get("uk")).isEqualTo("Легка мишка.\nДля шутерів.");
        assertThat(d.conditionNote()).isNull();
        assertThat(d.sources()).containsExactly("https://vgnlab.com/f2");
        assertThat(d.photos()).containsExactly("https://a.example/1.png", "https://a.example/3.jpg");
        assertThat(d.fieldSources()).containsOnly(Map.entry("sensor", "https://vgnlab.com/sensor"));
        assertThat(d.notes()).isEqualTo("Вес без кабеля.");
    }

    @Test
    void categoryThatIsNotALeafOrUnknownGivesNullId() {
        String parent = "{\"p0a1b2c3d\": {\"category\": \"myshki\"}}";
        String unknown = "{\"p0a1b2c3d\": {\"category\": \"nope\"}}";

        assertThat(cards.parse(parent, "p0a1b2c3d").orElseThrow().categoryId()).isNull();
        assertThat(cards.parse(parent, "p0a1b2c3d").orElseThrow().categorySlug()).isEqualTo("myshki");
        assertThat(cards.parse(unknown, "p0a1b2c3d").orElseThrow().categoryId()).isNull();
    }

    @Test
    void garbageFieldsAreSkippedNotFatal() {
        String garbage = """
                ```json
                {"p0a1b2c3d": {"category": 5, "brand": ["x"], "specs": "oops", "confidence": [1], "overall": "high",
                  "title": 42, "description": {"ru": 1, "xx": "y"}, "sources": "https://one.example", "photos": 7,
                  "field_sources": [], "notes": {}}}
                ```""";

        CardDraft d = cards.parse(garbage, "p0a1b2c3d").orElseThrow();

        assertThat(d.categorySlug()).isNull();
        assertThat(d.brand()).isNull();
        assertThat(d.specs()).isEmpty();
        assertThat(d.confidence()).isEmpty();
        assertThat(d.overall()).isNull();
        assertThat(d.title()).isEmpty();
        assertThat(d.description()).isEmpty();
        assertThat(d.sources()).containsExactly("https://one.example");
        assertThat(d.photos()).isEmpty();
        assertThat(d.fieldSources()).isEmpty();
        assertThat(d.notes()).isNull();
    }

    @Test
    void noBlockOrUnreadableOrOtherKeyGivesEmpty() {
        assertThat(cards.parse("Не нашёл ничего.", "p0a1b2c3d")).isEmpty();
        assertThat(cards.parse("```json\n{ нет json \n```", "p0a1b2c3d")).isEmpty();
        assertThat(cards.parse("", "p0a1b2c3d")).isEmpty();
        assertThat(cards.parse(null, "p0a1b2c3d")).isEmpty();
        assertThat(cards.parse(GOOD, "p99999999")).isEmpty();
        assertThat(cards.parse("```json\n[1,2]\n```", "p0a1b2c3d")).isEmpty();
    }

    @Test
    void repairsSmartQuotesAndTruncatedAnswer() {
        String cut = """
                ```json
                {"p0a1b2c3d": {"brand": "VGN", "overall": 80},
                 "p1f2e3d4c": {"brand": "Lamzu", "spec
                """;

        Optional<CardDraft> first = cards.parse(cut, "p0a1b2c3d");

        assertThat(first).isPresent();
        assertThat(first.get().brand()).isEqualTo("VGN");
        assertThat(cards.parse(cut, "p1f2e3d4c")).isEmpty();
        String smart = "{\"p0a1b2c3d\": {\"notes\": “текст”}}";
        assertThat(cards.parse(smart, "p0a1b2c3d").orElseThrow().notes()).isEqualTo("текст");
    }

    @Test
    void toImportItemWithAiTitle() {
        CardDraft d = cards.parse(GOOD, "p0a1b2c3d").orElseThrow();

        CardImportItem it = cards.toImportItem("prod-1", d, true);

        assertThat(it.productId()).isEqualTo("prod-1");
        assertThat(it.categorySlug()).isNull();
        assertThat(it.title()).isNull();
        assertThat(it.publish()).isFalse();
        assertThat(it.markReady()).isFalse();
        assertThat(it.specs()).containsOnlyKeys("weight_g", "sensor", "dpi");
        assertThat(it.confidence()).containsOnlyKeys("weight_g", "sensor", "dpi");
        assertThat(it.overall()).isEqualTo(92);
        assertThat(it.description()).isEqualTo("Лёгкая мышь.\nДля шутеров.");
        assertThat(it.translations().get("uk").title()).isEqualTo("Мишка VGN F2");
        assertThat(it.translations().get("en").description()).isEqualTo("Light mouse.\nFor shooters.");
        assertThat(it.sources()).containsExactly("https://vgnlab.com/f2");
        assertThat(it.notes()).isEqualTo("Вес без кабеля.");
        assertThat(it.fieldSources()).containsKey("sensor");
    }

    @Test
    void toImportItemWithoutAiTitleLeavesTitleTranslationsOut() {
        CardDraft d = cards.parse(GOOD, "p0a1b2c3d").orElseThrow();

        CardImportItem it = cards.toImportItem("prod-1", d, false);

        assertThat(it.translations().get("uk").title()).isNull();
        assertThat(it.translations().get("uk").description()).isEqualTo("Легка мишка.\nДля шутерів.");
        assertThat(it.translations().get("en").title()).isNull();
    }

    @Test
    void toImportItemOfEmptyDraftHasNoOptionalParts() {
        CardDraft d = cards.parse("{\"p0a1b2c3d\": {}}", "p0a1b2c3d").orElseThrow();

        CardImportItem it = cards.toImportItem("prod-1", d, true);

        assertThat(it.specs()).isEmpty();
        assertThat(it.description()).isNull();
        assertThat(it.translations()).isNull();
        assertThat(it.sources()).isNull();
        assertThat(it.fieldSources()).isNull();
    }
}
