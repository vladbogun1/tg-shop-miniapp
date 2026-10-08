package com.maxsolch.shop.service;

import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogDtos.BrandRefDto;
import com.maxsolch.shop.catalog.CatalogSnapshot;
import com.maxsolch.shop.catalog.MarkdownCollection;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.ProductDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.CategoryDto;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.ProductPage;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapCategory;
import com.maxsolch.shop.web.dto.PublicCatalogDtos.SitemapDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Public catalog over the category tree: a parent covers its children, «utsenka» is the virtual
 * collection of condition ≠ NEW, the menu is in tree order with subtree counts, the sitemap lists
 * non-empty categories (parents too) and utsenka.
 */
class PublicCatalogServiceSitemapTest {

    static final String KEYBOARDS = "10000000-0000-0000-0000-000000000001";
    static final String MAGNETIC = "10000000-0000-0000-0000-000000000002";
    static final String MECHANICAL = "10000000-0000-0000-0000-000000000003";
    static final String CHAIRS = "10000000-0000-0000-0000-000000000004";
    static final String HIDDEN = "10000000-0000-0000-0000-000000000005";

    private final CatalogService catalogService = mock(CatalogService.class);
    private final CatalogDirectory directory = mock(CatalogDirectory.class);
    private final ProductRepository productRepository = mock(ProductRepository.class);
    private final TranslationService translationService = mock(TranslationService.class);
    private final MarkdownCollection markdown = mock(MarkdownCollection.class);
    private final PublicCatalogService service =
            new PublicCatalogService(catalogService, directory, productRepository, translationService, markdown);

    private static final Instant OLD = Instant.parse("2026-09-01T10:00:00Z");
    private static final Instant NEW = Instant.parse("2026-10-04T12:00:00Z");

    @BeforeEach
    void setUp() {
        CatalogSnapshot s = new CatalogSnapshot(List.of(
                cat(KEYBOARDS, null, "klaviatury", 20, true),
                cat(MAGNETIC, KEYBOARDS, "klv-magnitnye", 30, true),
                cat(MECHANICAL, KEYBOARDS, "klv-mekhanicheskie", 40, true),
                cat(CHAIRS, null, "kresla", 50, true),
                cat(HIDDEN, null, "skrytaya", 60, false)), List.of(), List.of(), List.of());
        when(directory.snapshot()).thenReturn(s);
        when(translationService.overlay(anyString())).thenReturn(new TranslationService.Overlay(Map.of()));
        when(markdown.info(anyString())).thenReturn(new MarkdownCollection.Info("Уценка", null, null, null, null));
        List<ProductDto> products = List.of(
                dto("mag-a", MAGNETIC, "NEW", 100_00, "Wooting"),
                dto("mag-b", MAGNETIC, "MARKDOWN", 200_00, null),
                dto("mech", MECHANICAL, "NEW", 300_00, "Akko"),
                dto("hidden", HIDDEN, "NEW", 50_00, null),
                dto("loose", null, "NEW", 10_00, null));
        for (String l : ContentLocale.ALL) {
            when(catalogService.listActiveProducts(l)).thenReturn(products);
        }
    }

    @Test
    void parentCategoryCoversItsChildren() {
        ProductPage page = service.search(query("klaviatury", null, null), "ru");
        assertThat(page.items()).extracting(ProductDto::slug).containsExactlyInAnyOrder("mag-a", "mag-b", "mech");

        ProductPage leaf = service.search(query("klv-magnitnye", null, null), "ru");
        assertThat(leaf.items()).extracting(ProductDto::slug).containsExactlyInAnyOrder("mag-a", "mag-b");
    }

    @Test
    void utsenkaIsTheVirtualCollectionOfNonNewProducts() {
        ProductPage page = service.search(query("utsenka", null, null), "ru");
        assertThat(page.items()).extracting(ProductDto::slug).containsExactly("mag-b");
    }

