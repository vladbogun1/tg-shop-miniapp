package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.infra.SupplierRepository;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.procurement.domain.PreorderBatch.Distribution;
import com.maxsolch.shop.procurement.domain.PreorderBatch.EtaMode;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveLine;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveLineResult;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ArriveResult;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchDto;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.BatchSummaryDto;
import com.maxsolch.shop.procurement.app.BatchDtos.CancelRequest;
import com.maxsolch.shop.procurement.app.BatchDtos.ItemDto;
import com.maxsolch.shop.procurement.app.BatchDtos.ItemRequest;
import com.maxsolch.shop.catalog.app.Products;
import com.maxsolch.shop.platform.settings.SettingsRegistry;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.procurement.domain.BatchQueue;
import com.maxsolch.shop.procurement.domain.Lines;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Admin «Поставки» (docs/PREORDERS-PLAN.md §5): batches with their lines and purchase prices, statuses,
 * arrival (restock + hand-out to the queues), cancellation, queues per batch/line, «Чего ждут», suppliers.
 * Purchase prices and the exchange rate are read and written only when {@code money} is true (main admin).
 */
@Service
public class PreorderBatchService {

    public static final Set<String> CURRENCIES = Set.of("USD", "EUR", "CNY", "PLN", "UAH");
    static final int MAX_HOLD_HOURS = 168;
    private static final DateTimeFormatter TITLE_DATE = DateTimeFormatter.ofPattern("dd.MM");

    private final PreorderBatchRepository batches;
    private final PreorderBatchItemRepository items;
    private final SupplierRepository suppliers;
    private final Products products;
    private final BatchQueue queue;
    private final LineProducts lineProducts;
    private final SettingsService settings;
    private final Clock clock;
    private final ShopZone shopZone;
    /** FIFO stock lots: an arrival becomes a lot priced by the batch. */
    private final com.maxsolch.shop.inventory.app.LotLedger ledger;
    /** Public pages show «скоро в наличии» and ETAs: rebuilt once a change commits. */
    private final com.maxsolch.shop.site.app.SiteRevalidator siteRevalidator;

    public PreorderBatchService(PreorderBatchRepository batches, PreorderBatchItemRepository items,
                                SupplierRepository suppliers,
                                Products products, BatchQueue queue, LineProducts lineProducts,
                                SettingsService settings,
                                com.maxsolch.shop.inventory.app.LotLedger ledger,
                                com.maxsolch.shop.site.app.SiteRevalidator siteRevalidator, Clock clock,
                                ShopZone shopZone) {
        this.batches = batches;
        this.items = items;
        this.suppliers = suppliers;
        this.products = products;
        this.queue = queue;
        this.lineProducts = lineProducts;
        this.settings = settings;
        this.ledger = ledger;
        this.siteRevalidator = siteRevalidator;
        this.clock = clock;
        this.shopZone = shopZone;
    }

    /** Public pages show «скоро в наличии» and ETAs: rebuild them once the change commits. */
    private void publicChanged() {
        siteRevalidator.allChanged();
    }

    // ---------------------------------------------------------------- batches

