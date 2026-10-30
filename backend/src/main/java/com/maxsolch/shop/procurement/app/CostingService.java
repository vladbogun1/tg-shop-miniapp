package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.inventory.app.LotLedger;
import com.maxsolch.shop.inventory.domain.StockLot;
import com.maxsolch.shop.procurement.domain.BatchCost;
import com.maxsolch.shop.procurement.domain.BatchExpense;
import com.maxsolch.shop.procurement.domain.BatchExpenseFile;
import com.maxsolch.shop.procurement.infra.BatchExpenseFileRepository;
import com.maxsolch.shop.procurement.infra.BatchExpenseRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.procurement.app.CostingDtos.BatchMoneyDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ExpenseDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ExpenseFileDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ExpenseRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.LotDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyLineDto;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyLineRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.OpeningRowDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ProductCostDto;
import com.maxsolch.shop.procurement.app.CostingDtos.ReconcileDto;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import com.maxsolch.shop.procurement.domain.Lines;
import com.maxsolch.shop.procurement.domain.ProcurementErrors;
import com.maxsolch.shop.catalog.app.Products;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * The money of batches (§5А.1): purchase prices, rate, expenses and how they are spread; the cost of each
 * stock lot (a {@link CostBook}), the product's lots and «Начальная себестоимость». Callers check the
 * «Финансы» right; nothing here reaches the public API.
 */
@Service
public class CostingService {

    private final PreorderBatchRepository batches;
    private final PreorderBatchItemRepository items;
    private final BatchExpenseRepository expenses;
    private final Products products;
    private final LineProducts queue;
    private final LotLedger ledger;
    private final BatchExpenseFileRepository files;
    private final ImageStorageService storage;

    public CostingService(PreorderBatchRepository batches, PreorderBatchItemRepository items,
                          BatchExpenseRepository expenses, Products products,
                          LineProducts queue, LotLedger ledger, BatchExpenseFileRepository files,
                          ImageStorageService storage) {
        this.files = files;
        this.storage = storage;
        this.batches = batches;
        this.items = items;
        this.expenses = expenses;
        this.products = products;
        this.queue = queue;
        this.ledger = ledger;
    }

    /** The cost of a unit of a lot; {@code minor} null = unknown. */
    public record UnitCost(Long minor, boolean preliminary) {
        static final UnitCost UNKNOWN = new UnitCost(null, false);
    }

    /** Unit costs of lots, computed once per request from the batches they came from. */
    public final class CostBook {
        private final Map<Long, UnitCost> byBatchItem = new HashMap<>();
        private final Map<Long, PreorderBatchItem> batchItems = new HashMap<>();
        private final Map<Long, PreorderBatch> batchById = new HashMap<>();

        public UnitCost of(StockLot lot) {
            if (lot == null) {
                return UnitCost.UNKNOWN;
            }
            if (lot.batch()) {
                return byBatchItem.getOrDefault(lot.getBatchItemId(), UnitCost.UNKNOWN);
            }
            return new UnitCost(lot.getUnitCostMinor(), false);
        }

        public PreorderBatch batchOf(StockLot lot) {
            PreorderBatchItem i = lot == null || lot.getBatchItemId() == null ? null : batchItems.get(lot.getBatchItemId());
            return i == null ? null : batchById.get(i.getBatchId());
        }
    }

    @Transactional(readOnly = true)
    public CostBook book(Collection<StockLot> forLots) {
        CostBook book = new CostBook();
        Set<Long> itemIds = forLots.stream().map(StockLot::getBatchItemId).filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (itemIds.isEmpty()) {
            return book;
        }
        Set<Long> batchIds = items.findAllById(itemIds).stream().map(PreorderBatchItem::getBatchId)
                .collect(Collectors.toSet());
        for (PreorderBatch b : batches.findAllById(batchIds)) {
            List<PreorderBatchItem> lines = items.findByBatchIdOrderByIdAsc(b.getId());
            BatchCost.Result r = compute(b, lines);
            boolean preliminary = !b.isCostsFinal() || !r.problems().isEmpty();
            book.batchById.put(b.getId(), b);
            for (PreorderBatchItem i : lines) {
                book.batchItems.put(i.getId(), i);
                BatchCost.LineCost c = r.byLine().get(i.getId());
                book.byBatchItem.put(i.getId(), new UnitCost(c == null ? null : c.costUnitMinor(), preliminary));
            }
        }
        return book;
    }

    // ---------------------------------------------------------------- batch money