    @Test
    void unknownCategoryIs404AndSearchFindsBrands() {
        assertThatThrownBy(() -> service.search(query("nope", null, null), "ru")).isInstanceOf(NotFoundException.class);
        ProductPage page = service.search(query(null, "akko", null), "ru");
        assertThat(page.items()).extracting(ProductDto::slug).containsExactly("mech");
    }

    @Test
    void allReturnsTheWholeSelectionWithoutPaging() {
        ProductPage page = service.search(new PublicCatalogService.Query(null, null, null, null, null, 0, 2, true), "ru");
        assertThat(page.items()).hasSize(5);
        assertThat(page.size()).isEqualTo(PublicCatalogService.MAX_ALL);
        ProductPage paged = service.search(new PublicCatalogService.Query(null, null, null, null, null, 0, 2, false), "ru");
        assertThat(paged.items()).hasSize(2);
    }

    @Test
    void menuIsInTreeOrderWithSubtreeCountsAndUtsenkaLast() {
        List<CategoryDto> menu = service.categories("uk");
        assertThat(menu).extracting(CategoryDto::slug)
                .containsExactly("klaviatury", "klv-magnitnye", "klv-mekhanicheskie", "kresla", "utsenka");
        assertThat(menu.get(0).productCount()).isEqualTo(3);
        assertThat(menu.get(1).parentId()).isEqualTo(KEYBOARDS);
        CategoryDto sale = menu.get(4);
        assertThat(sale.id()).isEqualTo("utsenka");
        assertThat(sale.productCount()).isEqualTo(1);
        assertThat(sale.artKind()).isEqualTo("sale");
    }

    @Test
    void categoryDetailWorksForHiddenCategoriesAndUtsenka() {
        assertThat(service.category("skrytaya", "ru")).hasValueSatisfying(c -> {
            assertThat(c.showInMenu()).isFalse();
            assertThat(c.productCount()).isEqualTo(1);
        });
        assertThat(service.category("utsenka", "uk")).hasValueSatisfying(c -> {
            assertThat(c.name()).isEqualTo("Уценка");
            assertThat(c.productCount()).isEqualTo(1);
        });
        assertThat(service.category("nope", "uk")).isEmpty();
    }

    @Test
    void sitemapListsNonEmptyMenuCategoriesWithParentsAndUtsenka() {
        when(productRepository.findAllActive()).thenReturn(List.of(
                product("mag-a", OLD, null),
                product("mag-b", OLD, NEW),
                product("mech", OLD, null),
                product("hidden", OLD, null),
                product("loose", OLD, null)));

        SitemapDto sitemap = service.sitemap();

        assertThat(sitemap.categories()).containsExactly(
                new SitemapCategory("klaviatury", NEW),
                new SitemapCategory("klv-magnitnye", NEW),
                new SitemapCategory("klv-mekhanicheskie", OLD),
                new SitemapCategory("utsenka", NEW));
        assertThat(sitemap.products()).hasSize(5);
        assertThat(sitemap.products().get(0).updatedAt()).isEqualTo(OLD); // falls back to createdAt
    }

    // ------------------------------------------------------------------ fixtures

    private static PublicCatalogService.Query query(String category, String q, Boolean inStock) {
        return new PublicCatalogService.Query(category, q, inStock, null, null, null, null);
    }

    static CatalogSnapshot.Cat cat(String id, String parent, String slug, int sort, boolean menu) {
        return new CatalogSnapshot.Cat(id, parent, slug, slug, sort, menu, null, null, null, null, null);
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

    static ProductDto dto(String slug, String categoryId, String condition, long price, String brand) {
        BrandRefDto ref = brand == null ? null : new BrandRefDto(UuidUtil.toString(UuidUtil.randomBytes()),
                brand.toLowerCase(), brand);
        return new ProductDto(UuidUtil.toString(UuidUtil.randomBytes()), slug, null, price, "UAH", 1, true, 0,
                List.of(), List.of(), List.of(), slug, null, null, null, OLD, brand, null, null, 0,
                categoryId, ref, condition, null, Map.of());
    }
}
