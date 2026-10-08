package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** AI cards: merge vs replace, statuses, category/brand resolution, publishing, translations. */
class CardsServiceTest {

    InMemoryCatalog db;
    CardsService service;
    Category mice;
    Category keyboards;
    Product mouse;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        BrandAdminService brands = new BrandAdminService(db.brandRepository, db.productRepository, db.directory);
        service = new CardsService(db.productRepository, db.directory, brands, db.translationRepository,
                mock(TranslationService.class));
        mice = db.category("myshki", "Мыши", null);
        keyboards = db.category("klaviatury", "Клавиатуры", null);
        db.category("klv-magnitnye", "Магнитные", keyboards);
        SpecAttribute weight = new SpecAttribute();
        weight.setId(UuidUtil.randomBytes());
        weight.setCategoryId(mice.getId());
        weight.setKey("weight_g");
        weight.setLabelRu("Вес");
        weight.setLabelUk("Вага");
        weight.setLabelEn("Weight");
        weight.setType(SpecType.NUMBER);
        weight.setGroupKey("main");
        weight.setRequired(true);
        db.attributes.add(weight);
        SpecAttribute wireless = new SpecAttribute();
        wireless.setId(UuidUtil.randomBytes());
        wireless.setCategoryId(mice.getId());
        wireless.setKey("wireless");
        wireless.setLabelRu("Беспроводная");
        wireless.setLabelUk("Бездротова");
        wireless.setLabelEn("Wireless");
        wireless.setType(SpecType.BOOL);
        wireless.setGroupKey("main");
        db.attributes.add(wireless);
        Brand lamzu = new Brand();
        lamzu.setId(UuidUtil.randomBytes());
        lamzu.setName("Lamzu");
        lamzu.setSlug("lamzu");
        lamzu.setAliasList(List.of("LAMZU MAYA"));
        db.brands.add(lamzu);