    @Transactional(readOnly = true)
    public BatchMoneyDto money(long batchId) {
        PreorderBatch b = batch(batchId);
        List<PreorderBatchItem> lines = items.findByBatchIdOrderByIdAsc(batchId);
        List<BatchExpense> ex = expenses.findByBatchIdOrderByIdAsc(batchId);
        BatchCost.Result r = compute(b, lines, ex);
        Map<Long, BatchCost.LineCost> cost = r.byLine();
        Map<String, Product> byId = queue.productsOf(lines.stream().map(PreorderBatchItem::getProductId).toList());
        List<MoneyLineDto> out = new ArrayList<>();
        for (PreorderBatchItem i : lines) {
            Product p = byId.get(UuidUtil.toString(i.getProductId()));
            ProductVariant v = p == null ? null : Lines.variantById(p, i.getVariantId());
            BatchCost.LineCost c = cost.get(i.getId());
            long price = p == null ? 0 : p.getPriceMinor();
            Long unit = c == null ? null : c.costUnitMinor();
            Long margin = unit == null || price <= 0 ? null : price - unit;
            out.add(new MoneyLineDto(i.getId(), UuidUtil.toString(i.getProductId()),
                    i.getVariantId() == null ? null : UuidUtil.toString(i.getVariantId()),
                    p == null ? "(товар удалён)" : p.getTitle(), v == null ? null : v.getName(),
                    p == null ? null : Lines.imageOf(p), i.getQtyOrdered(), i.getQtyArrived(),
                    qtyOf(i), i.getUnitPriceFx(), i.getWeightG(), i.getManualExtraMinor(),
                    c == null ? null : c.purchaseUnitMinor(), c == null ? null : c.purchaseLineMinor(),
                    c == null ? 0 : c.extraLineMinor(), c == null ? 0 : c.extraUnitMinor(), unit, price, margin,
                    margin == null ? null : pct(margin, price)));
        }
        Map<Long, List<ExpenseFileDto>> docs = files.findByExpenseIdInOrderByIdAsc(
                        ex.stream().map(BatchExpense::getId).toList()).stream()
                .collect(Collectors.groupingBy(BatchExpenseFile::getExpenseId, Collectors.mapping(
                        f -> new ExpenseFileDto(f.getId(), f.getFileName(), f.getContentType(), f.getSizeBytes(),
                                f.getCreatedAt()), Collectors.toList())));
        List<ExpenseDto> exDtos = ex.stream().map(e -> toDto(e, docs.getOrDefault(e.getId(), List.of()))).toList();
        boolean preliminary = !b.isCostsFinal() || !r.problems().isEmpty();
        return new BatchMoneyDto(b.getId(), b.getTitle(), b.getStatus(), b.getCurrency(), b.getFxRate(),
                b.getCostAllocation(), b.isCostsFinal(), preliminary, out, exDtos, r.purchaseMinor(),
                r.expensesMinor(), r.purchaseMinor() > 0 ? pct(r.expensesMinor(), r.purchaseMinor()) : null,
                r.unassignedMinor(), r.purchaseMinor() + r.expensesMinor(), r.problems());
    }

    @Transactional
    public BatchMoneyDto saveMoney(long batchId, MoneyRequest req) {
        PreorderBatch b = batch(batchId);
        if (req == null) {
            throw ProcurementErrors.badRequest("Пустой запрос");
        }
        if (req.currency() != null) {
            String c = req.currency().trim().toUpperCase(Locale.ROOT);
            if (!PreorderBatchService.CURRENCIES.contains(c)) {
                throw ProcurementErrors.badRequest("Валюта: " + String.join(", ", PreorderBatchService.CURRENCIES),
                        "BAD_CURRENCY");
            }
            b.setCurrency(c);
        }
        if (req.fxRate() != null) {
            b.setFxRate(rate(req.fxRate()));
        }
        if (req.allocation() != null) {
            b.setCostAllocation(allocation(req.allocation()).name());
        }
        if (req.costsFinal() != null) {
            b.setCostsFinal(req.costsFinal());
        }
        batches.save(b);
        if (req.lines() != null) {
            Map<Long, PreorderBatchItem> byId = items.findByBatchIdOrderByIdAsc(batchId).stream()
                    .collect(Collectors.toMap(PreorderBatchItem::getId, Function.identity()));
            for (MoneyLineRequest l : req.lines()) {
                PreorderBatchItem i = byId.get(l.itemId());
                if (i == null) {
                    throw ProcurementErrors.badRequest("Позиция " + l.itemId() + " не из этой поставки", "BAD_ITEM");
                }
                if (l.unitPriceFx() != null && l.unitPriceFx() < 0) {
                    throw ProcurementErrors.badRequest("Закупочная цена не может быть отрицательной", "BAD_PRICE");
                }
                if (l.weightG() != null && l.weightG() < 0) {
                    throw ProcurementErrors.badRequest("Вес не может быть отрицательным", "BAD_WEIGHT");
                }
                i.setUnitPriceFx(l.unitPriceFx());
                i.setWeightG(l.weightG());
                i.setManualExtraMinor(l.manualExtraMinor());
            }
            items.saveAll(byId.values());
        }
        return money(batchId);
    }

