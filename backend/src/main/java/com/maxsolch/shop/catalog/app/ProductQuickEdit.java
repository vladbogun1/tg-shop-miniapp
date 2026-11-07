package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * The price or the stock of one product changed from the list, without the whole form. Follows the rules of the full
 * save ({@link AdminProductService#update}): the row is locked, a stock that moved since the admin looked is a
 * conflict, a lowered stock needs a write-off reason, the counter, the FIFO lots and the pre-order holds move together
 * ({@link ProductStock}). A product with variants keeps its stock as the sum of the variants, so only its price can be
 * edited here.
 */
@Service
public class ProductQuickEdit {

    private final ProductRepository products;
    private final ProductStock stock;
    private final CatalogDirectory catalogDirectory;

    public ProductQuickEdit(ProductRepository products, ProductStock stock, CatalogDirectory catalogDirectory) {
        this.products = products;
        this.stock = stock;
        this.catalogDirectory = catalogDirectory;
    }

    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true),
            @CacheEvict(value = "catalogSchema", allEntries = true)
    })
    @Transactional
    public AdminProductDto apply(String id, ProductQuickEditRequest req) {
        if (req.priceMinor() == null && req.stock() == null) {
            throw new DomainException.BadRequest(CatalogError.QUICK_EDIT_EMPTY);
        }
        Product p = products.findByIdForUpdate(toBytes(id))
                .orElseThrow(() -> new DomainException.NotFound(CatalogError.PRODUCT_NOT_FOUND));
        if (req.priceMinor() != null) {
            changePrice(p, req.priceMinor(), req.expectedPriceMinor());
        }
        if (req.stock() != null) {
            changeStock(p, req);
        }
        ProductPublishing.syncUnfinished(p);
        Product stored = products.save(p);
        products.flush();
        stock.syncLots(stored);
        return AdminProductDto.of(stored, catalogDirectory.load());
    }

    private static void changePrice(Product p, long price, Long expected) {
        if (expected != null && price != p.getPriceMinor() && expected != p.getPriceMinor()) {
            throw new DomainException.Conflict(CatalogError.PRICE_CONFLICT, p.getTitle(), String.valueOf(expected),
                    String.valueOf(p.getPriceMinor()));
        }
        p.reprice(price);
    }

    private void changeStock(Product p, ProductQuickEditRequest req) {
        if (!p.getVariants().isEmpty()) {
            throw new DomainException.BadRequest(CatalogError.QUICK_STOCK_HAS_VARIANTS);
        }
        int next = req.stock();
        ProductVariantsEditor.checkStock(p.getStock(), next, req.expectedStock(), p.getTitle());
        int drop = Math.max(0, p.getStock() - next);
        if (drop > 0) {
            // Refused before anything moves: a drop without a reason must leave the stock as it was.
            stock.recordDrops(p, List.of(new ProductStock.StockDrop(null, null, drop)), req.stockReason(),
                    req.stockNote());
        }
        stock.overwrite(p, null, next);
    }

    private static byte[] toBytes(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(CatalogError.INVALID_ID, id);
        }
    }
}
