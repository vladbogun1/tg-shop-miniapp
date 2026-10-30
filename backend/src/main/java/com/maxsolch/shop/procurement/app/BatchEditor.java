package com.maxsolch.shop.procurement.app;

import static com.maxsolch.shop.procurement.app.PreorderBatchService.CURRENCIES;
import static com.maxsolch.shop.procurement.app.PreorderBatchService.trimTo;

import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ItemRequest;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import com.maxsolch.shop.procurement.domain.PreorderBatch.EtaMode;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.SupplierRepository;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The admin's batch form written onto a batch and its lines, with the checks: title, supplier, ETA,
 * hold, distribution, money fields (only when {@code money}), the lines. Runs inside the caller's
 * transaction ({@link PreorderBatchService}).
 */
@Component
class BatchEditor {

    static final int MAX_HOLD_HOURS = 168;
    private static final DateTimeFormatter TITLE_DATE = DateTimeFormatter.ofPattern("dd.MM");

    private final SupplierRepository suppliers;
    private final Products products;
    private final PreorderBatchItemRepository items;
    private final Clock clock;
    private final ShopZone shopZone;

    BatchEditor(SupplierRepository suppliers, Products products, PreorderBatchItemRepository items, Clock clock,
                ShopZone shopZone) {
        this.suppliers = suppliers;
        this.products = products;
        this.items = items;
        this.clock = clock;
        this.shopZone = shopZone;
    }

    void apply(PreorderBatch b, BatchRequest req, boolean money) {
        if (req == null) {
            throw new DomainException.BadRequest(ProcurementError.EMPTY_REQUEST);
        }
        String title = req.title() == null ? "" : req.title().trim();
        if (title.isEmpty()) {
            title = b.getTitle() != null ? b.getTitle()
                    : "Поставка от " + shopZone.today(clock).format(TITLE_DATE);
        }
        b.setTitle(trimTo(title, 255));
        if (req.supplierId() != null && !suppliers.existsById(req.supplierId())) {
            throw new DomainException.BadRequest(ProcurementError.BAD_SUPPLIER);
        }
        b.setSupplierId(req.supplierId());
        b.setPrivateNote(req.privateNote() == null ? null : req.privateNote().trim());
        b.setPublicNote(trimTo(req.publicNote(), 1000));

        EtaMode mode = parse(EtaMode.class, req.etaMode(), EtaMode.HIDDEN, "формат срока");
        LocalDate from = req.etaFrom();
        LocalDate to = req.etaTo();
        switch (mode) {
            case DATE -> {
                if (from == null) {
                    throw new DomainException.BadRequest(ProcurementError.BAD_ETA);
                }
                to = null;
            }
            case RANGE -> {
                if (from == null || to == null || to.isBefore(from)) {
                    throw new DomainException.BadRequest(ProcurementError.BAD_ETA_RANGE);
                }
            }
            case APPROX -> {
                // stored as the target date; the customer sees «~N тижнів» counted from today
                to = to != null ? to : from;
                from = null;
                if (to == null) {
                    throw new DomainException.BadRequest(ProcurementError.BAD_ETA_APPROX);
                }
            }
            case HIDDEN -> {
                from = null;
                to = null;
            }
        }
        b.setEtaMode(mode.name());
        b.setEtaFrom(from);
        b.setEtaTo(to);
        if (req.holdHours() != null) {
            b.setHoldHours(clampHold(req.holdHours()));
        }
        b.setDistribution(parse(Distribution.class, req.distribution(), b.distributionEnum(), "режим раздачи").name());
        if (req.preorderOpen() != null) {
            b.setPreorderOpen(req.preorderOpen());
        }
        if (money) {
            if (req.currency() != null) {
                String c = req.currency().trim().toUpperCase(Locale.ROOT);
                if (!CURRENCIES.contains(c)) {
                    throw new DomainException.BadRequest(ProcurementError.BAD_CURRENCY, String.join(", ", CURRENCIES));
                }
                b.setCurrency(c);
            }
            if (req.fxRate() != null && req.fxRate().signum() <= 0) {
                throw new DomainException.BadRequest(ProcurementError.BAD_RATE_NOT_POSITIVE);
            }
            b.setFxRate(req.fxRate());
        }
    }

    /** Replaces the lines with {@code wanted}: existing ones by id are updated, the rest added or removed. */
    void saveItems(PreorderBatch b, List<ItemRequest> wanted, List<PreorderBatchItem> current, boolean money) {
        Map<Long, PreorderBatchItem> byId = current.stream()
                .collect(Collectors.toMap(PreorderBatchItem::getId, Function.identity(), (x, y) -> x, LinkedHashMap::new));
        Set<String> lines = new HashSet<>();
        List<PreorderBatchItem> keep = new ArrayList<>();
        for (ItemRequest r : wanted) {
            byte[] productId = Lines.bytes(r.productId());
            Product p = products.findById(productId)
                    .orElseThrow(() -> new DomainException.BadRequest(ProcurementError.BAD_PRODUCT, String.valueOf(r.productId())));
            boolean hasVariants = p.getVariants() != null && !p.getVariants().isEmpty();
            byte[] variantId = null;
            if (r.variantId() != null && !r.variantId().isBlank()) {
                ProductVariant v = Lines.variantById(p, Lines.bytes(r.variantId()));
                if (v == null) {
                    throw new DomainException.BadRequest(ProcurementError.BAD_VARIANT, p.getTitle());
                }
                variantId = v.getId();
            } else if (hasVariants) {
                throw new DomainException.BadRequest(ProcurementError.VARIANT_REQUIRED, p.getTitle());
            }
            if (!lines.add(Lines.key(productId, variantId))) {
                throw new DomainException.BadRequest(ProcurementError.DUPLICATE_LINE, p.getTitle());
            }
            int qty = r.qtyOrdered() == null ? 0 : r.qtyOrdered();
            if (qty < 1 || qty > 100_000) {
                throw new DomainException.BadRequest(ProcurementError.BAD_QTY_ORDERED, p.getTitle());
            }
            PreorderBatchItem i = r.id() != null ? byId.remove(r.id()) : null;
            if (i == null) {
                i = new PreorderBatchItem();
                i.setBatchId(b.getId());
            }
            i.setProductId(productId);
            i.setVariantId(variantId);
            i.setQtyOrdered(qty);
            if (money) {
                if (r.unitPriceFx() != null && r.unitPriceFx() < 0) {
                    throw new DomainException.BadRequest(ProcurementError.BAD_PRICE);
                }
                i.setUnitPriceFx(r.unitPriceFx());
            }
            keep.add(i);
        }
        items.deleteAll(byId.values());
        items.saveAll(keep);
    }

    static int clampHold(int hours) {
        if (hours < 1 || hours > MAX_HOLD_HOURS) {
            throw new DomainException.BadRequest(ProcurementError.BAD_HOLD, String.valueOf(MAX_HOLD_HOURS));
        }
        return hours;
    }

    static <E extends Enum<E>> E parse(Class<E> type, String value, E fallback, String what) {
        if (value == null || value.isBlank()) {
            if (fallback == null) {
                throw new DomainException.BadRequest(ProcurementError.FIELD_REQUIRED, what);
            }
            return fallback;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(ProcurementError.UNKNOWN_VALUE, what, value, Arrays.toString(type.getEnumConstants()));
        }
    }
}
