package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.domain.SupplierAlias;
import com.maxsolch.shop.procurement.infra.SupplierAliasRepository;
import com.maxsolch.shop.procurement.infra.SupplierRepository;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Supplier memory for «Поставка с ИИ»: which product of ours a line of this supplier's document is. The admin
 * computes the key (normalized line text); the backend only stores the confirmed pairs, the last one wins.
 */
@Service
public class SupplierAliases {

    /** One import can confirm a few hundred lines; more is a mistake of the caller. */
    static final int MAX_PER_SAVE = 500;

    public record AliasDto(String sourceKey, String productId, @Nullable String variantId) {
    }

    public record AliasesRequest(List<AliasDto> aliases) {
    }

    private final SupplierAliasRepository aliases;
    private final SupplierRepository suppliers;
    private final Products products;

    public SupplierAliases(SupplierAliasRepository aliases, SupplierRepository suppliers, Products products) {
        this.aliases = aliases;
        this.suppliers = suppliers;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public List<AliasDto> of(long supplierId) {
        requireSupplier(supplierId);
        return aliases.findAllBySupplierId(supplierId).stream()
                .map(a -> new AliasDto(a.getSourceKey(), UuidUtil.toString(a.getProductId()), UuidUtil.toString(a.getVariantId())))
                .toList();
    }

    /** Inserts or overwrites the given pairs; returns the supplier's whole memory. */
    @Transactional
    public List<AliasDto> save(long supplierId, AliasesRequest req) {
        requireSupplier(supplierId);
        List<AliasDto> wanted = req == null || req.aliases() == null ? List.of() : req.aliases();
        if (wanted.isEmpty() || wanted.size() > MAX_PER_SAVE) {
            throw new DomainException.BadRequest(ProcurementError.EMPTY_REQUEST);
        }
        Map<String, AliasDto> byKey = wanted.stream()
                .collect(Collectors.toMap(a -> key(a.sourceKey()), Function.identity(), (x, y) -> y));
        Map<String, SupplierAlias> existing = aliases.findAllBySupplierIdAndSourceKeyIn(supplierId, byKey.keySet()).stream()
                .collect(Collectors.toMap(SupplierAlias::getSourceKey, Function.identity(), (x, y) -> x));
        for (Map.Entry<String, AliasDto> e : byKey.entrySet()) {
            SupplierAlias a = existing.computeIfAbsent(e.getKey(), k -> fresh(supplierId, k));
            point(a, e.getValue());
            aliases.save(a);
        }
        return of(supplierId);
    }

    private void point(SupplierAlias a, AliasDto dto) {
        byte[] productId = Lines.bytes(dto.productId());
        Product p = products.findById(productId)
                .orElseThrow(() -> new DomainException.BadRequest(ProcurementError.BAD_PRODUCT, String.valueOf(dto.productId())));
        byte[] variantId = null;
        if (dto.variantId() != null && !dto.variantId().isBlank()) {
            if (p.variant(Lines.bytes(dto.variantId())) == null) {
                throw new DomainException.BadRequest(ProcurementError.BAD_VARIANT, p.getTitle());
            }
            variantId = Lines.bytes(dto.variantId());
        }
        a.setProductId(productId);
        a.setVariantId(variantId);
    }

    private static SupplierAlias fresh(long supplierId, String key) {
        SupplierAlias a = new SupplierAlias();
        a.setSupplierId(supplierId);
        a.setSourceKey(key);
        return a;
    }

    private static String key(String raw) {
        String k = raw == null ? "" : raw.trim();
        if (k.isEmpty() || k.length() > 255) {
            throw new DomainException.BadRequest(ProcurementError.BAD_ALIAS);
        }
        return k;
    }

    private void requireSupplier(long supplierId) {
        if (!suppliers.existsById(supplierId)) {
            throw new DomainException.BadRequest(ProcurementError.BAD_SUPPLIER);
        }
    }
}
