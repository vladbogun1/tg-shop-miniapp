package com.maxsolch.shop.translation.app;

import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.domain.TranslationOrigin;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.domain.ReplyTemplate;
import com.maxsolch.shop.repository.ReplyTemplateRepository;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.infra.ProductVariantRepository;
import com.maxsolch.shop.catalog.infra.CategoryRepository;
import com.maxsolch.shop.translation.app.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.app.TranslationDtos.ImportResult;
import com.maxsolch.shop.platform.error.DomainException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TranslationAdminServiceTest {

    private static final String PRODUCT = "11111111-1111-1111-1111-111111111111";
    private static final String ARCHIVED = "66666666-6666-6666-6666-666666666666";
    private static final String TAG = "33333333-3333-3333-3333-333333333333";
    private static final String VARIANT = "44444444-4444-4444-4444-444444444444";
    private static final String TITLE = "Ковер";
    private static final String HASH = SourceHash.sha256Hex(TITLE);

    ContentTranslationRepository repo;
    ProductRepository products;
    ProductVariantRepository variants;
    CategoryRepository tags;
    PaymentOptionRepository payments;
    ReplyTemplateRepository templates;
    TranslationService translationService;
    com.maxsolch.shop.platform.tx.DomainEvents events;
    TranslationAdminService service;
    TranslationReport report;
    TranslationImport imports;
    TranslationSourceFix fixes;
    com.maxsolch.shop.translation.app.BotTexts botTexts;

    @BeforeEach
    void setUp() {
        repo = mock(ContentTranslationRepository.class);
        products = mock(ProductRepository.class);
        variants = mock(ProductVariantRepository.class);
        tags = mock(CategoryRepository.class);
        payments = mock(PaymentOptionRepository.class);
        templates = mock(ReplyTemplateRepository.class);
        translationService = mock(TranslationService.class);
        events = mock(com.maxsolch.shop.platform.tx.DomainEvents.class);

        List<Object[]> productRows = new ArrayList<>();
        productRows.add(new Object[]{UuidUtil.toBytes(PRODUCT), TITLE, "Описание", null, "", true, false});
        productRows.add(new Object[]{UuidUtil.toBytes(ARCHIVED), "Старый", null, null, null, true, true});
        when(products.translationSources()).thenReturn(productRows);
        when(variants.translationSources()).thenReturn(List.of());
        Category tag = new Category();
        tag.setId(UuidUtil.toBytes(TAG));
        tag.setName("Ковры");
        when(tags.findAll()).thenReturn(List.of(tag));
        PaymentOption inactive = new PaymentOption();
        inactive.setId(UuidUtil.randomBytes());
        inactive.setTitle("Старая оплата");
        inactive.setActive(false);
        when(payments.findAll()).thenReturn(List.of(inactive));
        when(repo.findByLocale(anyString())).thenReturn(List.of());

        botTexts = mock(com.maxsolch.shop.translation.app.BotTexts.class);
        List<TranslatableSource> sources = List.of(new com.maxsolch.shop.catalog.app.CatalogTranslatableSource(products, variants, tags),
                        new com.maxsolch.shop.payment.app.PaymentTranslatableSource(payments),
                        new com.maxsolch.shop.service.ReplyTemplateTranslatableSource(templates),
                        new BotTextSource(botTexts));
        TranslationRows store = new TranslationRows(repo, events, sources);
        report = new TranslationReport(store, botTexts);
        imports = new TranslationImport(repo, store, java.time.Clock.systemUTC());
        fixes = new TranslationSourceFix(repo, store, sources);
        service = new TranslationAdminService(repo, store);
    }

    private static ImportItem item(String field, String hash, String text) {
        return new ImportItem("PRODUCT", PRODUCT, field, hash, text);
    }

    private static ContentTranslation existing(TranslationOrigin origin) {
        ContentTranslation t = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(PRODUCT), "title", "uk"));
        t.setText("Старий");
        t.setSourceHash(HASH);
        t.setOrigin(origin);
        t.markNotNew();
        return t;
    }

    @SuppressWarnings("unchecked")
    private List<ContentTranslation> saved() {
        ArgumentCaptor<Collection<ContentTranslation>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(repo).saveAll(captor.capture());
        return new ArrayList<>(captor.getValue());
    }

    @Test
    void appliesWhenHashMatchesCurrentSource() {
        ImportResult r = imports.importTranslations(
                new ImportRequest("uk", null, null, List.of(item("title", HASH.toUpperCase(), "Килимок"))), 42L);

        assertThat(r.applied()).isEqualTo(1);
        assertThat(r.rejected()).isEmpty();
        ContentTranslation row = saved().get(0);
        assertThat(row.getText()).isEqualTo("Килимок");
        assertThat(row.getSourceHash()).isEqualTo(HASH);
        assertThat(row.getOrigin()).isEqualTo(TranslationOrigin.AI);
        assertThat(row.getUpdatedBy()).isEqualTo(42L);
        assertThat(row.isNew()).isTrue();
        assertThat(row.getId().getLocale()).isEqualTo("uk");
        verify(events).publish(any(com.maxsolch.shop.translation.domain.TranslationsChanged.class));
    }

    @Test
    void staleHashIsRejected() {
        ImportResult r = imports.importTranslations(new ImportRequest("uk", null, null,
                List.of(item("title", SourceHash.sha256Hex("Ковёр"), "Килимок"))), 1L);

        assertThat(r.applied()).isZero();
        assertThat(r.skippedStale()).isEqualTo(1);
        assertThat(r.rejected()).extracting(TranslationDtos.Rejected::reason).containsExactly("STALE");
        verify(repo, never()).saveAll(any());
    }

    @Test
    void manualRowIsProtectedUnlessForced() {
        when(repo.findByLocale("uk")).thenReturn(List.of(existing(TranslationOrigin.MANUAL)));

        ImportResult r = imports.importTranslations(
                new ImportRequest("uk", "AI", false, List.of(item("title", HASH, "Килимок"))), 1L);
        assertThat(r.skippedManual()).isEqualTo(1);
        assertThat(r.applied()).isZero();
        verify(repo, never()).saveAll(any());

        ImportResult forced = imports.importTranslations(
                new ImportRequest("uk", "AI", true, List.of(item("title", HASH, "Килимок"))), 1L);
        assertThat(forced.applied()).isEqualTo(1);
        ContentTranslation row = saved().get(0);
        assertThat(row.getText()).isEqualTo("Килимок");
        assertThat(row.getOrigin()).isEqualTo(TranslationOrigin.AI);
        assertThat(row.isNew()).isFalse();
    }

    @Test
    void aiRowIsOverwrittenAndManualOriginIsStored() {
        when(repo.findByLocale("uk")).thenReturn(List.of(existing(TranslationOrigin.AI)));

        ImportResult r = imports.importTranslations(
                new ImportRequest("uk", "manual", null, List.of(item("title", HASH, "Килимок"))), 7L);

        assertThat(r.applied()).isEqualTo(1);
        assertThat(saved().get(0).getOrigin()).isEqualTo(TranslationOrigin.MANUAL);
    }

    @Test
    void invalidItemsAreCountedNotApplied() {
        String tooLong = "я".repeat(TranslationLimits.MAX_TEXT_CHARS + 1);
        ImportResult r = imports.importTranslations(new ImportRequest("en", null, null, List.of(
                item("slug", HASH, "x"),                                    // field not translatable
                new ImportItem("VARIANT", PRODUCT, "title", HASH, "x"),     // field of another type
                new ImportItem("BANNER", PRODUCT, "title", HASH, "x"),      // unknown type
                new ImportItem("PRODUCT", "not-a-uuid", "title", HASH, "x"),
                item("title", "abc", "x"),                                  // malformed hash
                item("title", HASH, "   "),                                 // blank text
                item("title", HASH, tooLong))), 1L);

        assertThat(r.invalid()).isEqualTo(7);
        assertThat(r.applied()).isZero();
        assertThat(r.rejected()).extracting(TranslationDtos.Rejected::reason).containsExactly(
                "INVALID_FIELD", "INVALID_FIELD", "INVALID_ENTITY_TYPE", "INVALID_ENTITY_ID",
                "INVALID_SOURCE_HASH", "INVALID_TEXT_BLANK", "INVALID_TEXT_TOO_LONG");
    }

    @Test
    void unknownEntityOrEmptySourceIsNotFound() {
        ImportResult r = imports.importTranslations(new ImportRequest("uk", null, null, List.of(
                new ImportItem("PRODUCT", "77777777-7777-7777-7777-777777777777", "title", HASH, "x"),
                item("seo_title", HASH, "x"),          // null source
                item("seo_description", HASH, "x")     // empty source
        )), 1L);

        assertThat(r.notFound()).isEqualTo(3);
        assertThat(r.rejected()).extracting(TranslationDtos.Rejected::reason)
                .containsExactly("NOT_FOUND", "NO_SOURCE", "NO_SOURCE");
    }

    @Test
    void localeMustBeUkOrEn() {
        assertThatThrownBy(() -> imports.importTranslations(new ImportRequest("ru", null, null, List.of()), 1L))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> report.export("de", "all", null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> service.delete(null, null, null)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> imports.importTranslations(new ImportRequest("uk", "ROBOT", null, List.of()), 1L))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void exportCoversLiveEntitiesWithStatus() {
        ContentTranslation staleRow = existing(TranslationOrigin.MANUAL);
        staleRow.setSourceHash(SourceHash.sha256Hex("Было"));
        when(repo.findByLocale("uk")).thenReturn(List.of(staleRow));

        List<ExportItem> all = report.export("uk", "all", null);
        // product title + description, tag name; archived product, inactive payment option and empty
        // sources are not exported
        assertThat(all).extracting(i -> i.entityType() + ":" + i.field())
                .containsExactly("PRODUCT:title", "PRODUCT:description", "CATEGORY:name");
        ExportItem title = all.get(0);
        assertThat(title.status()).isEqualTo("STALE");
        assertThat(title.source()).isEqualTo(TITLE);
        assertThat(title.sourceHash()).isEqualTo(HASH);
        assertThat(title.text()).isEqualTo("Старий");
        assertThat(title.origin()).isEqualTo("MANUAL");

        assertThat(report.export("uk", "missing", "product")).extracting(ExportItem::field)
                .containsExactly("description");
        assertThat(report.export("uk", "STALE", null)).hasSize(1);

        TranslationDtos.Counts product = report.stats().locales().get("uk").get("PRODUCT");
        assertThat(product).isEqualTo(new TranslationDtos.Counts(0, 1, 1, 0));
        assertThat(report.stats().locales().get("en").get("ALL")).isEqualTo(new TranslationDtos.Counts(0, 0, 3, 0));
        // Unique texts: every text lacks en, so all three are «missing» — each counted once.
        assertThat(report.stats().texts()).isEqualTo(new TranslationDtos.TextCounts(3, 0, 0, 0));
    }

    @Test
    void importStoresSourceSnapshot_andOnlyManualCountsAsReviewed() {
        imports.importTranslations(new ImportRequest("uk", "AI", null, List.of(item("title", HASH, "Килим"))), 1L);
        ContentTranslation ai = saved().get(0);
        assertThat(ai.getSourceText()).isEqualTo(TITLE);
        assertThat(ai.getReviewedAt()).isNull();
        assertThat(TranslationReport.isReviewed(ai)).isFalse();

        ContentTranslation manual = existing(TranslationOrigin.AI);
        when(repo.findByLocale("en")).thenReturn(List.of(manual));
        imports.importTranslations(new ImportRequest("en", "MANUAL", true, List.of(item("title", HASH, "Rug"))), 1L);
        assertThat(manual.getReviewedAt()).isNotNull();
        assertThat(manual.getSourceText()).isEqualTo(TITLE);
    }

    @Test
    void exportShowsPreviousSourceOfStaleRows_andReviewedFlag() {
        ContentTranslation stale = existing(TranslationOrigin.AI);
        stale.setSource("Ковёр старый");
        when(repo.findByLocale("uk")).thenReturn(List.of(stale));
        ExportItem title = report.export("uk", "all", null).get(0);
        assertThat(title.status()).isEqualTo("STALE");
        assertThat(title.prevSource()).isEqualTo("Ковёр старый");
        assertThat(title.reviewed()).isFalse();

        stale.setSource(TITLE);
        ExportItem current = report.export("uk", "all", null).get(0);
        assertThat(current.status()).isEqualTo("TRANSLATED");
        assertThat(current.prevSource()).isNull();
        assertThat(report.stats().locales().get("uk").get("PRODUCT").unreviewed()).isEqualTo(1);
    }

    @Test
    void acceptMarksReviewed_andRebindsStaleRowToCurrentSource() {
        ContentTranslation stale = existing(TranslationOrigin.AI);
        stale.setSource("Ковёр старый");
        when(repo.findByLocale("uk")).thenReturn(List.of(stale));

        TranslationDtos.AcceptResult r = imports.accept(new TranslationDtos.AcceptRequest(List.of(
                new TranslationDtos.AcceptItem("PRODUCT", PRODUCT, "title", "uk", HASH))), 7L);

        assertThat(r.accepted()).isEqualTo(1);
        assertThat(r.rebased()).isEqualTo(1);
        assertThat(stale.getSourceHash()).isEqualTo(HASH);
        assertThat(stale.getSourceText()).isEqualTo(TITLE);
        assertThat(stale.getReviewedAt()).isNotNull();
        assertThat(stale.getText()).isEqualTo("Старий");
        assertThat(stale.getOrigin()).isEqualTo(TranslationOrigin.AI);
    }

    @Test
    void acceptSkipsOutdatedHashMissingRowsAndGarbage() {
        ContentTranslation row = existing(TranslationOrigin.AI);
        when(repo.findByLocale("uk")).thenReturn(List.of(row));

        TranslationDtos.AcceptResult r = imports.accept(new TranslationDtos.AcceptRequest(List.of(
                new TranslationDtos.AcceptItem("PRODUCT", PRODUCT, "title", "uk",
                        SourceHash.sha256Hex("Было")),
                new TranslationDtos.AcceptItem("PRODUCT", PRODUCT, "description", "uk",
                        SourceHash.sha256Hex("Описание")),
                new TranslationDtos.AcceptItem("PRODUCT", PRODUCT, "title", "de", HASH))), 7L);

        assertThat(r).isEqualTo(new TranslationDtos.AcceptResult(0, 0, 1, 1, 1));
        assertThat(row.getReviewedAt()).isNull();
        verify(repo, never()).saveAll(any());
    }

    @Test
    void deleteNeedsEntityTypeForEntityId() {
        assertThatThrownBy(() -> service.delete("uk", null, PRODUCT)).isInstanceOf(DomainException.BadRequest.class);
        when(repo.deleteByLocaleAndEntity(any(), any(), any())).thenReturn(2);
        assertThat(service.delete("uk", "product", PRODUCT)).isEqualTo(2);
        verify(events).publish(any(com.maxsolch.shop.translation.domain.TranslationsChanged.class));
    }

    @Test
    void deleteSingleFieldNeedsEntityAndTranslatableField() {
        assertThatThrownBy(() -> service.delete("uk", "product", null, "title"))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> service.delete("uk", "product", PRODUCT, "slug"))
                .isInstanceOf(DomainException.BadRequest.class);
        when(repo.deleteByLocaleAndEntityAndField(any(), any(), any(), any())).thenReturn(1);
        assertThat(service.delete("uk", "product", PRODUCT, "title")).isEqualTo(1);
        verify(repo, never()).deleteByLocaleAndEntity(any(), any(), any());
    }

    @Test
    void exportCarriesOwningProduct() {
        List<Object[]> variantRows = new ArrayList<>();
        variantRows.add(new Object[]{UuidUtil.toBytes(VARIANT), "черный", true, false,
                UuidUtil.toBytes(PRODUCT), TITLE});
        when(variants.translationSources()).thenReturn(variantRows);

        List<ExportItem> all = report.export("en", "all", null);
        ExportItem title = all.stream().filter(i -> i.entityType().equals("PRODUCT")).findFirst().orElseThrow();
        assertThat(title.productId()).isEqualTo(PRODUCT);
        ExportItem variant = all.stream().filter(i -> i.entityType().equals("VARIANT")).findFirst().orElseThrow();
        assertThat(variant.productId()).isEqualTo(PRODUCT);
        assertThat(variant.productTitle()).isEqualTo(TITLE);
        ExportItem tag = all.stream().filter(i -> i.entityType().equals("CATEGORY")).findFirst().orElseThrow();
        assertThat(tag.productId()).isNull();
    }

    @Test
    void categorySeoFieldsAreExportedWithTheCategoryNameAsContext() {
        Category tag = new Category();
        tag.setId(UuidUtil.toBytes(TAG));
        tag.setName("Ковры");
        tag.setSeoTitle("Игровые коврики — купить");
        tag.setIntroText("Длинный текст");
        when(tags.findAll()).thenReturn(List.of(tag));

        List<ExportItem> tagItems = report.export("uk", "all", "category");
        assertThat(tagItems).extracting(ExportItem::field).containsExactly("name", "seo_title", "intro_text");
        assertThat(tagItems.get(0).productTitle()).isNull();
        assertThat(tagItems.get(1).productTitle()).isEqualTo("Ковры");
        assertThat(tagItems.get(1).productId()).isNull();

        ImportResult r = imports.importTranslations(new ImportRequest("uk", null, false, List.of(
                new ImportItem("CATEGORY", TAG, "intro_text", SourceHash.sha256Hex("Длинный текст"), "Довгий текст"),
                new ImportItem("CATEGORY", TAG, "h1", SourceHash.sha256Hex("x"), "y"))), 1L);
        assertThat(r.applied()).isEqualTo(1);
        assertThat(r.notFound()).isEqualTo(1); // h1 is empty: NO_SOURCE
    }

    @Test
    void sourceFixOfACategorySeoFieldSkipsTheNameCheck() {
        Category tag = new Category();
        tag.setId(UuidUtil.toBytes(TAG));
        tag.setName("Ковры");
        tag.setH1("Игровые ковирки");
        when(tags.findById(any())).thenReturn(Optional.of(tag));

        TranslationDtos.SourceFixResult r = fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("CATEGORY", TAG, "h1", SourceHash.sha256Hex("Игровые ковирки"))),
                "Игровые коврики", null), 1L);

        assertThat(r.updated()).isEqualTo(1);
        assertThat(tag.getH1()).isEqualTo("Игровые коврики");
        assertThat(tag.getName()).isEqualTo("Ковры");
    }

    private static final String BOT_KEY = "bot.preorder.arrived";
    private static final String BOT_RU = "Приехало: {0}";

    private void shipped(String currentRu) {
        when(botTexts.sourceRu(BOT_KEY)).thenReturn(currentRu);
        when(botTexts.builtinRu(BOT_KEY)).thenReturn(BOT_RU);
        when(botTexts.builtin("uk", BOT_KEY)).thenReturn("Приїхало: {0}");
        when(botTexts.builtin("en", BOT_KEY)).thenReturn("Arrived: {0}");
    }

    @Test
    void shippedBotTextsAreATranslationNotATodo() {
        shipped(BOT_RU);

        var items = report.export("uk", null, "BOT_TEXT");

        assertThat(items).hasSize(1);
        assertThat(items.get(0).status()).isEqualTo("TRANSLATED");
        assertThat(items.get(0).text()).isEqualTo("Приїхало: {0}");
        assertThat(items.get(0).reviewed()).isTrue();
        assertThat(report.export("en", "missing", "BOT_TEXT")).isEmpty();
        var counts = report.stats().locales().get("uk").get("BOT_TEXT");
        assertThat(counts.missing()).isZero();
        assertThat(counts.translated()).isEqualTo(1);
        assertThat(counts.unreviewed()).isZero();
    }

    @Test
    void shippedBotTextsGoStaleWhenTheRussianSourceIsEdited() {
        shipped("Уже здесь: {0}");

        var items = report.export("uk", null, "BOT_TEXT");

        assertThat(items).singleElement().satisfies(i -> {
            assertThat(i.status()).isEqualTo("STALE");
            assertThat(i.prevSource()).isEqualTo(BOT_RU);
        });
        assertThat(report.stats().locales().get("en").get("BOT_TEXT").stale()).isEqualTo(1);
    }

    private TranslationDtos.SourceFixResult fixBotText(String sourceHash, String newText) {
        return fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("BOT_TEXT",
                        com.maxsolch.shop.translation.app.BotTexts.idStringOf(BOT_KEY), "body", sourceHash)),
                newText, null), 1L);
    }

    @Test
    void sourceFixOfABotTextSavesTheRussianOverride() {
        when(botTexts.sourceRu(BOT_KEY)).thenReturn(BOT_RU);
        when(botTexts.saveRu(BOT_KEY, "Уже здесь: {0}")).thenReturn(true);

        TranslationDtos.SourceFixResult r = fixBotText(SourceHash.sha256Hex(BOT_RU), "Уже здесь: {0}");

        assertThat(r.updated()).isEqualTo(1);
        verify(botTexts).saveRu(BOT_KEY, "Уже здесь: {0}");
    }

    @Test
    void sourceFixOfABotTextIsSkippedWhenItChangedMeanwhile() {
        when(botTexts.sourceRu(BOT_KEY)).thenReturn("Другой текст {0}");

        TranslationDtos.SourceFixResult r = fixBotText(SourceHash.sha256Hex(BOT_RU), "Уже здесь: {0}");

        assertThat(r.skippedStale()).isEqualTo(1);
        verify(botTexts, never()).saveRu(anyString(), anyString());
    }

    @Test
    void sourceFixOfABotTextWithLostPlaceholdersIsInvalid() {
        when(botTexts.sourceRu(BOT_KEY)).thenReturn(BOT_RU);
        when(botTexts.saveRu(anyString(), anyString())).thenReturn(false);

        TranslationDtos.SourceFixResult r = fixBotText(SourceHash.sha256Hex(BOT_RU), "Уже здесь");

        assertThat(r.updated()).isZero();
        assertThat(r.invalid()).isEqualTo(1);
    }

    private Product product() {
        Product p = new Product();
        p.setId(UuidUtil.toBytes(PRODUCT));
        p.setTitle("Ковер черрный");
        p.setDescription("Описание");
        return p;
    }

    @Test
    void sourceFixReplacesSourceAndWritesTranslationsOfTheNewSource() {
        Product p = product();
        when(products.findById(any())).thenReturn(Optional.of(p));
        when(repo.findByLocale("uk")).thenReturn(List.of(existing(TranslationOrigin.MANUAL)));
        String oldHash = SourceHash.sha256Hex("Ковер черрный");

        TranslationDtos.SourceFixResult r = fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", oldHash)),
                "Ковер черный", Map.of("uk", "Килимок чорний", "en", "Mouse Pad, Black")), 5L);

        assertThat(r.updated()).isEqualTo(1);
        assertThat(r.translationsApplied()).isEqualTo(2);
        String newHash = SourceHash.sha256Hex("Ковер черный");
        assertThat(r.sourceHash()).isEqualTo(newHash);
        assertThat(p.getTitle()).isEqualTo("Ковер черный");
        List<ContentTranslation> rows = saved();
        assertThat(rows).hasSize(2).allSatisfy(t -> {
            assertThat(t.getSourceHash()).isEqualTo(newHash);
            assertThat(t.getOrigin()).isEqualTo(TranslationOrigin.AI);
            assertThat(t.getUpdatedBy()).isEqualTo(5L);
        });
        assertThat(rows).extracting(ContentTranslation::getText)
                .containsExactlyInAnyOrder("Килимок чорний", "Mouse Pad, Black");
        verify(events).publish(any(com.maxsolch.shop.translation.domain.TranslationsChanged.class));
    }

    @Test
    void sourceFixSkipsFieldChangedSinceExport() {
        Product p = product();
        when(products.findById(any())).thenReturn(Optional.of(p));

        TranslationDtos.SourceFixResult r = fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title",
                        SourceHash.sha256Hex("что-то другое"))),
                "Ковер черный", Map.of("uk", "Килимок чорний")), 5L);

        assertThat(r.updated()).isZero();
        assertThat(r.skippedStale()).isEqualTo(1);
        assertThat(p.getTitle()).isEqualTo("Ковер черрный");
        verify(repo, never()).saveAll(any());
    }

    @Test
    void sourceFixValidatesInput() {
        assertThatThrownBy(() -> fixes.fixSource(new TranslationDtos.SourceFixRequest(List.of(), "x", null), 1L))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", HASH)), " ", null), 1L))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", HASH)), "x",
                Map.of("ru", "x")), 1L))
                .isInstanceOf(DomainException.BadRequest.class);
        TranslationDtos.SourceFixResult r = fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", HASH)), "я".repeat(256), null), 1L);
        assertThat(r.invalid()).isEqualTo(1);
        assertThat(r.rejected()).extracting(TranslationDtos.Rejected::reason)
                .containsExactly("INVALID_SOURCE_TOO_LONG");
    }

    @Test
    void replyTemplatesAreExportedWithTheirTitle_andImportedLikeAnyField() {
        ReplyTemplate t = new ReplyTemplate();
        t.setId(7L);
        t.setTitle("Товар выслан");
        t.setBodyRu("{name}, заказ #{orderNo} отправлен.");
        when(templates.findAll()).thenReturn(List.of(t));
        when(templates.findById(7L)).thenReturn(Optional.of(t));
        String key = ReplyTemplate.translationKey(7L);

        List<ExportItem> items = report.export("uk", "missing", "reply_template");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).entityId()).isEqualTo(key);
        assertThat(items.get(0).field()).isEqualTo("body");
        assertThat(items.get(0).productTitle()).isEqualTo("Товар выслан");
        assertThat(items.get(0).productId()).isNull();

        ImportResult r = imports.importTranslations(new ImportRequest("uk", null, false, List.of(
                new ImportItem("REPLY_TEMPLATE", key, "body", SourceHash.sha256Hex(t.getBodyRu()),
                        "{name}, замовлення #{orderNo} відправлено."))), 1L);
        assertThat(r.applied()).isEqualTo(1);

        TranslationDtos.SourceFixResult fix = fixes.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("REPLY_TEMPLATE", key, "body",
                        SourceHash.sha256Hex(t.getBodyRu()))),
                "{name}, ваш заказ #{orderNo} отправлен.", Map.of()), 1L);
        assertThat(fix.updated()).isEqualTo(1);
        assertThat(t.getBodyRu()).isEqualTo("{name}, ваш заказ #{orderNo} отправлен.");
    }
}