    @Transactional
    public BatchMoneyDto addExpense(long batchId, ExpenseRequest req, String adminName) {
        batch(batchId);
        BatchExpense e = new BatchExpense();
        e.setBatchId(batchId);
        e.setCreatedBy(adminName);
        applyExpense(e, req);
        expenses.save(e);
        return money(batchId);
    }

    @Transactional
    public BatchMoneyDto updateExpense(long expenseId, ExpenseRequest req) {
        BatchExpense e = expenses.findById(expenseId).orElseThrow(() -> ProcurementErrors.notFound("Расход не найден"));
        applyExpense(e, req);
        expenses.save(e);
        return money(e.getBatchId());
    }

    @Transactional
    public BatchMoneyDto deleteExpense(long expenseId) {
        BatchExpense e = expenses.findById(expenseId).orElseThrow(() -> ProcurementErrors.notFound("Расход не найден"));
        List<String> keys = files.findByExpenseId(expenseId).stream().map(BatchExpenseFile::getObjectKey).toList();
        expenses.delete(e); // the rows of its documents go with it (ON DELETE CASCADE)
        keys.forEach(storage::deleteQuietly);
        return money(e.getBatchId());
    }

    // ---------------------------------------------------------------- expense documents

    @Transactional
    public BatchMoneyDto addExpenseFile(long expenseId, MultipartFile file, String adminName) {
        BatchExpense e = expenses.findById(expenseId).orElseThrow(() -> ProcurementErrors.notFound("Расход не найден"));
        BatchExpenseFile f = new BatchExpenseFile();
        f.setExpenseId(expenseId);
        f.setObjectKey(storage.uploadCostingDocument(file, e.getBatchId()));
        String name = file.getOriginalFilename() == null || file.getOriginalFilename().isBlank()
                ? "документ" : file.getOriginalFilename().trim();
        f.setFileName(name.length() > 255 ? name.substring(name.length() - 255) : name);
        f.setContentType(file.getContentType());
        f.setSizeBytes(file.getSize());
        f.setCreatedBy(adminName);
        files.save(f);
        return money(e.getBatchId());
    }

    @Transactional(readOnly = true)
    public BatchExpenseFile expenseFile(long fileId) {
        return files.findById(fileId).orElseThrow(() -> ProcurementErrors.notFound("Документ не найден"));
    }

    @Transactional
    public BatchMoneyDto deleteExpenseFile(long fileId) {
        BatchExpenseFile f = expenseFile(fileId);
        long batchId = expenses.findById(f.getExpenseId()).map(BatchExpense::getBatchId)
                .orElseThrow(() -> ProcurementErrors.notFound("Расход не найден"));
        files.delete(f);
        storage.deleteQuietly(f.getObjectKey());
        return money(batchId);
    }

    private void applyExpense(BatchExpense e, ExpenseRequest req) {
        if (req == null || req.amountMinor() == null || req.amountMinor() == 0) {
            throw ProcurementErrors.badRequest("Укажите сумму расхода (компенсация — с минусом)", "BAD_AMOUNT");
        }
        String kind = req.kind() == null ? "OTHER" : req.kind().trim().toUpperCase(Locale.ROOT);
        try {
            BatchExpense.Kind.valueOf(kind);
        } catch (IllegalArgumentException ex) {
            throw ProcurementErrors.badRequest("Тип расхода: FREIGHT, CUSTOMS, BROKER, DOMESTIC, BANK, OTHER", "BAD_KIND");
        }
        String currency = req.currency() == null ? "UAH" : req.currency().trim().toUpperCase(Locale.ROOT);
        if (!PreorderBatchService.CURRENCIES.contains(currency)) {
            throw ProcurementErrors.badRequest("Валюта: " + String.join(", ", PreorderBatchService.CURRENCIES),
                    "BAD_CURRENCY");
        }
        if (req.itemId() != null && items.findById(req.itemId())
                .filter(i -> i.getBatchId().equals(e.getBatchId())).isEmpty()) {
            throw ProcurementErrors.badRequest("Позиция не из этой поставки", "BAD_ITEM");
        }
        e.setBatchItemId(req.itemId());
        e.setKind(kind);
        e.setAmountMinor(req.amountMinor());
        e.setCurrency(currency);
        e.setFxRate("UAH".equals(currency) ? null : req.fxRate() == null ? null : rate(req.fxRate()));
        e.setSpentOn(req.spentOn());
        e.setNote(req.note() == null || req.note().isBlank() ? null
                : req.note().trim().substring(0, Math.min(500, req.note().trim().length())));
    }