    /** {@code filter}: open (default) | arrived | cancelled | all. */
    @Transactional(readOnly = true)
    public List<BatchSummaryDto> list(String filter) {
        String f = filter == null ? "open" : filter.trim().toLowerCase(Locale.ROOT);
        List<PreorderBatch> rows = switch (f) {
            case "all" -> batches.findAllByOrderByCreatedAtDesc();
            case "arrived" -> batches.findByStatusInOrderByCreatedAtDesc(List.of(PreorderBatch.Status.ARRIVED.name()));
            case "cancelled" -> batches.findByStatusInOrderByCreatedAtDesc(List.of(PreorderBatch.Status.CANCELLED.name()));
            default -> batches.findByStatusInOrderByCreatedAtDesc(List.of(PreorderBatch.Status.ORDERED.name(),
                    PreorderBatch.Status.IN_TRANSIT.name(), PreorderBatch.Status.CUSTOMS.name()));
        };
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<Long, List<PreorderBatchItem>> linesOf = items.findByBatchIdIn(rows.stream().map(PreorderBatch::getId).toList())
                .stream().collect(Collectors.groupingBy(PreorderBatchItem::getBatchId));
        Map<String, long[]> demand = queue.waitingByLine();
        Map<Long, String> supplierNames = supplierNames();
        List<BatchSummaryDto> out = new ArrayList<>();
        for (PreorderBatch b : rows) {
            List<PreorderBatchItem> lines = linesOf.getOrDefault(b.getId(), List.of());
            long people = 0;
            long units = 0;
            for (PreorderBatchItem i : lines) {
                long[] d = demand.get(Lines.key(i.getProductId(), i.getVariantId()));
                if (d != null) {
                    people += d[0];
                    units += d[1];
                }
            }
            out.add(new BatchSummaryDto(b.getId(), b.getTitle(), supplierNames.get(b.getSupplierId()), b.getStatus(),
                    b.getEtaMode(), b.getEtaFrom(), b.getEtaTo(), b.isPreorderOpen(), lines.size(),
                    lines.stream().mapToInt(PreorderBatchItem::getQtyOrdered).sum(), people, units,
                    b.getCreatedAt(), b.getArrivedAt()));
        }
        return out;
    }

    @Transactional(readOnly = true)
    public BatchDto get(long id, boolean money) {
        return toDto(find(id), money);
    }

    @Transactional
    public BatchDto create(BatchRequest req, String adminName, boolean money) {
        PreorderBatch b = new PreorderBatch();
        b.setHoldHours(settings.getInt(SettingsRegistry.PREORDER_HOLD_HOURS));
        b.setCostAllocation(settings.getString(SettingsRegistry.COSTING_DEFAULT_DISTRIBUTION));
        b.setCreatedBy(adminName);
        apply(b, req, money);
        if (req.items() == null || req.items().isEmpty()) {
            throw new DomainException.BadRequest(ProcurementError.NO_ITEMS);
        }
        PreorderBatch saved = batches.save(b);
        saveItems(saved, req.items(), List.of(), money);
        publicChanged();
        return toDto(saved, money);
    }

    /** Edits the batch; lines can change only while it is on the way. {@code items} null = keep the lines. */
    @Transactional
    public BatchDto update(long id, BatchRequest req, boolean money) {
        PreorderBatch b = batches.findForUpdate(id).orElseThrow(() -> notFound(id));
        apply(b, req, money);
        if (req.items() != null) {
            if (!b.statusEnum().open()) {
                throw new DomainException.BadRequest(ProcurementError.BATCH_CLOSED_ITEMS);
            }
            if (req.items().isEmpty()) {
                throw new DomainException.BadRequest(ProcurementError.NO_ITEMS);
            }
            saveItems(b, req.items(), items.findByBatchIdOrderByIdAsc(id), money);
        }
        publicChanged();
        return toDto(batches.save(b), money);
    }

    /** ORDERED / IN_TRANSIT / CUSTOMS — admin-only stages, customers are not messaged. */
    @Transactional
    public BatchDto setStatus(long id, String status, boolean money) {
        PreorderBatch b = batches.findForUpdate(id).orElseThrow(() -> notFound(id));
        if (!b.statusEnum().open()) {
            throw new DomainException.BadRequest(ProcurementError.BATCH_CLOSED);
        }
        PreorderBatch.Status to = parse(PreorderBatch.Status.class, status, null, "статус");
        if (!to.open()) {
            throw new DomainException.BadRequest(ProcurementError.BAD_STATUS);
        }
        if (to != PreorderBatch.Status.ORDERED && b.getInTransitAt() == null) {
            b.setInTransitAt(clock.instant());
        }
        b.setStatus(to.name());
        publicChanged();
        return toDto(batches.save(b), money);
    }

