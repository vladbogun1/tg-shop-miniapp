package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductImage;
import com.maxsolch.shop.catalog.infra.ProductImageRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * The products as the other modules (cart, order, inventory, preorder, procurement, support, gift) see them: by id,
 * for update (a row lock, the caller owns the transaction) and in batches. The module's storage stays behind it, so
 * a change of how products are kept does not reach them. Not transactional on purpose: it runs inside the caller's.
 */
@Service
public class Products {

    private final ProductRepository products;
    private final ProductImageRepository images;

    public Products(ProductRepository products, ProductImageRepository images) {
        this.products = products;
        this.images = images;
    }

    public Optional<Product> findById(byte[] id) {
        return products.findById(id);
    }

    /** With a row lock ({@code SELECT … FOR UPDATE}): needs the caller's transaction. */
    public Optional<Product> findByIdForUpdate(byte[] id) {
        return products.findByIdForUpdate(id);
    }

    public List<Product> findAllById(Iterable<byte[]> ids) {
        return products.findAllById(ids);
    }

    public List<Product> findAll() {
        return products.findAll();
    }

    public List<Product> findByBrandIdIn(Collection<byte[]> brandIds) {
        return products.findByBrandIdIn(brandIds);
    }

    public Product save(Product product) {
        return products.save(product);
    }

    public List<Product> saveAll(Iterable<Product> list) {
        return products.saveAll(list);
    }

    /** The photos of the given products, in display order. */
    public List<ProductImage> findImagesForProducts(List<byte[]> productIds) {
        return images.findForProducts(productIds);
    }
}