    BatchCost.Result compute(PreorderBatch b, List<PreorderBatchItem> lines) {
        return compute(b, lines, expenses.findByBatchIdOrderByIdAsc(b.getId()));
    }

    static BatchCost.Result compute(PreorderBatch b, List<PreorderBatchItem> lines, List<BatchExpense> ex) {
        return BatchCost.compute(b.getCurrency(), b.getFxRate(), allocation(b.getCostAllocation()),
                lines.stream().map(i -> new BatchCost.Line(i.getId(), qtyOf(i), i.getUnitPriceFx(), i.getWeightG(),
                        i.getManualExtraMinor())).toList(),
                ex.stream().map(e -> new BatchCost.Expense(e.getBatchItemId(), e.getAmountMinor(), e.getCurrency(),
                        e.getFxRate())).toList());
    }

    /** Arrived units once the batch came, the ordered ones before (a forecast of the cost). */
    static int qtyOf(PreorderBatchItem i) {
        return i.getQtyArrived() != null ? i.getQtyArrived() : i.getQtyOrdered();
    }

    // ---------------------------------------------------------------- product

    @Transactional(readOnly = true)
    public ProductCostDto product(String productId) {
        Product p = products.findById(UuidUtil.toBytes(productId))
                .orElseThrow(() -> ProcurementErrors.notFound("Товар не найден"));
        List<StockLot> all = ledger.lotsOfProduct(p.getId());
        CostBook book = book(all);
        List<LotDto> out = new ArrayList<>();
        StockLot next = null;
        for (StockLot l : all) {
            if (l.getQtyLeft() <= 0 && l.getQtyIn() <= 0) {
                continue;
            }
            ProductVariant v = Lines.variantById(p, l.getVariantId());
            UnitCost c = book.of(l);
            PreorderBatch b = book.batchOf(l);
            out.add(new LotDto(l.getId(), l.getVariantId() == null ? null : UuidUtil.toString(l.getVariantId()),
                    v == null ? null : v.getName(), l.getKind(), b == null ? null : b.getId(),
                    b == null ? null : b.getTitle(), l.getQtyIn(), l.getQtyLeft(), c.minor(), c.preliminary(),
                    l.getCreatedAt()));
            if (next == null && l.getQtyLeft() > 0) {
                next = l;
            }
        }
        UnitCost cur = book.of(next);
        long price = p.getPriceMinor();
        Long margin = cur.minor() == null || price <= 0 ? null : price - cur.minor();
        int onLots = all.stream().mapToInt(StockLot::getQtyLeft).sum();
        return new ProductCostDto(UuidUtil.toString(p.getId()), price, cur.minor(),
                next == null ? null : cur.preliminary(), margin, margin == null ? null : pct(margin, price),
                margin == null || cur.minor() <= 0 ? null : pct(margin, cur.minor()), p.getStock(), onLots, out);
    }