    /**
     * «Приехала»: puts what came on the shelf (and the new selling price), then hands it to the queues.
     * {@code dryRun} — the preview: same numbers, nothing written.
     */
    @Transactional
    @Caching(evict = {
            @CacheEvict(value = "products", allEntries = true),
            @CacheEvict(value = "productById", allEntries = true)
    })
    public ArriveResult arrive(long id, ArriveRequest req) {
        boolean dry = req != null && Boolean.TRUE.equals(req.dryRun());
        PreorderBatch b = (dry ? batches.findById(id) : batches.findForUpdate(id)).orElseThrow(() -> notFound(id));
        if (!b.statusEnum().open()) {
            throw new DomainException.BadRequest(ProcurementError.BATCH_CLOSED);
        }
        Distribution mode = parse(Distribution.class, req == null ? null : req.distribution(),
                b.distributionEnum(), "режим раздачи");
        int hold = req != null && req.holdHours() != null ? clampHold(req.holdHours()) : b.getHoldHours();
        Map<Long, ArriveLine> asked = new HashMap<>();
        if (req != null && req.items() != null) {
            req.items().forEach(l -> asked.put(l.itemId(), l));
        }

        List<PreorderBatchItem> lines = new ArrayList<>(items.findByBatchIdOrderByIdAsc(id));
        // product rows are locked in id order, like checkout, so two arrivals cannot deadlock
        lines.sort(Comparator.comparing((PreorderBatchItem i) -> UuidUtil.toString(i.getProductId())));
        List<ArriveLineResult> out = new ArrayList<>();
        for (PreorderBatchItem i : lines) {
            ArriveLine a = asked.get(i.getId());
            int arrived = a != null && a.qtyArrived() != null ? a.qtyArrived() : i.getQtyOrdered();
            if (arrived < 0) {
                throw new DomainException.BadRequest(ProcurementError.BAD_QTY);
            }
            Long price = a == null ? null : a.priceMinor();
            if (price != null && price <= 0) {
                throw new DomainException.BadRequest(ProcurementError.BAD_PRICE_NOT_POSITIVE);
            }
            Product p = (dry ? products.findById(i.getProductId()) : products.findByIdForUpdate(i.getProductId()))
                    .orElseThrow(() -> new DomainException.BadRequest(ProcurementError.PRODUCT_GONE));
            ProductVariant v = Lines.variantById(p, i.getVariantId());
            if (i.getVariantId() != null && v == null) {
                throw new DomainException.BadRequest(ProcurementError.VARIANT_GONE, p.getTitle());
            }
            int stockAfter = Lines.stockOf(p, v) + arrived;
            BatchQueue.HandOut h;
            if (dry) {
                h = queue.preview(p.getId(), i.getVariantId(), stockAfter, mode);
            } else {
                if (v != null) {
                    v.setStock(v.getStock() + arrived);
                    p.setStock(p.getVariants().stream().mapToInt(ProductVariant::getStock).sum());
                } else {
                    p.setStock(p.getStock() + arrived);
                }
                if (price != null) {
                    p.setPriceMinor(price);
                }
                products.save(p);
                i.setQtyArrived(arrived);
                if (arrived > 0) {
                    ledger.receive(p.getId(), i.getVariantId(), i.getId(), arrived);
                }
                h = queue.handOut(p, v, b.getId(), mode, hold);
            }
            out.add(new ArriveLineResult(i.getId(), p.getTitle(), v == null ? null : v.getName(), arrived, stockAfter,
                    h.heldPeople(), h.heldQty(), h.notifiedPeople(), h.shortPeople(), h.freeAfter(),
                    price != null ? price : p.getPriceMinor()));
        }
        if (!dry) {
            items.saveAll(lines);
            b.setStatus(PreorderBatch.Status.ARRIVED.name());
            b.setArrivedAt(clock.instant());
            b.setDistribution(mode.name());
            b.setHoldHours(hold);
            batches.save(b);
        }
        out.sort(Comparator.comparingLong(ArriveLineResult::itemId));
        return new ArriveResult(dry, mode.name(), hold, out);
    }

