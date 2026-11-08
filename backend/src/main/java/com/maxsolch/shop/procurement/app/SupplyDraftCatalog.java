package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.catalog.app.AdminProductService;
import com.maxsolch.shop.catalog.app.CatalogDirectory;
import com.maxsolch.shop.catalog.app.ProductImageDto;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.procurement.domain.supplyai.CatalogItem;
import com.maxsolch.shop.procurement.domain.supplyai.LeafCategory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

/**
 * The catalog as the supply draft matches against it: the products that are not archived (with their variants and
 * first picture) and the leaf categories in the order of the tree — the same lists the admin screen loads for the
 * manual path, so both paths see the same candidates.
 */
@Component
class SupplyDraftCatalog {

    private final AdminProductService products;
    private final CatalogDirectory directory;

    SupplyDraftCatalog(AdminProductService products, CatalogDirectory directory) {
        this.products = products;
        this.directory = directory;
    }

    List<CatalogItem> items() {
        return products.list().stream().map(SupplyDraftCatalog::item).toList();
    }

    List<LeafCategory> leaves() {
        CatalogSnapshot s = directory.snapshot();
        return s.treeOrder().stream().filter(c -> s.isLeaf(c.id()))
                .map(c -> new LeafCategory(c.id(), c.slug(), c.name())).toList();
    }

    boolean isLeaf(String categoryId) {
        return categoryId != null && directory.snapshot().category(categoryId) != null && directory.snapshot().isLeaf(categoryId);
    }

    private static CatalogItem item(AdminProductDto p) {
        List<CatalogItem.Variant> variants = p.variants() == null ? List.of()
                : p.variants().stream().filter(v -> v.id() != null).map(v -> new CatalogItem.Variant(v.id(), v.name())).toList();
        String image = p.images() == null ? null
                : p.images().stream().map(ProductImageDto::url).filter(Objects::nonNull).findFirst().orElse(null);
        return new CatalogItem(p.id(), p.title(), p.brand(), p.categoryId(), variants, image);
    }
}
