package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.CatalogError;
import com.maxsolch.shop.catalog.domain.CatalogSnapshot;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A few products by id for the admin screens that show only them (a supply's rows, the gift field),
 * so they don't download the whole catalog. Archived products are included (a supply row may point at one);
 * ids that don't exist are skipped — the screen shows those rows as gone.
 */
@Service
public class AdminProductsByIds {

    /** A supply has a few dozen rows; more than this is a mistake, not a page. */
    public static final int MAX_IDS = 200;

    private final ProductRepository productRepository;
    private final CatalogDirectory catalogDirectory;

    public AdminProductsByIds(ProductRepository productRepository, CatalogDirectory catalogDirectory) {
        this.productRepository = productRepository;
        this.catalogDirectory = catalogDirectory;
    }

    /** Products in the order of {@code ids}; blank and repeated ids are ignored. */
    @Transactional(readOnly = true)
    public List<AdminProductDto> byIds(List<String> ids) {
        Set<String> wanted = new LinkedHashSet<>();
        for (String raw : ids == null ? List.<String>of() : ids) {
            if (raw != null && !raw.isBlank()) {
                wanted.add(raw.trim().toLowerCase());
            }
        }
        if (wanted.isEmpty()) {
            return List.of();
        }
        if (wanted.size() > MAX_IDS) {
            throw new DomainException.BadRequest(CatalogError.TOO_MANY_IDS, MAX_IDS);
        }
        List<byte[]> keys = new ArrayList<>(wanted.size());
        for (String id : wanted) {
            keys.add(parse(id));
        }
        Map<String, Product> found = new HashMap<>();
        for (Product p : productRepository.findAllByIdIn(keys)) {
            found.put(UuidUtil.toString(p.getId()), p);
        }
        CatalogSnapshot catalog = catalogDirectory.snapshot();
        List<AdminProductDto> out = new ArrayList<>(found.size());
        for (String id : wanted) {
            Product p = found.get(id);
            if (p != null) {
                out.add(AdminProductDto.of(p, catalog));
            }
        }
        return out;
    }

    private static byte[] parse(String id) {
        try {
            return UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(CatalogError.INVALID_ID, id);
        }
    }
}
