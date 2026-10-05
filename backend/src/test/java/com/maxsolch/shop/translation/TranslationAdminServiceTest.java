package com.maxsolch.shop.translation;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PaymentOption;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.PaymentOptionRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.ProductVariantRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.TranslationDtos.ExportItem;
import com.maxsolch.shop.translation.TranslationDtos.ImportItem;
import com.maxsolch.shop.translation.TranslationDtos.ImportRequest;
import com.maxsolch.shop.translation.TranslationDtos.ImportResult;
import com.maxsolch.shop.web.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.cache.CacheManager;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

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
    private static final String HASH = TranslationService.sha256Hex(TITLE);

    ContentTranslationRepository repo;
    ProductRepository products;
    ProductVariantRepository variants;
    TagRepository tags;
    PaymentOptionRepository payments;
    TranslationService translationService;
    CacheManager cacheManager;
    TranslationAdminService service;

    @BeforeEach
    void setUp() {
        repo = mock(ContentTranslationRepository.class);
        products = mock(ProductRepository.class);
        variants = mock(ProductVariantRepository.class);
        tags = mock(TagRepository.class);
        payments = mock(PaymentOptionRepository.class);
        translationService = mock(TranslationService.class);
        cacheManager = new ConcurrentMapCacheManager("products", "productById", "tags");

        List<Object[]> productRows = new ArrayList<>();
        productRows.add(new Object[]{UuidUtil.toBytes(PRODUCT), TITLE, "Описание", null, "", true, false});
        productRows.add(new Object[]{UuidUtil.toBytes(ARCHIVED), "Старый", null, null, null, true, true});
        when(products.translationSources()).thenReturn(productRows);
        when(variants.translationSources()).thenReturn(List.of());
        Tag tag = new Tag();
        tag.setId(UuidUtil.toBytes(TAG));
        tag.setName("Ковры");
        when(tags.findAll()).thenReturn(List.of(tag));
        PaymentOption inactive = new PaymentOption();
        inactive.setId(UuidUtil.randomBytes());
        inactive.setTitle("Старая оплата");
        inactive.setActive(false);
        when(payments.findAll()).thenReturn(List.of(inactive));
        when(repo.findByLocale(anyString())).thenReturn(List.of());

        service = new TranslationAdminService(repo, products, variants, tags, payments,
                mock(com.maxsolch.shop.repository.PaymentRequisitesRepository.class), translationService,
                cacheManager);
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
        ImportResult r = service.importTranslations(
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
        verify(translationService).invalidate();
    }

    @Test
    void staleHashIsRejected() {
        ImportResult r = service.importTranslations(new ImportRequest("uk", null, null,
                List.of(item("title", TranslationService.sha256Hex("Ковёр"), "Килимок"))), 1L);

        assertThat(r.applied()).isZero();
        assertThat(r.skippedStale()).isEqualTo(1);
        assertThat(r.rejected()).extracting(TranslationDtos.Rejected::reason).containsExactly("STALE");
        verify(repo, never()).saveAll(any());
    }

    @Test
    void manualRowIsProtectedUnlessForced() {
        when(repo.findByLocale("uk")).thenReturn(List.of(existing(TranslationOrigin.MANUAL)));

        ImportResult r = service.importTranslations(
                new ImportRequest("uk", "AI", false, List.of(item("title", HASH, "Килимок"))), 1L);
        assertThat(r.skippedManual()).isEqualTo(1);
        assertThat(r.applied()).isZero();
        verify(repo, never()).saveAll(any());

        ImportResult forced = service.importTranslations(
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

        ImportResult r = service.importTranslations(
                new ImportRequest("uk", "manual", null, List.of(item("title", HASH, "Килимок"))), 7L);

        assertThat(r.applied()).isEqualTo(1);
        assertThat(saved().get(0).getOrigin()).isEqualTo(TranslationOrigin.MANUAL);
    }

    @Test
    void invalidItemsAreCountedNotApplied() {
        String tooLong = "я".repeat(TranslationAdminService.MAX_TEXT_CHARS + 1);
        ImportResult r = service.importTranslations(new ImportRequest("en", null, null, List.of(
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
        ImportResult r = service.importTranslations(new ImportRequest("uk", null, null, List.of(
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
        assertThatThrownBy(() -> service.importTranslations(new ImportRequest("ru", null, null, List.of()), 1L))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.export("de", "all", null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.delete(null, null, null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.importTranslations(new ImportRequest("uk", "ROBOT", null, List.of()), 1L))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void exportCoversLiveEntitiesWithStatus() {
        ContentTranslation staleRow = existing(TranslationOrigin.MANUAL);
        staleRow.setSourceHash(TranslationService.sha256Hex("Было"));
        when(repo.findByLocale("uk")).thenReturn(List.of(staleRow));

        List<ExportItem> all = service.export("uk", "all", null);
        // product title + description, tag name; archived product, inactive payment option and empty
        // sources are not exported
        assertThat(all).extracting(i -> i.entityType() + ":" + i.field())
                .containsExactly("PRODUCT:title", "PRODUCT:description", "TAG:name");
        ExportItem title = all.get(0);
        assertThat(title.status()).isEqualTo("STALE");
        assertThat(title.source()).isEqualTo(TITLE);
        assertThat(title.sourceHash()).isEqualTo(HASH);
        assertThat(title.text()).isEqualTo("Старий");
        assertThat(title.origin()).isEqualTo("MANUAL");

        assertThat(service.export("uk", "missing", "product")).extracting(ExportItem::field)
                .containsExactly("description");
        assertThat(service.export("uk", "STALE", null)).hasSize(1);

        TranslationDtos.Counts product = service.stats().locales().get("uk").get("PRODUCT");
        assertThat(product).isEqualTo(new TranslationDtos.Counts(0, 1, 1));
        assertThat(service.stats().locales().get("en").get("ALL")).isEqualTo(new TranslationDtos.Counts(0, 0, 3));
    }

    @Test
    void deleteNeedsEntityTypeForEntityId() {
        assertThatThrownBy(() -> service.delete("uk", null, PRODUCT)).isInstanceOf(BadRequestException.class);
        when(repo.deleteByLocaleAndEntity(any(), any(), any())).thenReturn(2);
        assertThat(service.delete("uk", "product", PRODUCT)).isEqualTo(2);
        verify(translationService).invalidate();
    }

    @Test
    void deleteSingleFieldNeedsEntityAndTranslatableField() {
        assertThatThrownBy(() -> service.delete("uk", "product", null, "title"))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.delete("uk", "product", PRODUCT, "slug"))
                .isInstanceOf(BadRequestException.class);
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

        List<ExportItem> all = service.export("en", "all", null);
        ExportItem title = all.stream().filter(i -> i.entityType().equals("PRODUCT")).findFirst().orElseThrow();
        assertThat(title.productId()).isEqualTo(PRODUCT);
        ExportItem variant = all.stream().filter(i -> i.entityType().equals("VARIANT")).findFirst().orElseThrow();
        assertThat(variant.productId()).isEqualTo(PRODUCT);
        assertThat(variant.productTitle()).isEqualTo(TITLE);
        ExportItem tag = all.stream().filter(i -> i.entityType().equals("TAG")).findFirst().orElseThrow();
        assertThat(tag.productId()).isNull();
    }

    @Test
    void tagSeoFieldsAreExportedWithTheCategoryNameAsContext() {
        Tag tag = new Tag();
        tag.setId(UuidUtil.toBytes(TAG));
        tag.setName("Ковры");
        tag.setSeoTitle("Игровые коврики — купить");
        tag.setIntroText("Длинный текст");
        when(tags.findAll()).thenReturn(List.of(tag));

        List<ExportItem> tagItems = service.export("uk", "all", "tag");
        assertThat(tagItems).extracting(ExportItem::field).containsExactly("name", "seo_title", "intro_text");
        assertThat(tagItems.get(0).productTitle()).isNull();
        assertThat(tagItems.get(1).productTitle()).isEqualTo("Ковры");
        assertThat(tagItems.get(1).productId()).isNull();

        ImportResult r = service.importTranslations(new ImportRequest("uk", null, false, List.of(
                new ImportItem("TAG", TAG, "intro_text", TranslationService.sha256Hex("Длинный текст"), "Довгий текст"),
                new ImportItem("TAG", TAG, "h1", TranslationService.sha256Hex("x"), "y"))), 1L);
        assertThat(r.applied()).isEqualTo(1);
        assertThat(r.notFound()).isEqualTo(1); // h1 is empty: NO_SOURCE
    }

    @Test
    void sourceFixOfATagSeoFieldSkipsTheNameCheck() {
        Tag tag = new Tag();
        tag.setId(UuidUtil.toBytes(TAG));
        tag.setName("Ковры");
        tag.setH1("Игровые ковирки");
        when(tags.findById(any())).thenReturn(Optional.of(tag));

        TranslationDtos.SourceFixResult r = service.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("TAG", TAG, "h1", TranslationService.sha256Hex("Игровые ковирки"))),
                "Игровые коврики", null), 1L);

        assertThat(r.updated()).isEqualTo(1);
        assertThat(tag.getH1()).isEqualTo("Игровые коврики");
        assertThat(tag.getName()).isEqualTo("Ковры");
        verify(tags, never()).findByName(anyString());
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
        String oldHash = TranslationService.sha256Hex("Ковер черрный");

        TranslationDtos.SourceFixResult r = service.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", oldHash)),
                "Ковер черный", Map.of("uk", "Килимок чорний", "en", "Mouse Pad, Black")), 5L);

        assertThat(r.updated()).isEqualTo(1);
        assertThat(r.translationsApplied()).isEqualTo(2);
        String newHash = TranslationService.sha256Hex("Ковер черный");
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
        verify(translationService).invalidate();
    }

    @Test
    void sourceFixSkipsFieldChangedSinceExport() {
        Product p = product();
        when(products.findById(any())).thenReturn(Optional.of(p));

        TranslationDtos.SourceFixResult r = service.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title",
                        TranslationService.sha256Hex("что-то другое"))),
                "Ковер черный", Map.of("uk", "Килимок чорний")), 5L);

        assertThat(r.updated()).isZero();
        assertThat(r.skippedStale()).isEqualTo(1);
        assertThat(p.getTitle()).isEqualTo("Ковер черрный");
        verify(repo, never()).saveAll(any());
    }

    @Test
    void sourceFixValidatesInput() {
        assertThatThrownBy(() -> service.fixSource(new TranslationDtos.SourceFixRequest(List.of(), "x", null), 1L))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", HASH)), " ", null), 1L))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", HASH)), "x",
                Map.of("ru", "x")), 1L))
                .isInstanceOf(BadRequestException.class);
        TranslationDtos.SourceFixResult r = service.fixSource(new TranslationDtos.SourceFixRequest(
                List.of(new TranslationDtos.SourceRef("PRODUCT", PRODUCT, "title", HASH)), "я".repeat(256), null), 1L);
        assertThat(r.invalid()).isEqualTo(1);
        assertThat(r.rejected()).extracting(TranslationDtos.Rejected::reason)
                .containsExactly("INVALID_SOURCE_TOO_LONG");
    }
}
