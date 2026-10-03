package com.maxsolch.shop.translation;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PaymentOption;
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

        service = new TranslationAdminService(repo, products, variants, tags, payments, translationService,
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
}
