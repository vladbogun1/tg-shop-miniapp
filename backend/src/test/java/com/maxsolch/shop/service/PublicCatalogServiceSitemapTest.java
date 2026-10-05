package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.Tag;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.TagRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapCategory;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapDto;
import com.maxsolch.shop.web.dto.TagDto;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Sitemap: empty categories are left out (soft 404), a category's lastmod = its newest product. */
class PublicCatalogServiceSitemapTest {

    private final CatalogService catalogService = mock(CatalogService.class);
    private final TagRepository tagRepository = mock(TagRepository.class);
    private final ProductRepository productRepository = mock(ProductRepository.class);
    private final PublicCatalogService service =
            new PublicCatalogService(catalogService, tagRepository, productRepository);

    private static final Instant OLD = Instant.parse("2026-09-01T10:00:00Z");
    private static final Instant NEW = Instant.parse("2026-10-04T12:00:00Z");

    @Test
    void skipsEmptyAndHiddenCategoriesAndDatesTheRest() {
        Tag mats = tag("kovriki", true);
        Tag chairs = tag("kresla", true);    // in the menu, but no products
        Tag hidden = tag("skrytaya", false); // has a product, not in the menu
        when(tagRepository.findAllByOrderByNameAsc()).thenReturn(List.of(mats, chairs, hidden));

        when(productRepository.findAllActive()).thenReturn(List.of(
                product("mat-a", OLD, null),
                product("mat-b", OLD, NEW),
                product("loose", OLD, null)));
        when(catalogService.listActiveProducts(ContentLocale.RU)).thenReturn(List.of(
                dto("mat-a", mats),
                dto("mat-b", mats, hidden),
                dto("loose")));

        SitemapDto sitemap = service.sitemap();

        assertThat(sitemap.categories()).containsExactly(new SitemapCategory("kovriki", NEW));
        assertThat(sitemap.products()).hasSize(3);
        assertThat(sitemap.products().get(0).updatedAt()).isEqualTo(OLD); // falls back to createdAt
    }

    private static Tag tag(String slug, boolean inMenu) {
        Tag t = new Tag();
        t.setId(UuidUtil.randomBytes());
        t.setName(slug);
        t.setSlug(slug);
        t.setShowInMenu(inMenu);
        return t;
    }

    private static Product product(String slug, Instant created, Instant updated) {
        Product p = new Product();
        p.setId(UuidUtil.randomBytes());
        p.setTitle(slug);
        p.setSlug(slug);
        p.setActive(true);
        p.setCreatedAt(created);
        p.setUpdatedAt(updated);
        return p;
    }

    private static ProductDto dto(String slug, Tag... tags) {
        List<TagDto> tagDtos = java.util.Arrays.stream(tags).map(TagDto::of).toList();
        return new ProductDto(UuidUtil.toString(UuidUtil.randomBytes()), slug, null, 100_00, "UAH", 1, true, 0,
                List.of(), List.of(), tagDtos, slug, null, null, null, OLD, null, null, null, 0);
    }
}
