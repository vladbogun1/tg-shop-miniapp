package com.maxsolch.shop.catalog;

import com.maxsolch.shop.catalog.CatalogDtos.CardImportItem;
import com.maxsolch.shop.catalog.CatalogDtos.CardTranslation;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportRequest;
import com.maxsolch.shop.catalog.CatalogDtos.CardsImportResult;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.catalog.CatalogDtos.CardAcceptRequest;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationOrigin;
import com.maxsolch.shop.translation.TranslationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** AI cards: merge vs replace, statuses, category/brand resolution, publishing, translations. */
class CardsServiceTest {

    InMemoryCatalog db;
    CardsService service;
    Category mice;
    Category keyboards;
    Product mouse;
    AdminUserRepository admins;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        BrandAdminService brands = new BrandAdminService(db.brandRepository, db.productRepository, db.directory,
                mock(ImageStorageService.class));
        admins = mock(AdminUserRepository.class);
        service = new CardsService(db.productRepository, db.directory, brands, db.translationRepository,
                mock(TranslationService.class), admins);
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
                List.of("https://lamzu.com"), "заметка", "gpt", markReady, null, null, null, translations, publish,
                Map.of("weight_g", "https://lamzu.com/maya", "wireless", "not a url"));
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
                        null, null, null, null, null, null, null, null, null)), false), 1L);
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
        assertThat(st.draft()).isEqualTo(2); // the legacy hidden one is not work
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

    @SuppressWarnings("unchecked")
    private Map<String, Object> last() {
        return (Map<String, Object>) SpecsJson.readMap(mouse.getCardMetaJson()).get("last");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> at(Map<String, Object> m, String... path) {
        Map<String, Object> cur = m;
        for (String k : path) {
            cur = (Map<String, Object>) cur.get(k);
        }
        return cur;
    }

    @Test
    void importKeepsASnapshotOfWhatChangedAndTheNextImportReplacesIt() {
        mouse.setTitle("Lamzu Maya old");
        service.importCards(new CardsImportRequest(List.of(new CardImportItem(id(), null, "VAXEE",
                Map.of("weight_g", 49, "wireless", true), Map.of("weight_g", 95, "wireless", 40), 90, "Новое описание",
                List.of("https://lamzu.com"), null, "gpt", false, null, null, "Lamzu Maya", Map.of(
                        "uk", new CardTranslation("Lamzu Maya", null, null)),
                null, Map.of("weight_g", "https://lamzu.com/maya"))), false), 1L);

        Map<String, Object> changed = at(last(), "changed");
        assertThat(last()).containsKeys("at").containsEntry("model", "gpt");
        assertThat(at(changed, "brand")).containsEntry("before", null).containsEntry("after", "VAXEE");
        assertThat(changed).doesNotContainKey("category");
        // wireless was true already → not a change; weight_g is new, with confidence and source
        assertThat(at(changed, "specs")).containsOnlyKeys("weight_g");
        assertThat(at(changed, "specs", "weight_g")).containsEntry("before", null).containsEntry("after", 49)
                .containsEntry("c", 95).containsEntry("src", "https://lamzu.com/maya");
        assertThat(at(changed, "texts")).containsOnlyKeys("ru/title", "ru/description", "uk/title");
        assertThat(at(changed, "texts", "ru/description")).containsEntry("before", "Старое описание")
                .containsEntry("after", "Новое описание");
        assertThat(at(changed, "texts", "ru/title")).containsEntry("before", "Lamzu Maya old");
        // the per-field journal keeps the source too
        assertThat(at(SpecsJson.readMap(mouse.getCardMetaJson()), "fields", "weight_g"))
                .containsEntry("c", 95).containsEntry("src", "https://lamzu.com/maya");

        // the next AI import replaces the snapshot: only its own changes
        service.importCards(new CardsImportRequest(List.of(item(id(), null, null, Map.of("weight_g", 50), null,
                false, false, null)), false), 1L);
        changed = at(last(), "changed");
        assertThat(changed).doesNotContainKey("brand");
        assertThat(at(changed, "specs", "weight_g")).containsEntry("before", 49).containsEntry("after", 50)
                .containsEntry("src", "https://lamzu.com/maya");
        assertThat(at(changed, "texts")).isEmpty();
    }

    @Test
    void acceptMergesTheAdminsEditsIntoTheSnapshotAndMarksReady() {
        service.importCards(new CardsImportRequest(List.of(item(id(), null, null, Map.of("weight_g", 49), null,
                false, false, null)), false), 1L);
        assertThat(mouse.getCardStatus()).isEqualTo(CardStatus.AI_FILLED);
        ContentTranslation manualText = new ContentTranslation(new ContentTranslationId(TranslationEntityType.PRODUCT,
                mouse.getId(), TranslationEntityType.DESCRIPTION, "en"));
        manualText.setText("Old");
        manualText.setSourceHash("x");
        manualText.setOrigin(TranslationOrigin.MANUAL);
        db.translations.add(manualText);

        service.accept(id(), new CardAcceptRequest(null, null, Map.of("weight_g", 52, "wireless", false),
                Map.of("en", new CardTranslation(null, "Edited", null)), null), 7L);

        assertThat(mouse.getCardStatus()).isEqualTo(CardStatus.READY);
        assertThat(SpecsJson.readMap(mouse.getSpecsJson())).containsEntry("weight_g", 52).containsEntry("wireless", false);
        Map<String, Object> changed = at(last(), "changed");
        // weight_g: «before» stays what it was before the AI, «after» is the admin's value
        assertThat(at(changed, "specs", "weight_g")).containsEntry("before", null).containsEntry("after", 52)
                .containsEntry("c", 95).containsEntry("edited", true);
        assertThat(at(changed, "specs", "wireless")).containsEntry("before", true).containsEntry("after", false)
                .containsEntry("edited", true);
        assertThat(at(changed, "texts", "en/description")).containsEntry("before", "Old")
                .containsEntry("after", "Edited");
        assertThat(last()).containsKey("editedAt");
        // the admin's own text overwrites even a MANUAL one and stays MANUAL
        assertThat(manualText.getText()).isEqualTo("Edited");
        assertThat(manualText.getOrigin()).isEqualTo(TranslationOrigin.MANUAL);
        assertThat(SpecsJson.readMap(mouse.getCardMetaJson())).containsEntry("reviewedBy", 7);

        // plain «Принять» without edits: only the status, the snapshot is untouched
        mouse.setCardStatus(CardStatus.AI_FILLED);
        Map<String, Object> before = last();
        service.accept(id(), null, 7L);
        assertThat(mouse.getCardStatus()).isEqualTo(CardStatus.READY);
        assertThat(last()).isEqualTo(before);
    }

    @Test
    void reviewNamesTheReviewerAndShowsTheTexts() {
        AdminUser admin = new AdminUser();
        admin.setTelegramUserId(7L);
        admin.setName("Влад");
        when(admins.findById(7L)).thenReturn(Optional.of(admin));
        service.importCards(new CardsImportRequest(List.of(item(id(), null, null, Map.of("weight_g", 49),
                "Новое описание", true, false, Map.of("uk", new CardTranslation(null, "Новий опис", null)))),
                false), 7L);

        CatalogDtos.CardReview r = service.review(id());
        assertThat(r.reviewedBy()).isEqualTo(7L);
        assertThat(r.reviewedByName()).isEqualTo("Влад");
        assertThat(r.reviewedAt()).isNotNull();
        assertThat(r.last()).containsKey("changed");
        assertThat(r.item().cardStatus()).isEqualTo("READY");
        assertThat(r.translations().get("uk").get("description").text()).isEqualTo("Новий опис");
        assertThat(r.translations().get("uk").get("description").stale()).isFalse();
        assertThat(r.translations().get("en")).isEmpty();

        mouse.setDescription("Ещё новее");
        assertThat(service.review(id()).translations().get("uk").get("description").stale()).isTrue();
    }
}
