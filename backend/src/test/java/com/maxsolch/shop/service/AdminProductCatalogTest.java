package com.maxsolch.shop.service;

import com.maxsolch.shop.catalog.BrandAdminService;
import com.maxsolch.shop.catalog.CardStatus;
import com.maxsolch.shop.catalog.CatalogDirectory;
import com.maxsolch.shop.catalog.CatalogFixtures;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.translation.TranslationService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ConflictException;
import com.maxsolch.shop.web.dto.AdminProductDto;
import com.maxsolch.shop.web.dto.ProductUpsertRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Catalog fields of the product form (§3.3) and the publishing gate: new products are hidden DRAFTs,
 * a DRAFT card is published only with force, price and category are always needed.
 */
class AdminProductCatalogTest {

    ProductRepository products = mock(ProductRepository.class);
    CatalogDirectory directory = mock(CatalogDirectory.class);
    BrandAdminService brands = mock(BrandAdminService.class);
    AdminProductService service;
    Product product;
    String id;

    @BeforeEach
    void setUp() {
        service = new AdminProductService(products, mock(ImageStorageService.class), mock(SlugService.class),
                mock(TranslationService.class), directory, brands);
        when(directory.load()).thenReturn(CatalogFixtures.snapshot());
        when(directory.snapshot()).thenReturn(CatalogFixtures.snapshot());
        when(products.save(any())).thenAnswer(i -> i.getArgument(0));
        product = new Product();
        product.setId(UuidUtil.randomBytes());
        product.setTitle("Lamzu Maya");
        product.setSlug("lamzu-maya");
        product.setPriceMinor(3000_00);
        product.setActive(false);
        id = UuidUtil.toString(product.getId());
        when(products.findByIdForUpdate(any())).thenReturn(Optional.of(product));
        when(products.findByIdWithDetails(any())).thenReturn(Optional.of(product));
    }

    @Test
    void aManualSaveNeverChangesTheCardStatus() {
        product.setCardStatus(CardStatus.READY);
        product.setCategoryId(UuidUtil.toBytes(CatalogFixtures.MICE));
        ProductUpsertRequest stale = new ProductUpsertRequest("Lamzu Maya", "desc", 3000_00, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, Map.of("weight_g", 50),
                "AI_FILLED");
        assertThat(service.update(id, stale).cardStatus()).isEqualTo("READY");
        assertThat(service.update(id, req(3000_00, null, null, null, Map.of("weight_g", 51), null, null)).cardStatus())
                .isEqualTo("READY");
    }

    @Test
    void archivingClearsUnfinished() {
        product.setUnfinished(true);
        assertThat(service.setArchived(id, true).unfinished()).isFalse();
    }

    private static ProductUpsertRequest req(long price, Integer stock, Boolean active, String categoryId,
                                            Map<String, Object> specs, String brandId, String condition) {
        return new ProductUpsertRequest("Lamzu Maya", "desc", price, null, stock, active, null, null, null, null,
                null, null, null, null, categoryId, brandId, null, condition, null, specs, null);
    }

    @Test
    void newProductIsAHiddenDraftAndNeedsPriceStockAndALeafCategory() {
        AdminProductDto created = service.create(req(3000_00, 5, true, CatalogFixtures.MICE,
                Map.of("weight_g", 49, "bogus", 1), CatalogFixtures.LAMZU, "MARKDOWN"));
        assertThat(created.active()).isFalse();
        assertThat(created.cardStatus()).isEqualTo("DRAFT");
        assertThat(created.unfinished()).isTrue();
        assertThat(created.categoryId()).isEqualTo(CatalogFixtures.MICE);
        assertThat(created.tags()).extracting(t -> t.slug()).containsExactly("myshki");
        assertThat(created.brand()).isEqualTo("Lamzu");
        assertThat(created.condition()).isEqualTo("MARKDOWN");
        assertThat(created.specs()).containsOnlyKeys("weight_g");
        assertThat(created.specIssues()).extracting(i -> i.reason()).containsExactly("UNKNOWN_KEY");
        assertThat(created.missingRequired()).containsExactly("sensor");

        assertThatThrownBy(() -> service.create(req(0, 5, null, CatalogFixtures.MICE, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("priceMinor");
        assertThatThrownBy(() -> service.create(req(100, null, null, CatalogFixtures.MICE, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("stock");
        assertThatThrownBy(() -> service.create(req(100, 1, null, null, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("categoryId");
        assertThatThrownBy(() -> service.create(req(100, 1, null, CatalogFixtures.KEYBOARDS, null, null, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("подкатегорию");
    }

    @Test
    void publishingADraftNeedsForce() {
        product.setCategoryId(UuidUtil.toBytes(CatalogFixtures.MICE));
        assertThatThrownBy(() -> service.setActive(id, true, false))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> assertThat(((ConflictException) e).getCode()).isEqualTo(AdminProductService.CARD_NOT_READY));
        product.setUnfinished(true);
        AdminProductDto published = service.setActive(id, true, true);
        assertThat(published.active()).isTrue();
        assertThat(published.unfinished()).isFalse();
        // already active: the gate is only on the transition
        assertThat(service.setActive(id, true, false).active()).isTrue();
    }

    @Test
    void publishingNeedsPriceAndCategoryEvenWithForce() {
        product.setCardStatus(CardStatus.READY);
        product.setPriceMinor(0);
        assertThatThrownBy(() -> service.setActive(id, true, true))
                .isInstanceOf(ConflictException.class)
                .satisfies(e -> {
                    ConflictException c = (ConflictException) e;
                    assertThat(c.getCode()).isEqualTo(AdminProductService.NOT_PUBLISHABLE);
                    assertThat(c.getDetails()).containsEntry("missing", List.of("price", "category"));
                });
    }

    @Test
    void theFormCanPublishAReadyCardAndChangingTheCategoryRecheckesSpecs() {
        product.setCardStatus(CardStatus.READY);
        product.setCategoryId(UuidUtil.toBytes(CatalogFixtures.MICE));
        product.setSpecsJson("{\"weight_g\":49,\"color\":[\"black\"]}");
        AdminProductDto saved = service.update(id, req(3000_00, null, true, CatalogFixtures.MAGNETIC, null, null, null));
        assertThat(saved.active()).isTrue();
        assertThat(saved.cardStatus()).isEqualTo("READY"); // manual edits never change the status
        assertThat(saved.specs()).containsOnlyKeys("color");
        assertThat(saved.specIssues()).extracting(i -> i.key()).containsExactly("weight_g");
    }
}
