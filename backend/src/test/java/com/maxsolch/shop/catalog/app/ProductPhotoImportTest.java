package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.ai.app.AiApplySteps;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.media.app.ImageImport;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * «Повторить» after the browser lost the connection: the server may have added the photo already. The same link for
 * the same product must not end up as a second photo; another link, or a link whose photo the admin removed, still does.
 */
class ProductPhotoImportTest {

    static final String LINK = "https://atk.store/p/rs7.jpg";

    ImageImport imageImport = mock(ImageImport.class);
    ImageStorageService storage = mock(ImageStorageService.class);
    ProductRepository products = mock(ProductRepository.class);
    ProductPhotoImport service;
    Product product;
    String id;
    int imported;

    @BeforeEach
    void setUp() {
        AiApplySteps steps = mock(AiApplySteps.class);
        when(steps.within(any(), any(), any(), any())).thenAnswer(inv -> inv.<Supplier<?>>getArgument(3).get());
        service = new ProductPhotoImport(imageImport, storage, products, mock(PlatformTransactionManager.class), steps);
        id = UUID.randomUUID().toString();
        byte[] bytes = UuidUtil.toBytes(id);
        product = new Product();
        when(products.existsById(bytes)).thenReturn(true);
        when(products.findByIdForUpdate(bytes)).thenReturn(Optional.of(product));
        when(imageImport.importFrom(any())).thenAnswer(inv -> new ImageImport.Imported("k" + (++imported), inv.getArgument(0), true));
    }

    @Test
    void repeatOfTheSameLinkReturnsTheAddedPhotoAndDropsTheNewFile() {
        ProductPhotoImport.Result first = service.importPhoto(id, LINK);
        ProductPhotoImport.Result repeat = service.importPhoto(id, " " + LINK + " ");

        assertThat(repeat.key()).isEqualTo(first.key()).isEqualTo("k1");
        assertThat(repeat.imageKeys()).containsExactly("k1");
        assertThat(product.getImages()).extracting(ProductImage::getSourceUrl).containsExactly(LINK);
        verify(storage).deleteQuietly("k2");
        verify(storage, never()).deleteQuietly("k1");
    }

    @Test
    void anotherLinkIsAddedLast() {
        service.importPhoto(id, LINK);
        ProductPhotoImport.Result second = service.importPhoto(id, "https://atk.store/p/rs7-back.jpg");

        assertThat(second.imageKeys()).containsExactly("k1", "k2");
        verify(storage, never()).deleteQuietly(any());
    }

    @Test
    void linkWhosePhotoWasRemovedIsAddedAgain() {
        service.importPhoto(id, LINK);
        product.getImages().clear();

        ProductPhotoImport.Result again = service.importPhoto(id, LINK);

        assertThat(again.key()).isEqualTo("k2");
        assertThat(again.imageKeys()).containsExactly("k2");
    }
}