    /**
     * Cancels a batch. Everybody WAITING on its lines is told. {@code closeQueue} (or the shop not taking
     * waiters without a batch, {@code preorder.anyProduct} off) — they are taken off the queues; otherwise
     * they stay as «wait for the product» without a date. Holds are not touched: a batch that never
     * arrived has none.
     */
    @Transactional
    public BatchDto cancel(long id, CancelRequest req, boolean money) {
        PreorderBatch b = batches.findForUpdate(id).orElseThrow(() -> notFound(id));
        if (!b.statusEnum().open()) {
            throw new DomainException.BadRequest(ProcurementError.BATCH_CLOSED);
        }
        Instant now = clock.instant();
        b.setStatus(PreorderBatch.Status.CANCELLED.name());
        b.setCancelledAt(now);
        if (req != null && req.note() != null && !req.note().isBlank()) {
            String old = b.getPrivateNote() == null ? "" : b.getPrivateNote() + "\n";
            b.setPrivateNote(old + "Отменена: " + req.note().trim());
        }
        boolean close = (req != null && Boolean.TRUE.equals(req.closeQueue()))
                || !settings.getBool(SettingsRegistry.PREORDER_ANY_PRODUCT);
        queue.onBatchCancelled(items.findByBatchIdOrderByIdAsc(id).stream()
                .map(i -> new byte[][]{i.getProductId(), i.getVariantId()}).toList(), close, now);
        publicChanged();
        return toDto(batches.save(b), money);
    }

    // ---------------------------------------------------------------- internals

    private void apply(PreorderBatch b, BatchRequest req, boolean money) {
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
    private void saveItems(PreorderBatch b, List<ItemRequest> wanted, List<PreorderBatchItem> current, boolean money) {
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

    private BatchDto toDto(PreorderBatch b, boolean money) {
        List<PreorderBatchItem> lines = items.findByBatchIdOrderByIdAsc(b.getId());
        Map<String, Product> byId = lineProducts.productsOf(lines.stream().map(PreorderBatchItem::getProductId).toList());
        Map<String, long[]> demand = queue.waitingByLine();
        List<ItemDto> itemDtos = new ArrayList<>();
        for (PreorderBatchItem i : lines) {
            Product p = byId.get(UuidUtil.toString(i.getProductId()));
            ProductVariant v = p == null ? null : Lines.variantById(p, i.getVariantId());
            long[] d = demand.getOrDefault(Lines.key(i.getProductId(), i.getVariantId()), new long[2]);
            itemDtos.add(new ItemDto(i.getId(), UuidUtil.toString(i.getProductId()),
                    i.getVariantId() == null ? null : UuidUtil.toString(i.getVariantId()),
                    p == null ? "(товар удалён)" : p.getTitle(), v == null ? null : v.getName(),
                    p == null ? null : Lines.imageOf(p),
                    p == null ? 0 : Lines.stockOf(p, v), p == null ? 0 : p.getPriceMinor(),
                    i.getQtyOrdered(), i.getQtyArrived(), money ? i.getUnitPriceFx() : null, d[0], d[1]));
        }
        return new BatchDto(b.getId(), b.getTitle(), b.getSupplierId(), supplierNames().get(b.getSupplierId()),
                b.getPrivateNote(), b.getPublicNote(), b.getStatus(), b.getEtaMode(), b.getEtaFrom(), b.getEtaTo(),
                b.statusEnum().open() ? BatchCatalog.eta(b, shopZone.today(clock)) : null, b.getHoldHours(), b.getDistribution(),
                b.isPreorderOpen(), b.getCurrency(), money ? b.getFxRate() : null, money, itemDtos,
                b.getCreatedBy(), b.getCreatedAt(), b.getInTransitAt(), b.getArrivedAt(), b.getCancelledAt());
    }

    private Map<Long, String> supplierNames() {
        Map<Long, String> out = new HashMap<>();
        suppliers.findAll().forEach(s -> out.put(s.getId(), s.getName()));
        return out;
    }

    private PreorderBatch find(long id) {
        return batches.findById(id).orElseThrow(() -> notFound(id));
    }

    private static RuntimeException notFound(long id) {
        return new DomainException.NotFound(ProcurementError.BATCH_NOT_FOUND_BY_ID, String.valueOf(id));
    }

    private static int clampHold(int hours) {
        if (hours < 1 || hours > MAX_HOLD_HOURS) {
            throw new DomainException.BadRequest(ProcurementError.BAD_HOLD, String.valueOf(MAX_HOLD_HOURS));
        }
        return hours;
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, E fallback, String what) {
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

    static String trimTo(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.isEmpty()) {
            return null;
        }
        return t.length() > max ? t.substring(0, max) : t;
    }
}