    /** Units on the shelf without a known cost (OPENING / MANUAL lots), one row per product (variant). */
    @Transactional(readOnly = true)
    public List<OpeningRowDto> opening() {
        Map<String, int[]> units = new LinkedHashMap<>();
        Map<String, Long> cost = new HashMap<>();
        Map<String, StockLot> sample = new HashMap<>();
        for (StockLot l : ledger.lotsOnShelf()) {
            if (l.batch()) {
                continue;
            }
            String key = Lines.key(l.getProductId(), l.getVariantId());
            units.computeIfAbsent(key, k -> new int[1])[0] += l.getQtyLeft();
            if (l.getUnitCostMinor() != null) {
                cost.put(key, l.getUnitCostMinor());
            }
            sample.putIfAbsent(key, l);
        }
        Map<String, Product> byId = queue.productsOf(sample.values().stream().map(StockLot::getProductId).toList());
        List<OpeningRowDto> out = new ArrayList<>();
        units.forEach((key, n) -> {
            StockLot l = sample.get(key);
            Product p = byId.get(UuidUtil.toString(l.getProductId()));
            if (p == null || p.isArchived()) {
                return;
            }
            ProductVariant v = Lines.variantById(p, l.getVariantId());
            out.add(new OpeningRowDto(UuidUtil.toString(p.getId()),
                    l.getVariantId() == null ? null : UuidUtil.toString(l.getVariantId()), p.getTitle(),
                    v == null ? null : v.getName(), Lines.imageOf(p), n[0], cost.get(key),
                    p.getPriceMinor()));
        });
        out.sort(Comparator.comparing(OpeningRowDto::title, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(r -> r.variantName() == null ? "" : r.variantName()));
        return out;
    }

    /** The admin types the cost of the old stock of one product (variant); null clears it. */
    @Transactional
    public void setOpening(OpeningRequest req) {
        if (req == null || req.productId() == null) {
            throw ProcurementErrors.badRequest("Не указан товар");
        }
        if (req.unitCostMinor() != null && req.unitCostMinor() < 0) {
            throw ProcurementErrors.badRequest("Себестоимость не может быть отрицательной", "BAD_COST");
        }
        byte[] pid = UuidUtil.toBytes(req.productId());
        byte[] vid = req.variantId() == null || req.variantId().isBlank() ? null : UuidUtil.toBytes(req.variantId());
        List<StockLot> key = ledger.lotsOfLine(pid, vid).stream().filter(l -> !l.batch()).toList();
        if (key.isEmpty()) {
            throw ProcurementErrors.notFound("У товара нет старого остатка");
        }
        key.forEach(l -> l.setUnitCostMinor(req.unitCostMinor()));
        ledger.saveLots(key);
    }

    /** «Выровнять»: every product's lots match its stock again (drift from before the ledger, SQL fixes). */
    @Transactional
    public ReconcileDto reconcile() {
        Map<String, Integer> onLots = new HashMap<>();
        for (StockLot l : ledger.allLots()) {
            onLots.merge(Lines.key(l.getProductId(), l.getVariantId()), l.getQtyLeft(),
                    Integer::sum);
        }
        int keys = 0;
        List<String> details = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (Product p : products.findAll()) {
            boolean variants = p.getVariants() != null && !p.getVariants().isEmpty();
            boolean drift = false;
            if (variants) {
                for (ProductVariant v : p.getVariants()) {
                    String key = Lines.key(p.getId(), v.getId());
                    seen.add(key);
                    keys++;
                    if (onLots.getOrDefault(key, 0) != v.getStock()) {
                        drift = true;
                        details.add(p.getTitle() + " (" + v.getName() + "): партии " + onLots.getOrDefault(key, 0)
                                + " → склад " + v.getStock());
                    }
                }
            } else {
                String key = Lines.key(p.getId(), null);
                seen.add(key);
                keys++;
                if (onLots.getOrDefault(key, 0) != p.getStock()) {
                    drift = true;
                    details.add(p.getTitle() + ": партии " + onLots.getOrDefault(key, 0) + " → склад " + p.getStock());
                }
            }
            if (drift) {
                ledger.syncProduct(p);
            }
        }
        return new ReconcileDto(keys, details.size(), details.size() > 50 ? details.subList(0, 50) : details);
    }

    // ---------------------------------------------------------------- helpers

    private PreorderBatch batch(long id) {
        return batches.findById(id).orElseThrow(() -> ProcurementErrors.notFound("Поставка не найдена"));
    }

    static BatchCost.Allocation allocation(String s) {
        try {
            return s == null ? BatchCost.Allocation.BY_VALUE
                    : BatchCost.Allocation.valueOf(s.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw ProcurementErrors.badRequest("Распределение: BY_VALUE, BY_QTY, BY_WEIGHT, MANUAL", "BAD_ALLOCATION");
        }
    }

    private static BigDecimal rate(BigDecimal r) {
        if (r.signum() <= 0 || r.compareTo(BigDecimal.valueOf(100000)) > 0) {
            throw ProcurementErrors.badRequest("Курс: больше нуля", "BAD_RATE");
        }
        return r;
    }

    public static Double pct(long part, long whole) {
        return whole == 0 ? null : Math.round(part * 1000.0 / whole) / 10.0;
    }

    private static ExpenseDto toDto(BatchExpense e, List<ExpenseFileDto> docs) {
        BigDecimal r = BatchCost.rateOf(e.getCurrency(), e.getFxRate());
        long uah = r == null ? 0 : BatchCost.toUah(e.getAmountMinor(), r);
        return new ExpenseDto(e.getId(), e.getBatchItemId(), e.getKind(), e.getAmountMinor(), e.getCurrency(),
                e.getFxRate(), uah, e.getSpentOn(), e.getNote(), e.getCreatedBy(), e.getCreatedAt(), docs);
    }
}
