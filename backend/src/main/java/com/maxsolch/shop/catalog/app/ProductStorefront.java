package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import org.springframework.stereotype.Component;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/** The site-only fields of a product from the admin form: slug, old price, SEO texts, SKU. */
@Component
class ProductStorefront {

    private final SlugService slugService;
    private final ProductRepository productRepository;

    ProductStorefront(SlugService slugService, ProductRepository productRepository) {
        this.slugService = slugService;
        this.productRepository = productRepository;
    }

    /**
     * Site-only fields. {@code null} keeps the current value (older admin builds do not send
     * them); a blank slug means "generate from the title", a hand-typed one must be free.
     */
    void apply(Product p, ProductUpsertRequest req) {
        if (req.slug() != null || p.getSlug() == null) {
            String explicit = req.slug() == null ? "" : req.slug().trim();
            if (!explicit.isEmpty()) {
                String normalised = SlugService.slugify(explicit);
                if (normalised.isEmpty()) {
                    throw new DomainException.BadRequest(CatalogError.SLUG_INVALID);
                }
                if (!normalised.equals(p.getSlug()) && slugService.productSlugTaken(normalised, p.getId())) {
                    throw new DomainException.BadRequest(CatalogError.SLUG_TAKEN_BY_PRODUCT, normalised);
                }
                p.setSlug(normalised);
            } else {
                p.setSlug(slugService.forProduct(null, p.getTitle(), p.getId()));
            }
        }
        if (req.compareAtMinor() != null) {
            p.setCompareAtMinor(req.compareAtMinor() > 0 ? req.compareAtMinor() : null);
        }
        if (req.seoTitle() != null) {
            p.setSeoTitle(trimToNull(req.seoTitle()));
        }
        if (req.seoDescription() != null) {
            p.setSeoDescription(trimToNull(req.seoDescription()));
        }
        if (req.sku() != null) {
            String sku = trimToNull(req.sku());
            if (sku != null && !sku.equalsIgnoreCase(p.getSku()) && productRepository.skuTaken(sku, p.getId())) {
                throw new DomainException.BadRequest(CatalogError.SKU_TAKEN, sku);
            }
            p.setSku(sku);
        }
    }
}
