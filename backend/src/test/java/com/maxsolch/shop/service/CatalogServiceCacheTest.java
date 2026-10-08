package com.maxsolch.shop.service;

import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.repository.OrderItemRepository;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.ProductVariantRepository;
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
            return new ConcurrentMapCacheManager("products", "productById", "catalogSchema");
        }

        @Bean
        ProductRepository productRepository() {
            return mock(ProductRepository.class);
        }

        @Bean
        CatalogDirectory catalogDirectory() {
            CatalogDirectory d = mock(CatalogDirectory.class);
            CatalogSnapshot.Cat mats = new CatalogSnapshot.Cat("22222222-2222-2222-2222-222222222222", null, "Коврики",
                    "kovriki", 10, true, "pad", null, null, null, null);
            when(d.snapshot()).thenReturn(new CatalogSnapshot(List.of(mats), List.of(), List.of(), List.of()));
            return d;
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
        CatalogService catalogService(ProductRepository products, CatalogDirectory tags, TranslationService ts) {
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
    ContentTranslationRepository translationRepository;
    @Autowired
    CacheManager cacheManager;
    @Autowired
    TranslationService translationService;

    @BeforeEach
    void setUp() {
        cacheManager.getCacheNames().forEach(n -> cacheManager.getCache(n).clear());
        clearInvocations(productRepository, translationRepository);

        Product p = new Product();
        p.setId(UuidUtil.toBytes(ID));
        p.setTitle("Ковер");
        p.setSlug("kover");
        p.setActive(true);
        p.setCategoryId(UuidUtil.toBytes("22222222-2222-2222-2222-222222222222"));
        p.setSpecsJson("{\"weight_g\":51}");
        when(productRepository.findAllActive()).thenReturn(List.of(p));
        when(productRepository.findByIdWithDetails(any())).thenReturn(Optional.of(p));

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
    void productByIdIsCachedPerLanguage() {
        assertThat(catalogService.getProduct(ID, "uk")).map(ProductDto::title).contains("Килимок");
        assertThat(catalogService.getProduct(ID, "en")).map(ProductDto::title).contains("Ковер");
        assertThat(catalogService.getProduct(ID, "uk")).map(ProductDto::title).contains("Килимок");
        verify(productRepository, times(2)).findByIdWithDetails(any());
    }

    @Test
    void productsCarryTheCatalogFieldsAndTheCategoryPathAsTags() {
        ProductDto p = catalogService.listActiveProducts("ru").get(0);
        assertThat(p.categoryId()).isEqualTo("22222222-2222-2222-2222-222222222222");
        assertThat(p.tags()).extracting(t -> t.slug()).containsExactly("kovriki");
        assertThat(p.condition()).isEqualTo("NEW");
        assertThat(p.specs()).containsEntry("weight_g", 51);
        assertThat(p.brandRef()).isNull();
        assertThat(p.brand()).isNull();
    }
}