        mouse = db.product("Lamzu Maya", mice);
        mouse.setDescription("Старое описание");
        mouse.setSpecsJson("{\"wireless\":true}");
    }

    private String id() {
        return UuidUtil.toString(mouse.getId());
    }

    private static CardImportItem item(String productId, String categorySlug, String brand, Map<String, Object> specs,
                                       String description, Boolean markReady, Boolean publish,
                                       Map<String, CardTranslation> translations) {
        return new CardImportItem(productId, categorySlug, brand, specs, Map.of("weight_g", 95), 90, description,
                List.of("https://lamzu.com"), "заметка", "gpt", markReady, null, null, null, translations, publish);
    }

    @Test
    void mergeKeepsAbsentKeysAndReplaceDropsThem() {
        service.importCards(new CardsImportRequest(List.of(item(id(), null, null, Map.of("weight_g", 49), null,
                false, false, null)), false), 1L);
        assertThat(SpecsJson.readMap(mouse.getSpecsJson())).containsEntry("weight_g", 49).containsEntry("wireless", true);
        assertThat(mouse.getCardStatus()).isEqualTo(CardStatus.AI_FILLED);
        assertThat(mouse.getCardConfidence()).isEqualTo(90);
        assertThat(SpecsJson.readMap(mouse.getCardMetaJson())).containsKeys("fields", "sources", "notes", "importedAt");

        service.importCards(new CardsImportRequest(List.of(item(id(), null, null, Map.of("weight_g", 50), null,
                true, false, null)), true), 7L);
        assertThat(SpecsJson.readMap(mouse.getSpecsJson())).containsOnlyKeys("weight_g");
        assertThat(mouse.getCardStatus()).isEqualTo(CardStatus.READY);
        assertThat(SpecsJson.readMap(mouse.getCardMetaJson())).containsEntry("reviewedBy", 7);
    }

    @Test
    void unknownOrParentCategoryIsAnIssueAndTheRestApplies() {
        CardsImportResult r = service.importCards(new CardsImportRequest(List.of(
                item(id(), "nope", null, Map.of("weight_g", 49, "dpi", 1), null, false, false, null)), false), 1L);
        assertThat(r.applied()).isEqualTo(1);
        assertThat(r.issues()).extracting(CatalogDtos.CardIssue::reason).containsExactlyInAnyOrder("UNKNOWN_CATEGORY",
                "UNKNOWN_KEY");
        assertThat(SpecsJson.readMap(mouse.getSpecsJson())).containsEntry("weight_g", 49);

        r = service.importCards(new CardsImportRequest(List.of(item(id(), "klaviatury", null, null, null, false,
                false, null)), false), 1L);
        assertThat(r.issues()).extracting(CatalogDtos.CardIssue::reason).containsExactly("CATEGORY_NOT_LEAF");
        assertThat(mouse.getCategoryId()).isEqualTo(mice.getId());

        r = service.importCards(new CardsImportRequest(List.of(
                new CardImportItem("00000000-0000-0000-0000-000000000000", null, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null)), false), 1L);
        assertThat(r.rejected()).extracting(CatalogDtos.CardRejected::reason).containsExactly("NOT_FOUND");
    }

    @Test
    void brandsAreFoundByAliasOrCreated() {
        CardsImportResult r = service.importCards(new CardsImportRequest(List.of(
                item(id(), null, "lamzu maya", null, null, false, false, null)), false), 1L);
        assertThat(r.createdBrands()).isEmpty();
        assertThat(UuidUtil.toString(mouse.getBrandId())).isEqualTo(UuidUtil.toString(db.brands.get(0).getId()));

        r = service.importCards(new CardsImportRequest(List.of(
                item(id(), null, "VAXEE", null, null, false, false, null)), false), 1L);
        assertThat(r.createdBrands()).containsExactly("VAXEE");
        assertThat(db.brands).extracting(Brand::getSlug).contains("vaxee");
    }

    @Test
    void publishNeedsAFinishedPublishableCard() {
        mouse.setActive(false);
        mouse.setUnfinished(true);
        // only a brand → no content → stays DRAFT → not published
        CardsImportResult r = service.importCards(new CardsImportRequest(List.of(
                item(id(), null, "Lamzu", null, null, false, true, null)), false), 1L);
        assertThat(r.items().get(0).published()).isFalse();
        assertThat(r.items().get(0).reason()).isEqualTo("CARD_NOT_READY");

        mouse.setPriceMinor(0);
        r = service.importCards(new CardsImportRequest(List.of(
                item(id(), null, null, Map.of("weight_g", 49), null, false, true, null)), false), 1L);
        assertThat(r.items().get(0).reason()).isEqualTo("NOT_PUBLISHABLE: price");
        assertThat(mouse.isActive()).isFalse();

        mouse.setPriceMinor(1000_00);
        r = service.importCards(new CardsImportRequest(List.of(
                item(id(), null, null, Map.of("weight_g", 49), null, false, true, null)), false), 1L);
        assertThat(r.items().get(0).published()).isTrue();
        assertThat(mouse.isActive()).isTrue();
        assertThat(mouse.isUnfinished()).isFalse();
    }

    @Test
    void translationsAreWrittenForTheNewSourceAndManualOnesAreKept() {
        ContentTranslation manual = new ContentTranslation(new ContentTranslationId(TranslationEntityType.PRODUCT,
                mouse.getId(), TranslationEntityType.DESCRIPTION, "en"));
        manual.setText("Hand-made");
        manual.setSourceHash("x");
        manual.setOrigin(TranslationOrigin.MANUAL);
        db.translations.add(manual);

        CardsImportResult r = service.importCards(new CardsImportRequest(List.of(item(id(), null, null, null,
                "Новое описание", false, false, Map.of(
                        "uk", new CardTranslation("Lamzu Maya укр", "Новий опис", null),
                        "en", new CardTranslation(null, "New description", "  ")))), false), 1L);

        assertThat(mouse.getDescription()).isEqualTo("Новое описание");
        assertThat(r.items().get(0).translated()).containsEntry("uk", 2).containsEntry("en", 0);
        assertThat(r.items().get(0).skippedManual()).isEqualTo(1);
        assertThat(r.issues()).extracting(CatalogDtos.CardIssue::reason).contains("INVALID_TEXT_BLANK");
        ContentTranslation desc = db.translations.stream()
                .filter(t -> t.getId().getField().equals("description") && t.getId().getLocale().equals("uk"))
                .findFirst().orElseThrow();
        assertThat(desc.getSourceHash()).isEqualTo(TranslationService.sha256Hex("Новое описание"));
        assertThat(manual.getText()).isEqualTo("Hand-made");
    }

    @Test
    void statsAndExport() {
        Product hidden = db.product("Draft mouse", mice);
        hidden.setActive(false);
        hidden.setUnfinished(true);
        Product legacy = db.product("Sold out mouse", mice); // hidden long ago, never «unfinished»
        legacy.setActive(false);
        mouse.setActive(true);
        CatalogDtos.CardsStats st = service.stats();
        assertThat(st.draft()).isEqualTo(3);
        assertThat(st.unfinished()).isEqualTo(1);
        assertThat(st.incomplete()).isEqualTo(1); // the active mouse misses weight_g

        List<CatalogDtos.CardExportItem> items = service.export("incomplete", null);
        assertThat(items).hasSize(1);
        assertThat(items.get(0).missingRequired()).containsExactly("weight_g");
        assertThat(items.get(0).categorySlug()).isEqualTo("myshki");
        assertThat(service.export("unfinished", null)).extracting(CatalogDtos.CardExportItem::title)
                .containsExactly("Draft mouse");
        assertThat(service.export("unfinished", null).get(0).unfinished()).isTrue();
        assertThat(service.export("all", id())).hasSize(1);
    }
}
