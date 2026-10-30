package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Edits the photo list of a product from the admin form. */
final class ProductImagesEditor {

    private ProductImagesEditor() {
    }

    /**
     * Reconciles the image list against what the client sent, matching on the stored key.
     *
     * <p>Rewriting the whole collection (clear + re-insert) churned primary keys on every save and,
     * worse, left every removed picture in object storage forever. Now rows that survive are reused
     * (only their sort order moves) and dropped ones are deleted from MinIO as well.
     */
    static List<String> apply(Product p, ProductUpsertRequest req) {
        if (req.imageKeys() == null) {
            return List.of();
        }
        List<String> keys = req.imageKeys().stream()
                .filter(k -> k != null && !k.isBlank())
                .map(String::trim)
                .distinct()
                .toList();

        // Drop what the admin removed. The collection is mutated in place rather than cleared and
        // refilled: with orphanRemoval a clear() schedules every row for deletion, and re-adding
        // the same instances in one flush is exactly the pattern that makes Hibernate delete and
        // re-insert (new ids) — which is the bug being fixed here.
        List<String> orphanKeys = p.getImages().stream()
                .map(ProductImage::getUrl)
                .filter(url -> !keys.contains(url))
                .toList();
        p.getImages().removeIf(img -> !keys.contains(img.getUrl()));

        Map<String, ProductImage> existing = new LinkedHashMap<>();
        for (ProductImage img : p.getImages()) {
            existing.putIfAbsent(img.getUrl(), img);
        }
        int order = 0;
        for (String key : keys) {
            ProductImage img = existing.get(key);
            if (img == null) {
                img = new ProductImage();
                img.setProduct(p);
                img.setUrl(key);
                p.getImages().add(img);
            }
            img.setSortOrder(order++);
        }

        // The caller deletes these files only after the commit: the save can still fail after this point
        // (unknown category, duplicate slug on flush), and a rollback would leave product_images rows pointing
        // at deleted files.
        return orphanKeys;
    }
}
