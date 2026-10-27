package com.maxsolch.shop.preorder;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Product;
import com.maxsolch.shop.domain.ProductVariant;
import com.maxsolch.shop.domain.User;
import com.maxsolch.shop.preorder.PreorderBatch.Distribution;
import com.maxsolch.shop.preorder.PreorderBatch.EtaMode;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveLine;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveLineResult;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveRequest;
import com.maxsolch.shop.preorder.PreorderDtos.ArriveResult;
import com.maxsolch.shop.preorder.PreorderDtos.BatchDto;
import com.maxsolch.shop.preorder.PreorderDtos.BatchRequest;
import com.maxsolch.shop.preorder.PreorderDtos.BatchSummaryDto;
import com.maxsolch.shop.preorder.PreorderDtos.CancelRequest;
import com.maxsolch.shop.preorder.PreorderDtos.DemandDto;
import com.maxsolch.shop.preorder.PreorderDtos.ItemDto;
import com.maxsolch.shop.preorder.PreorderDtos.ItemRequest;
import com.maxsolch.shop.preorder.PreorderDtos.ReleaseRequest;
import com.maxsolch.shop.preorder.PreorderDtos.ReleaseResult;
import com.maxsolch.shop.preorder.PreorderDtos.SubscriberDto;
import com.maxsolch.shop.preorder.PreorderDtos.SupplierDto;
import com.maxsolch.shop.preorder.PreorderDtos.SupplierRequest;
import com.maxsolch.shop.preorder.PreorderSubscription.Status;
import com.maxsolch.shop.repository.ProductRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.settings.SettingsRegistry;
import com.maxsolch.shop.settings.SettingsService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
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
    private final PreorderSubscriptionRepository subs;
    private final SupplierRepository suppliers;
    private final ProductRepository products;
    private final UserRepository users;
    private final PreorderQueueService queue;
    private final SettingsService settings;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    @Autowired
    public PreorderBatchService(PreorderBatchRepository batches, PreorderBatchItemRepository items,
                                PreorderSubscriptionRepository subs, SupplierRepository suppliers,
                                ProductRepository products, UserRepository users, PreorderQueueService queue,
                                SettingsService settings, ApplicationEventPublisher events) {
        this(batches, items, subs, suppliers, products, users, queue, settings, events, Clock.systemUTC());
    }

    PreorderBatchService(PreorderBatchRepository batches, PreorderBatchItemRepository items,
                         PreorderSubscriptionRepository subs, SupplierRepository suppliers,
                         ProductRepository products, UserRepository users, PreorderQueueService queue,
                         SettingsService settings, ApplicationEventPublisher events, Clock clock) {
        this.batches = batches;
        this.items = items;
        this.subs = subs;
        this.suppliers = suppliers;
        this.products = products;
        this.users = users;
        this.queue = queue;
        this.settings = settings;
        this.events = events;
        this.clock = clock;
    }

    /** FIFO stock lots: an arrival becomes a lot priced by the batch (optional in unit tests). */
    private com.maxsolch.shop.costing.LotLedger ledger;

    @Autowired(required = false)
    void setLedger(com.maxsolch.shop.costing.LotLedger ledger) {
        this.ledger = ledger;
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
        Map<String, long[]> demand = demandByLine();
        Map<Long, String> supplierNames = supplierNames();
        List<BatchSummaryDto> out = new ArrayList<>();
        for (PreorderBatch b : rows) {
            List<PreorderBatchItem> lines = linesOf.getOrDefault(b.getId(), List.of());
            long people = 0;
            long units = 0;
            for (PreorderBatchItem i : lines) {
                long[] d = demand.get(PreorderQueueService.lineKey(i.getProductId(), i.getVariantId()));
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
        b.setCreatedBy(adminName);
        apply(b, req, money);
        if (req.items() == null || req.items().isEmpty()) {
            throw new BadRequestException("Добавьте хотя бы одну позицию", "NO_ITEMS");
        }
        PreorderBatch saved = batches.save(b);
        saveItems(saved, req.items(), List.of(), money);
        return toDto(saved, money);
    }

    /** Edits the batch; lines can change only while it is on the way. {@code items} null = keep the lines. */
    @Transactional
    public BatchDto update(long id, BatchRequest req, boolean money) {
        PreorderBatch b = batches.findForUpdate(id).orElseThrow(() -> notFound(id));
        apply(b, req, money);
        if (req.items() != null) {
            if (!b.statusEnum().open()) {
                throw new BadRequestException("Позиции можно менять, пока поставка не приехала", "BATCH_CLOSED");
            }
            if (req.items().isEmpty()) {
                throw new BadRequestException("Добавьте хотя бы одну позицию", "NO_ITEMS");
            }
            saveItems(b, req.items(), items.findByBatchIdOrderByIdAsc(id), money);
        }
        return toDto(batches.save(b), money);
    }

    /** ORDERED / IN_TRANSIT / CUSTOMS — admin-only stages, customers are not messaged. */
    @Transactional
    public BatchDto setStatus(long id, String status, boolean money) {
        PreorderBatch b = batches.findForUpdate(id).orElseThrow(() -> notFound(id));
        if (!b.statusEnum().open()) {
            throw new BadRequestException("Поставка уже закрыта", "BATCH_CLOSED");
        }
        PreorderBatch.Status to = parse(PreorderBatch.Status.class, status, null, "статус");
        if (!to.open()) {
            throw new BadRequestException("Для «Приехала» и «Отменить» — свои кнопки", "BAD_STATUS");
        }
        if (to != PreorderBatch.Status.ORDERED && b.getInTransitAt() == null) {
            b.setInTransitAt(clock.instant());
        }
        b.setStatus(to.name());
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
            throw new BadRequestException("Поставка уже закрыта", "BATCH_CLOSED");
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
                throw new BadRequestException("Пришло не может быть меньше нуля", "BAD_QTY");
            }
            Long price = a == null ? null : a.priceMinor();
            if (price != null && price <= 0) {
                throw new BadRequestException("Цена должна быть больше нуля", "BAD_PRICE");
            }
            Product p = (dry ? products.findById(i.getProductId()) : products.findByIdForUpdate(i.getProductId()))
                    .orElseThrow(() -> new BadRequestException("Товар из поставки удалён", "PRODUCT_GONE"));
            ProductVariant v = PreorderQueueService.variantById(p, i.getVariantId());
            if (i.getVariantId() != null && v == null) {
                throw new BadRequestException("Вариант товара «" + p.getTitle() + "» удалён — уберите позицию",
                        "VARIANT_GONE");
            }
            int stockAfter = PreorderQueueService.stockOf(p, v) + arrived;
            PreorderQueueService.HandOut h;
            if (dry) {
                h = queue.previewHandOut(p.getId(), i.getVariantId(), stockAfter, mode);
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
                if (ledger != null && arrived > 0) {
                    ledger.receive(p.getId(), i.getVariantId(), i.getId(), arrived);
                }
                h = queue.handOut(p, v, b.getId(), mode, hold, true);
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
     * Cancels a batch. {@code closeQueue} — also take the people off the queues of its lines (they are told);
     * otherwise they keep waiting for the product without a date.
     */
    @Transactional
    public BatchDto cancel(long id, CancelRequest req, boolean money) {
        PreorderBatch b = batches.findForUpdate(id).orElseThrow(() -> notFound(id));
        if (!b.statusEnum().open()) {
            throw new BadRequestException("Поставка уже закрыта", "BATCH_CLOSED");
        }
        Instant now = clock.instant();
        b.setStatus(PreorderBatch.Status.CANCELLED.name());
        b.setCancelledAt(now);
        if (req != null && req.note() != null && !req.note().isBlank()) {
            String old = b.getPrivateNote() == null ? "" : b.getPrivateNote() + "\n";
            b.setPrivateNote(old + "Отменена: " + req.note().trim());
        }
        if (req != null && Boolean.TRUE.equals(req.closeQueue())) {
            for (PreorderBatchItem i : items.findByBatchIdOrderByIdAsc(id)) {
                for (PreorderSubscription s : subs.queue(i.getProductId(), i.getVariantId())) {
                    if (s.statusEnum() == Status.WAITING) {
                        s.close(Status.CANCELLED, "поставка отменена", now);
                        subs.save(s);
                        events.publishEvent(new PreorderEvents.Closed(s.getId(), "BATCH_CANCELLED"));
                    }
                }
            }
        }
        return toDto(batches.save(b), money);
    }

    // ---------------------------------------------------------------- queues

    /** Everybody queued for the lines of a batch, live first, in line order. */
    @Transactional(readOnly = true)
    public List<SubscriberDto> subscribersOfBatch(long id) {
        find(id);
        List<PreorderSubscription> rows = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (PreorderBatchItem i : items.findByBatchIdOrderByIdAsc(id)) {
            if (seen.add(PreorderQueueService.lineKey(i.getProductId(), i.getVariantId()))) {
                rows.addAll(subs.queue(i.getProductId(), i.getVariantId()));
            }
        }
        return toSubscribers(rows);
    }

    /** The live queue of a product (all its variants). */
    @Transactional(readOnly = true)
    public List<SubscriberDto> subscribersOfProduct(String productId) {
        return toSubscribers(subs.findLiveByProduct(PreorderQueueService.bytes(productId)));
    }

    /** Takes somebody off a queue; their hold, if any, goes to the next person. */
    @Transactional
    public void removeSubscriber(long subscriptionId, String adminName) {
        PreorderSubscription s = subs.findById(subscriptionId)
                .orElseThrow(() -> new NotFoundException("Запись очереди не найдена"));
        if (!s.statusEnum().live()) {
            return;
        }
        Product p = products.findByIdForUpdate(s.getProductId()).orElse(null);
        boolean wasHeld = s.statusEnum() == Status.HELD;
        s.close(Status.CANCELLED, "убран админом" + (adminName == null ? "" : " (" + adminName + ")"), clock.instant());
        subs.save(s);
        events.publishEvent(new PreorderEvents.Closed(s.getId(), "ADMIN"));
        if (wasHeld && p != null) {
            queue.handOut(p, PreorderQueueService.variantById(p, s.getVariantId()), s.getBatchId(),
                    Distribution.QUEUE_HOLD, queue.holdHours(s.getBatchId()), false);
        }
    }

    /** The stock of a line was raised by hand (not through a batch): hand it to the queue now. */
    @Transactional
    public ReleaseResult release(ReleaseRequest req) {
        byte[] productId = PreorderQueueService.bytes(req == null ? null : req.productId());
        Product p = products.findByIdForUpdate(productId).orElseThrow(() -> new NotFoundException("Товар не найден"));
        ProductVariant v = null;
        if (req.variantId() != null && !req.variantId().isBlank()) {
            v = PreorderQueueService.variantById(p, PreorderQueueService.bytes(req.variantId()));
            if (v == null) {
                throw new BadRequestException("Вариант не найден", "VARIANT_GONE");
            }
        }
        PreorderQueueService.HandOut h = queue.handOut(p, v, null, Distribution.QUEUE_HOLD,
                settings.getInt(SettingsRegistry.PREORDER_HOLD_HOURS), true);
        return new ReleaseResult(h.heldPeople(), h.heldQty(), h.shortPeople(), h.freeAfter());
    }

    /** «Чего ждут»: lines by the number of people waiting, with the batch that already brings them. */
    @Transactional(readOnly = true)
    public List<DemandDto> demand() {
        Instant weekAgo = clock.instant().minus(Duration.ofDays(7));
        List<Object[]> rows = subs.demand(weekAgo);
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, Product> byId = queue.productsOf(rows.stream().map(r -> (byte[]) r[0]).toList());
        Map<String, PreorderBatch> openByLine = new HashMap<>();
        List<PreorderBatch> open = batches.findByStatusInOrderByCreatedAtDesc(List.of(
                PreorderBatch.Status.ORDERED.name(), PreorderBatch.Status.IN_TRANSIT.name(),
                PreorderBatch.Status.CUSTOMS.name()));
        Map<Long, PreorderBatch> openById = open.stream().collect(Collectors.toMap(PreorderBatch::getId, Function.identity()));
        if (!open.isEmpty()) {
            for (PreorderBatchItem i : items.findByBatchIdIn(openById.keySet())) {
                openByLine.putIfAbsent(PreorderQueueService.lineKey(i.getProductId(), i.getVariantId()),
                        openById.get(i.getBatchId()));
            }
        }
        List<DemandDto> out = new ArrayList<>();
        for (Object[] r : rows) {
            byte[] productId = (byte[]) r[0];
            byte[] variantId = (byte[]) r[1];
            Product p = byId.get(UuidUtil.toString(productId));
            if (p == null) {
                continue;
            }
            ProductVariant v = PreorderQueueService.variantById(p, variantId);
            PreorderBatch b = openByLine.get(PreorderQueueService.lineKey(productId, variantId));
            out.add(new DemandDto(UuidUtil.toString(productId), variantId == null ? null : UuidUtil.toString(variantId),
                    p.getTitle(), v == null ? null : v.getName(), PreorderQueueService.imageOf(p),
                    PreorderQueueService.stockOf(p, v), p.getPriceMinor(), num(r[2]), num(r[3]), (Instant) r[4],
                    num(r[5]), b == null ? null : b.getId(), b == null ? null : b.getTitle()));
        }
        return out;
    }

    // ---------------------------------------------------------------- suppliers

    @Transactional(readOnly = true)
    public List<SupplierDto> suppliers() {
        return suppliers.findAllByOrderByNameAsc().stream()
                .map(s -> new SupplierDto(s.getId(), s.getName(), s.getNote())).toList();
    }

    @Transactional
    public SupplierDto createSupplier(SupplierRequest req) {
        String name = req == null || req.name() == null ? "" : req.name().trim();
        if (name.isEmpty() || name.length() > 255) {
            throw new BadRequestException("Название поставщика: от 1 до 255 символов", "BAD_NAME");
        }
        Supplier s = new Supplier();
        s.setName(name);
        s.setNote(trimTo(req.note(), 1000));
        Supplier saved = suppliers.save(s);
        return new SupplierDto(saved.getId(), saved.getName(), saved.getNote());
    }

    // ---------------------------------------------------------------- internals

    private void apply(PreorderBatch b, BatchRequest req, boolean money) {
        if (req == null) {
            throw new BadRequestException("Пустой запрос");
        }
        String title = req.title() == null ? "" : req.title().trim();
        if (title.isEmpty()) {
            title = b.getTitle() != null ? b.getTitle()
                    : "Поставка от " + LocalDate.now(clock.withZone(PreorderQueueService.KYIV)).format(TITLE_DATE);
        }
        b.setTitle(trimTo(title, 255));
        if (req.supplierId() != null && !suppliers.existsById(req.supplierId())) {
            throw new BadRequestException("Поставщик не найден", "BAD_SUPPLIER");
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
                    throw new BadRequestException("Укажите дату", "BAD_ETA");
                }
                to = null;
            }
            case RANGE -> {
                if (from == null || to == null || to.isBefore(from)) {
                    throw new BadRequestException("Укажите диапазон дат: «с» не позже «по»", "BAD_ETA");
                }
            }
            case APPROX -> {
                // stored as the target date; the customer sees «~N тижнів» counted from today
                to = to != null ? to : from;
                from = null;
                if (to == null) {
                    throw new BadRequestException("Укажите, к какой дате примерно ждёте", "BAD_ETA");
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
                    throw new BadRequestException("Валюта: " + String.join(", ", CURRENCIES), "BAD_CURRENCY");
                }
                b.setCurrency(c);
            }
            if (req.fxRate() != null && req.fxRate().signum() <= 0) {
                throw new BadRequestException("Курс должен быть больше нуля", "BAD_RATE");
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
            byte[] productId = PreorderQueueService.bytes(r.productId());
            Product p = products.findById(productId)
                    .orElseThrow(() -> new BadRequestException("Товар не найден: " + r.productId(), "BAD_PRODUCT"));
            boolean hasVariants = p.getVariants() != null && !p.getVariants().isEmpty();
            byte[] variantId = null;
            if (r.variantId() != null && !r.variantId().isBlank()) {
                ProductVariant v = PreorderQueueService.variantById(p, PreorderQueueService.bytes(r.variantId()));
                if (v == null) {
                    throw new BadRequestException("Вариант не найден у «" + p.getTitle() + "»", "BAD_VARIANT");
                }
                variantId = v.getId();
            } else if (hasVariants) {
                throw new BadRequestException("Выберите вариант для «" + p.getTitle() + "»", "VARIANT_REQUIRED");
            }
            if (!lines.add(PreorderQueueService.lineKey(productId, variantId))) {
                throw new BadRequestException("«" + p.getTitle() + "» в поставке дважды — объедините строки",
                        "DUPLICATE_LINE");
            }
            int qty = r.qtyOrdered() == null ? 0 : r.qtyOrdered();
            if (qty < 1 || qty > 100_000) {
                throw new BadRequestException("Сколько заказано у «" + p.getTitle() + "»: от 1", "BAD_QTY");
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
                    throw new BadRequestException("Закупочная цена не может быть отрицательной", "BAD_PRICE");
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
        Map<String, Product> byId = queue.productsOf(lines.stream().map(PreorderBatchItem::getProductId).toList());
        Map<String, long[]> demand = demandByLine();
        List<ItemDto> itemDtos = new ArrayList<>();
        for (PreorderBatchItem i : lines) {
            Product p = byId.get(UuidUtil.toString(i.getProductId()));
            ProductVariant v = p == null ? null : PreorderQueueService.variantById(p, i.getVariantId());
            long[] d = demand.getOrDefault(PreorderQueueService.lineKey(i.getProductId(), i.getVariantId()), new long[2]);
            itemDtos.add(new ItemDto(i.getId(), UuidUtil.toString(i.getProductId()),
                    i.getVariantId() == null ? null : UuidUtil.toString(i.getVariantId()),
                    p == null ? "(товар удалён)" : p.getTitle(), v == null ? null : v.getName(),
                    p == null ? null : PreorderQueueService.imageOf(p),
                    p == null ? 0 : PreorderQueueService.stockOf(p, v), p == null ? 0 : p.getPriceMinor(),
                    i.getQtyOrdered(), i.getQtyArrived(), money ? i.getUnitPriceFx() : null, d[0], d[1]));
        }
        return new BatchDto(b.getId(), b.getTitle(), b.getSupplierId(), supplierNames().get(b.getSupplierId()),
                b.getPrivateNote(), b.getPublicNote(), b.getStatus(), b.getEtaMode(), b.getEtaFrom(), b.getEtaTo(),
                b.statusEnum().open() ? queue.eta(b) : null, b.getHoldHours(), b.getDistribution(),
                b.isPreorderOpen(), b.getCurrency(), money ? b.getFxRate() : null, money, itemDtos,
                b.getCreatedBy(), b.getCreatedAt(), b.getInTransitAt(), b.getArrivedAt(), b.getCancelledAt());
    }

    private List<SubscriberDto> toSubscribers(List<PreorderSubscription> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Map<String, Product> byId = queue.productsOf(rows.stream().map(PreorderSubscription::getProductId).toList());
        Map<Long, User> people = users.findAllById(rows.stream().map(PreorderSubscription::getUserId).distinct().toList())
                .stream().collect(Collectors.toMap(User::getTelegramUserId, Function.identity()));
        // places in line, counted per line from the (already ordered) rows
        Map<String, Integer> waitingSeen = new HashMap<>();
        List<SubscriberDto> out = new ArrayList<>();
        for (PreorderSubscription s : rows) {
            Product p = byId.get(UuidUtil.toString(s.getProductId()));
            ProductVariant v = p == null ? null : PreorderQueueService.variantById(p, s.getVariantId());
            Integer position = null;
            if (s.statusEnum() == Status.WAITING) {
                position = waitingSeen.merge(PreorderQueueService.lineKey(s.getProductId(), s.getVariantId()), 1, Integer::sum);
            }
            User u = people.get(s.getUserId());
            out.add(new SubscriberDto(s.getId(), s.getUserId(), u == null ? null : nameOf(u),
                    u == null ? null : u.getUsername(), u != null && u.isBotBlocked(),
                    UuidUtil.toString(s.getProductId()), s.getVariantId() == null ? null : UuidUtil.toString(s.getVariantId()),
                    p == null ? null : p.getTitle(), v == null ? null : v.getName(), s.getQty(), s.getStatus(), position,
                    s.getHeldQty(), s.getHoldUntil(), s.getSource(), s.getCreatedAt(), s.getClosedAt(), s.getCloseReason()));
        }
        return out;
    }

    /** line key → [people, units] waiting or holding. */
    private Map<String, long[]> demandByLine() {
        Map<String, long[]> out = new HashMap<>();
        for (Object[] r : subs.demand(clock.instant())) {
            out.put(PreorderQueueService.lineKey((byte[]) r[0], (byte[]) r[1]), new long[]{num(r[2]), num(r[3])});
        }
        return out;
    }

    private Map<Long, String> supplierNames() {
        Map<Long, String> out = new HashMap<>();
        suppliers.findAll().forEach(s -> out.put(s.getId(), s.getName()));
        return out;
    }

    private PreorderBatch find(long id) {
        return batches.findById(id).orElseThrow(() -> notFound(id));
    }

    private static NotFoundException notFound(long id) {
        return new NotFoundException("Поставка не найдена: " + id);
    }

    private static int clampHold(int hours) {
        if (hours < 1 || hours > MAX_HOLD_HOURS) {
            throw new BadRequestException("Бронь — от 1 до " + MAX_HOLD_HOURS + " часов", "BAD_HOLD");
        }
        return hours;
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, E fallback, String what) {
        if (value == null || value.isBlank()) {
            if (fallback == null) {
                throw new BadRequestException("Не указан " + what);
            }
            return fallback;
        }
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Неизвестный " + what + ": " + value + " (" + Arrays.toString(type.getEnumConstants()) + ")");
        }
    }

    private static String nameOf(User u) {
        String n = ((u.getFirstName() == null ? "" : u.getFirstName()) + " "
                + (u.getLastName() == null ? "" : u.getLastName())).trim();
        return n.isEmpty() ? null : n;
    }

    private static String trimTo(String s, int max) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        if (t.isEmpty()) {
            return null;
        }
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static long num(Object o) {
        return o == null ? 0 : ((Number) o).longValue();
    }
}
