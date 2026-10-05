package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.ProductVariantRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.ContentTranslation;
import com.maxsolch.shop.translation.ContentTranslationId;
import com.maxsolch.shop.translation.ContentTranslationRepository;
import com.maxsolch.shop.translation.TranslationEntityType;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.dto.ProductDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The catalog caches used to have no key at all: once translated text is inside the DTOs, the first
 * language to warm the cache would be served to everybody. Real Spring caching proxy here.
 */
@SpringJUnitConfig(CatalogServiceCacheTest.Config.class)
class CatalogServiceCacheTest {

    static final String ID = "11111111-1111-1111-1111-111111111111";

    @Configuration
    @EnableCaching
    static class Config {
        @Bean
        CacheManager cacheManager() {
            return new ConcurrentMapCacheManager("products", "productById", "tags");
        }

        @Bean
        ProductRepository productRepository() {
            return mock(ProductRepository.class);
        }

        @Bean
        TagRepository tagRepository() {
            return mock(TagRepository.class);
        }

        @Bean
        ContentTranslationRepository contentTranslationRepository() {
            return mock(ContentTranslationRepository.class);
        }

        @Bean
        TranslationService translationService(ContentTranslationRepository repo, ProductRepository products) {
            return new TranslationService(repo, products, mock(ProductVariantRepository.class));
        }

        @Bean
        CatalogService catalogService(ProductRepository products, TagRepository tags, TranslationService ts) {
            OrderItemRepository orderItems = mock(OrderItemRepository.class);
            when(orderItems.soldCountsByProduct()).thenReturn(List.of());
            return new CatalogService(products, tags, orderItems, ts);
        }
    }

    @Autowired
    CatalogService catalogService;
    @Autowired
    ProductRepository productRepository;
    @Autowired
    TagRepository tagRepository;
    @Autowired
    ContentTranslationRepository translationRepository;
    @Autowired
    CacheManager cacheManager;
    @Autowired
    TranslationService translationService;

    @BeforeEach
    void setUp() {
        cacheManager.getCacheNames().forEach(n -> cacheManager.getCache(n).clear());
        clearInvocations(productRepository, tagRepository, translationRepository);

        Product p = new Product();
        p.setId(UuidUtil.toBytes(ID));
        p.setTitle("Ковер");
        p.setSlug("kover");
        p.setActive(true);
        when(productRepository.findAllActive()).thenReturn(List.of(p));
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));
        Tag t = new Tag();
        t.setId(UuidUtil.randomBytes());
        t.setName("Ковры");
        when(tagRepository.findAllByOrderByNameAsc()).thenReturn(List.of(t));

        ContentTranslation uk = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.PRODUCT, UuidUtil.toBytes(ID), TranslationEntityType.TITLE, "uk"));
        uk.setText("Килимок");
        uk.setSourceHash(TranslationService.sha256Hex("Ковер"));
        when(translationRepository.findByLocale("uk")).thenReturn(List.of(uk));
        when(translationRepository.findByLocale("en")).thenReturn(List.of());
        translationService.invalidate(); // snapshots of an earlier test must not leak into this one
    }

    @Test
    void productListIsCachedPerLanguage() {
        assertThat(catalogService.listActiveProducts("uk")).extracting(ProductDto::title).containsExactly("Килимок");
        assertThat(catalogService.listActiveProducts("ru")).extracting(ProductDto::title).containsExactly("Ковер");
        assertThat(catalogService.listActiveProducts("uk")).extracting(ProductDto::title).containsExactly("Килимок");
        assertThat(catalogService.listActiveProducts("ru")).extracting(ProductDto::title).containsExactly("Ковер");
        verify(productRepository, times(2)).findAllActive();

        // anything unexpected shares the "ru" entry instead of growing the cache
        assertThat(catalogService.listActiveProducts("de")).extracting(ProductDto::title).containsExactly("Ковер");
        verify(productRepository, times(2)).findAllActive();
    }

    @Test
    void productByIdAndTagsAreCachedPerLanguage() {
        assertThat(catalogService.getProduct(ID, "uk")).map(ProductDto::title).contains("Килимок");
        assertThat(catalogService.getProduct(ID, "en")).map(ProductDto::title).contains("Ковер");
        assertThat(catalogService.getProduct(ID, "uk")).map(ProductDto::title).contains("Килимок");
        verify(productRepository, times(2)).findByIdWithDetails(any());

        catalogService.listTags("uk");
        catalogService.listTags("ru");
        catalogService.listTags("uk");
        verify(tagRepository, times(2)).findAllByOrderByNameAsc();
    }

    @Test
    void tagSeoIsTheSourceInRussianAndOnlyTranslationsElsewhere() {
        Tag t = new Tag();
        t.setId(UuidUtil.toBytes("33333333-3333-3333-3333-333333333333"));
        t.setName("Ковры");
        t.setSeoTitle("Игровые коврики — купить");
        t.setH1("Игровые коврики");
        Tag empty = new Tag();
        empty.setId(UuidUtil.randomBytes());
        empty.setName("Без SEO");
        when(tagRepository.findAll()).thenReturn(List.of(t, empty));
        ContentTranslation title = new ContentTranslation(new ContentTranslationId(
                TranslationEntityType.TAG, t.getId(), TranslationEntityType.SEO_TITLE, "uk"));
        title.setText("Ігрові килимки — купити");
        title.setSourceHash(TranslationService.sha256Hex("Игровые коврики — купить"));
        when(translationRepository.findByLocale("uk")).thenReturn(List.of(title));
        translationService.invalidate();
        String id = UuidUtil.toString(t.getId());

        var ru = catalogService.tagSeo("ru");
        assertThat(ru).containsOnlyKeys(id);
        assertThat(ru.get(id).seoTitle()).isEqualTo("Игровые коврики — купить");
        assertThat(ru.get(id).h1()).isEqualTo("Игровые коврики");

        var uk = catalogService.tagSeo("uk");
        assertThat(uk.get(id).seoTitle()).isEqualTo("Ігрові килимки — купити");
        assertThat(uk.get(id).h1()).isNull(); // untranslated -> the site's template, not Russian

        assertThat(catalogService.tagSeo("en")).isEmpty();
        catalogService.tagSeo("uk");
        verify(tagRepository, times(3)).findAll();
    }
}
