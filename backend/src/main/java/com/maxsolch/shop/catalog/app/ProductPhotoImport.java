package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.media.app.ImageImport;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Comparator;
import java.util.List;

/**
 * «Фото по ссылке» in the admin: one link (found by the AI in the cards wizard, or pasted) becomes the product's last
 * photo, already in the shop format (see {@link ImageImport}). One link per call — the admin sends a few in parallel
 * and shows the result of each.
 *
 * <p>The download and render run outside a transaction (up to ~40 s of network); only the append takes the product's
 * row lock. If the product vanished meanwhile, the stored photo is deleted again.
 */
@Service
public class ProductPhotoImport {

    /** The new photo key, where it came from, whether the product was cut out (else only squared), and all the product's photo keys in order after the append. */
    public record Result(String key, String source, boolean cutOut, List<String> imageKeys) {
    }

    private final ImageImport imageImport;
    private final ImageStorageService storage;
    private final ProductRepository products;
    private final TransactionTemplate tx;

    public ProductPhotoImport(ImageImport imageImport, ImageStorageService storage, ProductRepository products,
                              PlatformTransactionManager txManager) {
        this.imageImport = imageImport;
        this.storage = storage;
        this.products = products;
        this.tx = new TransactionTemplate(txManager);
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true)
    })
    public Result importPhoto(String productId, String url) {
        byte[] id = toBytes(productId);
        if (!products.existsById(id)) {
            throw new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND);
        }
        ImageImport.Imported photo = imageImport.importFrom(url);
        try {
            List<String> keys = tx.execute(status -> append(id, photo.key()));
            return new Result(photo.key(), photo.source(), photo.cutOut(), keys);
        } catch (RuntimeException e) {
            storage.deleteQuietly(photo.key());
            throw e;
        }
    }

    private List<String> append(byte[] id, String key) {
        Product p = products.findByIdForUpdate(id)
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));
        int next = p.getImages().stream().mapToInt(ProductImage::getSortOrder).max().orElse(-1) + 1;
        ProductImage img = new ProductImage();
        img.setProduct(p);
        img.setUrl(key);
        img.setSortOrder(next);
        p.getImages().add(img);
        products.save(p);
        return p.getImages().stream()
                .sorted(Comparator.comparingInt(ProductImage::getSortOrder))
                .map(ProductImage::getUrl)
                .toList();
    }

    private static byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(CatalogError.INVALID_ID, id);
        }
    }
}
