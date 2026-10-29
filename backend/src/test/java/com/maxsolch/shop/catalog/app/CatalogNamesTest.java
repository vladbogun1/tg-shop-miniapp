package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.catalog.infra.ProductVariantRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.translation.app.TranslationService;
import com.maxsolch.shop.translation.domain.ContentTranslation;
import com.maxsolch.shop.translation.domain.ContentTranslationId;
import com.maxsolch.shop.translation.domain.SourceHash;
import com.maxsolch.shop.translation.domain.TranslationEntityType;
import com.maxsolch.shop.translation.infra.ContentTranslationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.util.ArrayList;
import java.util.List;

import static com.maxsolch.shop.translation.domain.TranslationEntityType.TITLE;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CatalogNamesTest {

    private static final String PRODUCT = "11111111-1111-1111-1111-111111111111";

    private static ContentTranslation row(String locale, String source, String text) {
        ContentTranslation t = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(PRODUCT), TITLE, locale));
        t.setText(text);
        t.setSourceHash(SourceHash.sha256Hex(source));
        return t;
    }

    @Test
    void orderLineUsesCurrentProductTranslationElseSnapshot() {
        ContentTranslationRepository repo = mock(ContentTranslationRepository.class);
        ProductRepository products = mock(ProductRepository.class);
        ProductVariantRepository variants = mock(ProductVariantRepository.class);
        String otherProduct = "55555555-5555-5555-5555-555555555555";
        ContentTranslation staleRow = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(otherProduct), TITLE, "uk"));
        staleRow.setText("Старий переклад");
        staleRow.setSourceHash(SourceHash.sha256Hex("Было"));
        when(repo.findByLocale("uk")).thenReturn(List.of(row("uk", "Ковер", "Килимок"), staleRow));
        List<Object[]> titleRows = new ArrayList<>();
        titleRows.add(new Object[]{UuidUtil.toBytes(PRODUCT), "Ковер"});
        titleRows.add(new Object[]{UuidUtil.toBytes(otherProduct), "Стало"});
        when(products.titlesByIds(anyCollection())).thenReturn(titleRows);

        TranslationService service = new TranslationService(repo, new ConcurrentMapCacheManager());
        CatalogNames catalogNames = new CatalogNames(products, variants, service);
        CatalogNames.ItemNames names = catalogNames.orderItemNames(
                List.of(UuidUtil.toBytes(PRODUCT), UuidUtil.toBytes(otherProduct)), List.of(), "uk");

        assertThat(names.title(PRODUCT, "Ковер (снимок)")).isEqualTo("Килимок");
        assertThat(names.title(otherProduct, "Было")).isEqualTo("Было");
        assertThat(names.title(null, "Удалённый товар")).isEqualTo("Удалённый товар");

        // Russian: no lookups at all
        assertThat(catalogNames.orderItemNames(List.of(UuidUtil.toBytes(PRODUCT)), List.of(), "ru"))
                .isSameAs(CatalogNames.ItemNames.EMPTY);
    }}
