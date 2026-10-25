package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.domain.RejectReasonCode;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.OrderSearchTerm;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.security.RequiredSuperAdmin;
import com.maxsolch.shop.service.MessageService;
import com.maxsolch.shop.service.OrderAdjustmentService;
import com.maxsolch.shop.service.OrderQueryService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.service.TimeRange;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.DispatchOrderDto;
import com.maxsolch.shop.web.dto.MessageDto;
import com.maxsolch.shop.web.dto.OrderBoardDto;
import com.maxsolch.shop.web.dto.OrderCardDto;
import com.maxsolch.shop.web.dto.OrderAdjustmentDtos;
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import com.maxsolch.shop.web.dto.UpdateOrderStatusRequest;
import com.maxsolch.shop.web.dto.UploadResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredAdmin
@Tag(name = "Admin Orders", description = "Admin order board, table, detail, status and chat")
@SecurityRequirement(name = "bearer-jwt")
public class AdminOrderController {

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final OrderQueryService orderQueryService;
    private final MessageService messageService;
    private final AdminAuditService audit;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;
    private final OrderAdjustmentService adjustments;
    private final OnlinePaymentService payments;
    /** Orders whose return wizard is running right now (one backend instance): no double submit. */
    private final java.util.Set<String> returnsInFlight = java.util.concurrent.ConcurrentHashMap.newKeySet();

    public AdminOrderController(OrderRepository orderRepository,
                                OrderService orderService,
                                OrderQueryService orderQueryService,
                                MessageService messageService,
                                AdminAuditService audit,
                                ImageStorageService imageStorageService,
                                UploadValidator uploadValidator,
                                OrderAdjustmentService adjustments,
                                OnlinePaymentService payments) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.audit = audit;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.adjustments = adjustments;
        this.payments = payments;
    }

    /** Board column key of the parcels on their way back (not an {@link OrderStatus}). */
    static final String RETURNING_COLUMN = "RETURNING";

    /** Per-status column cap on the board so we never load all 10k orders. */
    private static final int BOARD_COLUMN_LIMIT = 300;

    /** Whitelist of sortable list columns -> Order entity property names. */
    private static final Map<String, String> SORTABLE = Map.of(
            "createdAt", "createdAt",
            "totalMinor", "totalMinor",
            "customerName", "customerName",
            "status", "status");

    @GetMapping("/unread-count")
    @Operation(summary = "Total unread customer messages across all orders (admin bell)")
    public Map<String, Long> unreadCount() {
        return Map.of("count", messageService.totalUnreadForAdmin());
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark ALL unread customer messages read")
    public Map<String, Integer> readAll() {
        return Map.of("marked", messageService.markAllReadForAdmin());
    }

    @GetMapping("/board")
    @Operation(summary = "Kanban board grouped by status (q filtered, newest first, capped). The range "
            + "applies to the closed columns (DELIVERED / REJECTED) only; closedLimit caps those columns.")
    public OrderBoardDto board(@RequestParam(required = false) String q,
                               @RequestParam(defaultValue = "month") String range,
                               @RequestParam(required = false) Integer closedLimit) {
        Instant from = TimeRange.parse(range).from();
        OrderSearchTerm term = OrderSearchTerm.parse(q);
        int closedCap = closedLimit == null
                ? BOARD_COLUMN_LIMIT
                : Math.min(Math.max(1, closedLimit), BOARD_COLUMN_LIMIT);

        // Fetch every column first, then map them together: the unread and item counts come from
        // two grouped queries for the whole board instead of two per card (5 columns x 300 cards
        // used to mean ~3000 queries on every 10-second refresh).
        // Active orders are never hidden by the period: a parcel stuck at Nova Poshta for five
        // weeks used to drop off the board when "Месяц" was selected.
        Map<String, List<Order>> byStatus = new LinkedHashMap<>();
        List<Order> all = new ArrayList<>();
        for (OrderStatus status : OrderStatus.values()) {
            boolean closed = isClosed(status);
            List<Order> orders = orderRepository.searchByStatus(status, term.like(), term.idLo(), term.idHi(),
                    closed ? from : null, PageRequest.of(0, closed ? closedCap : BOARD_COLUMN_LIMIT));
            byStatus.put(status.name(), orders);
            all.addAll(orders);
        }
        // «Едет назад» is not a status: a refused parcel (REJECTED) or the returned part of a
        // delivered order travelling back — a column of its own until «Посылка вернулась».
        List<Order> returning = orderRepository.searchReturning(term.like(), term.idLo(), term.idHi(),
                PageRequest.of(0, BOARD_COLUMN_LIMIT));
        byStatus.put(RETURNING_COLUMN, returning);
        List<Order> withReturning = new ArrayList<>(all);
        withReturning.addAll(returning);
        OrderQueryService.CardContext ctx =
                orderQueryService.cardContext(withReturning, SenderType.CUSTOMER);

        Map<String, List<OrderCardDto>> columns = new LinkedHashMap<>();
        byStatus.forEach((status, orders) ->
                columns.put(status, orders.stream().map(o -> orderQueryService.toCard(o, ctx)).toList()));

        // True per-column totals and money sums in one grouped query per time window.
        Map<String, Long> counts = new LinkedHashMap<>();
        Map<String, Long> sums = new LinkedHashMap<>();
        for (OrderStatus status : OrderStatus.values()) {
            counts.put(status.name(), 0L);
            sums.put(status.name(), 0L);
        }
        List<Object[]> allTime = orderRepository.statsByStatus(term.like(), term.idLo(), term.idHi(), null);
        List<Object[]> ranged = from == null ? allTime : orderRepository.statsByStatus(term.like(), term.idLo(), term.idHi(), from);
        putStats(allTime, false, counts, sums);
        putStats(ranged, true, counts, sums);
        counts.put(RETURNING_COLUMN, orderRepository.countReturning(term.like(), term.idLo(), term.idHi()));
        return new OrderBoardDto(columns, counts, sums);
    }

    /** DELIVERED / REJECTED: the only columns the period and the short cap apply to. */
    private static boolean isClosed(OrderStatus status) {
        return status == OrderStatus.DELIVERED || status == OrderStatus.REJECTED;
    }

    private static void putStats(List<Object[]> rows, boolean closed,
                                 Map<String, Long> counts, Map<String, Long> sums) {
        for (Object[] row : rows) {
            OrderStatus status = (OrderStatus) row[0];
            if (isClosed(status) != closed) {
                continue;
            }
            counts.put(status.name(), ((Number) row[1]).longValue());
            sums.put(status.name(), row[2] == null ? 0L : ((Number) row[2]).longValue());
        }
    }

    @GetMapping("/by-user/{telegramUserId}")
    @Operation(summary = "All orders of a single user (newest first) — for the Users profile")
    public List<OrderCardDto> byUser(@PathVariable long telegramUserId) {
        return orderQueryService.toCards(
                orderRepository.findByTgUserIdOrderByCreatedAtDesc(telegramUserId),
                SenderType.CUSTOMER);
    }

    @GetMapping
    @Operation(summary = "Paged/filterable/sortable order list (status + q + range, sortBy + sortDir)")
    public List<OrderCardDto> list(@RequestParam(required = false) String status,
                                   @RequestParam(required = false) String q,
                                   @RequestParam(defaultValue = "month") String range,
                                   @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "20") int size,
                                   @RequestParam(defaultValue = "createdAt") String sortBy,
                                   @RequestParam(defaultValue = "desc") String sortDir,
                                   @RequestParam(defaultValue = "false") boolean archived) {
        OrderStatus statusFilter = parseStatusOrNull(status);
        OrderSearchTerm term = OrderSearchTerm.parse(q);
        Instant from = TimeRange.parse(range).from();
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 200),
                sortOf(sortBy, sortDir));
        return orderQueryService.toCards(
                orderRepository.search(statusFilter, archived, term.like(), term.idLo(), term.idHi(), from, pageable).getContent(),
                SenderType.CUSTOMER);
    }

    /** Whitelisted sort, falling back to {@code createdAt desc} for unknown fields/directions. */
    private static Sort sortOf(String sortBy, String sortDir) {
        String property = SORTABLE.getOrDefault(sortBy, "createdAt");
        Sort.Direction direction = "asc".equalsIgnoreCase(sortDir)
                ? Sort.Direction.ASC
                : Sort.Direction.DESC;
        return Sort.by(direction, property);
    }

    @GetMapping("/dispatch")
    @Operation(summary = "Seller dispatch list — approved orders (+ NEW ones with includeNew=true) with COD amounts")
    public List<DispatchOrderDto> dispatch(@RequestParam(defaultValue = "false") boolean includeNew) {
        return orderQueryService.dispatchList(includeNew);
    }

    @PostMapping("/dispatch/broadcast")
    @Operation(summary = "Post the dispatch cards of all approved orders to the seller Telegram topic")
    public Map<String, Integer> dispatchBroadcast() {
        int posted = orderService.broadcastDispatch();
        audit.record("DISPATCH_BROADCAST", "ORDER", null, "карточек к отправке выложено заново: " + posted);
        return Map.of("posted", posted);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Order detail")
    public OrderDetailDto detail(@PathVariable String id) {
        return orderQueryService.toDetail(load(id));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Change order status")
    public OrderDetailDto updateStatus(@PathVariable String id,
                                       @Valid @RequestBody UpdateOrderStatusRequest req) {
        OrderStatus target = parseStatus(req.status());
        boolean restock = req.restock() == null || req.restock();
        RejectReasonCode reasonCode = parseReasonCode(req.rejectReasonCode());
        if (target == OrderStatus.SHIPPED && (req.trackingNumber() == null || req.trackingNumber().isBlank())) {
            throw new BadRequestException("укажите номер ТТН");
        }
        if (target == OrderStatus.REJECTED && reasonCode == null
                && (req.rejectReason() == null || req.rejectReason().isBlank())) {
            throw new BadRequestException("укажите причину отклонения");
        }
        if (reasonCode == RejectReasonCode.OTHER && (req.rejectReason() == null || req.rejectReason().isBlank())) {
            throw new BadRequestException("для причины «Другое» напишите пояснение");
        }
        Order before = load(id);
        // Read before the change: shipping does not move the money, but the check belongs to the order as it was.
        boolean unpaidShip = target == OrderStatus.SHIPPED && OrderService.onlinePaymentMissing(before);
        long missingMinor = unpaidShip ? OrderService.amountDueMinor(before) : 0;
        boolean inTransit = target == OrderStatus.REJECTED && Boolean.TRUE.equals(req.returnInTransit());
        Order updated = inTransit
                ? orderService.reject(before.getId(), req.rejectReason(), reasonCode, restock, true)
                : orderService.changeStatus(before.getId(), target,
                        req.trackingNumber(), req.rejectReason(), reasonCode, restock, Boolean.TRUE.equals(req.shipUnpaid()));
        if (target == OrderStatus.REJECTED) {
            // An approved order stays payable past its deadline — close the open monobank pages, so
            // nobody pays for an order we have just cancelled.
            payments.closeOpenInvoices(updated.getId());
        }
        if (unpaidShip) {
            // Shown in the order's «История»: who decided to send it without the money.
            String who = audit.currentAdminName();
            audit.record("ORDER_SHIP_UNPAID", "ORDER", id, "отправлен без онлайн-оплаты (не пришло "
                    + MoneyFormat.uah(missingMinor) + ") по решению админа" + (who == null || who.isBlank() ? "" : " " + who));
        }
        audit.record("ORDER_STATUS", "ORDER", id,
                "статус → " + target.name()
                        + (req.trackingNumber() == null ? "" : ", ТТН " + req.trackingNumber())
                        + (reasonCode == null ? "" : ", код причины " + reasonCode.name())
                        + (req.rejectReason() == null || req.rejectReason().isBlank() ? "" : ", причина: " + req.rejectReason())
                        + (target == OrderStatus.REJECTED
                                ? (OrderService.RETURN_IN_TRANSIT.equals(updated.getReturnStatus())
                                        ? ", посылка едет назад (сток — по приходу)"
                                        : restock ? ", сток возвращён" : ", БЕЗ возврата стока")
                                : ""));
        return orderQueryService.toDetail(updated);
    }

    @PatchMapping("/{id}/tracking")
    @Operation(summary = "Correct the tracking number (ТТН) of a shipped / delivered order; the customer is told")
    public OrderDetailDto updateTracking(@PathVariable String id,
                                         @Valid @RequestBody OrderAdjustmentDtos.UpdateTrackingRequest req) {
        OrderAdjustmentService.Result r = adjustments.updateTracking(load(id).getId(), req.trackingNumber());
        audit.record("ORDER_TRACKING", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
    }

    @PatchMapping("/{id}/delivery")
    @Operation(summary = "Correct recipient name / phone / Nova Poshta city and branch (null fields unchanged)")
    public OrderDetailDto updateDelivery(@PathVariable String id,
                                         @Valid @RequestBody OrderAdjustmentDtos.UpdateDeliveryRequest req) {
        OrderAdjustmentService.Result r = adjustments.updateDelivery(load(id).getId(),
                new OrderAdjustmentService.DeliveryPatch(req.customerName(), req.phone(),
                        req.npCityRef(), req.npCityName(), req.npWarehouseRef(), req.npWarehouseName()));
        audit.record("ORDER_DELIVERY", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
    }

    @PostMapping("/{id}/return")
    @Operation(summary = "Register a (partial) return: returned units per line, restock per line, refunded amount")
    public OrderDetailDto registerReturn(@PathVariable String id,
                                         @Valid @RequestBody OrderAdjustmentDtos.RegisterReturnRequest req) {
        List<OrderAdjustmentService.ReturnLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new OrderAdjustmentService.ReturnLine(l.itemId(), l.quantity(),
                                l.restock() == null || l.restock()))
                        .toList();
        OrderAdjustmentService.Result r = adjustments.registerReturn(load(id).getId(), lines,
                req.refundMinor() == null ? 0 : req.refundMinor(), req.note());
        audit.record("ORDER_RETURN", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
    }

    @PostMapping("/{id}/exchange")
    @Operation(summary = "Exchange goods in a shipped / delivered order: returned units (restock or write off), "
            + "replacement lines at today's price; the order goes back to NEW (or APPROVED) for a new ТТН")
    public OrderDetailDto exchange(@PathVariable String id,
                                   @Valid @RequestBody OrderAdjustmentDtos.ExchangeRequest req) {
        List<OrderAdjustmentService.ReturnLine> returned = req.returned() == null ? List.of()
                : req.returned().stream()
                        .map(l -> new OrderAdjustmentService.ReturnLine(l.itemId(), l.quantity(),
                                l.restock() == null || l.restock()))
                        .toList();
        List<OrderAdjustmentService.ExchangeNewLine> items = req.items() == null ? List.of()
                : req.items().stream()
                        .map(l -> new OrderAdjustmentService.ExchangeNewLine(l.productId(), l.variantId(), l.quantity()))
                        .toList();
        OrderStatus target = OrderStatus.NEW;
        if (req.targetStatus() != null && !req.targetStatus().isBlank()) {
            try {
                target = OrderStatus.valueOf(req.targetStatus().trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("неизвестный статус: " + req.targetStatus());
            }
        }
        OrderAdjustmentService.Result r = adjustments.exchange(load(id).getId(), returned, items, target,
                req.notifyCustomer() == null || req.notifyCustomer(), req.note(), audit.currentAdminName());
        audit.record("ORDER_EXCHANGE", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
    }

    @PostMapping
    @Operation(summary = "Create an order by hand (a sale by phone / in person): source ADMIN, no payment deadline")
    public OrderDetailDto create(@Valid @RequestBody com.maxsolch.shop.web.dto.AdminCreateOrderRequest req) {
        com.maxsolch.shop.domain.OrderMoneyMovement.Channel channel =
                req.paidChannel() == null || req.paidChannel().isBlank()
                        ? com.maxsolch.shop.domain.OrderMoneyMovement.Channel.OTHER
                        : com.maxsolch.shop.service.MoneyLedger.parseChannel(req.paidChannel());
        com.maxsolch.shop.service.CreateOrderCommand cmd = new com.maxsolch.shop.service.CreateOrderCommand(
                null, req.tgUserId(), null,
                req.items().stream()
                        .map(l -> new com.maxsolch.shop.service.CreateOrderCommand.Line(l.productId(), l.variantId(),
                                l.quantity()))
                        .toList(),
                req.customerName(), req.phone(), req.comment(), req.promoCode(), req.deliveryMethod(),
                req.npCityRef(), req.npCityName(), req.npWarehouseRef(), req.npWarehouseName(),
                req.paymentOptionId(), com.maxsolch.shop.domain.OrderSource.ADMIN);
        Order created = orderService.createAdminOrder(cmd, req.paidMinor(), channel, audit.currentAdminName(),
                req.note());
        audit.record("ORDER_CREATE_ADMIN", "ORDER", com.maxsolch.shop.common.UuidUtil.toString(created.getId()),
                "ручной заказ на " + MoneyFormat.uah(created.getTotalMinor())
                        + (req.paidMinor() > 0
                                ? ", получено " + MoneyFormat.uah(req.paidMinor()) + " ("
                                        + OrderAdjustmentService.channelLabel(channel) + ")"
                                : ""));
        return orderQueryService.toDetail(created);
    }

    @PatchMapping("/{id}/paid")
    @Operation(summary = "Set the order's paid flag")
    public OrderDetailDto setPaid(@PathVariable String id,
                                  @Valid @RequestBody com.maxsolch.shop.web.dto.SetPaidRequest req) {
        com.maxsolch.shop.domain.OrderMoneyMovement.Channel channel =
                req.channel() == null || req.channel().isBlank()
                        ? com.maxsolch.shop.domain.OrderMoneyMovement.Channel.OTHER
                        : com.maxsolch.shop.service.MoneyLedger.parseChannel(req.channel());
        Order updated = orderService.markPaid(load(id).getId(), req.receivedMinor(), channel,
                audit.currentAdminName(), req.note());
        audit.record("ORDER_PAID", "ORDER", id,
                (req.receivedMinor() > 0
                        ? "подтверждено получено: " + MoneyFormat.uah(req.receivedMinor())
                        : "оплата снята")
                        + " (" + OrderAdjustmentService.channelLabel(channel) + ")"
                        + (req.note() == null || req.note().isBlank() ? "" : "; " + req.note().trim()));
        return orderQueryService.toDetail(updated);
    }

    @PostMapping("/{id}/items")
    @Operation(summary = "Add a product line to the order (paid, or gift when gift=true)")
    public OrderDetailDto addItem(@PathVariable String id,
                                  @Valid @RequestBody com.maxsolch.shop.web.dto.AddItemRequest req) {
        int qty = req.quantity() == null ? 1 : req.quantity();
        boolean gift = Boolean.TRUE.equals(req.gift());
        boolean notify = req.notifyCustomer() == null || req.notifyCustomer();
        Order updated = orderService.addItem(load(id).getId(), req.productId(), req.variantId(), qty, gift, notify);
        audit.record("ORDER_ITEM_ADD", "ORDER", id,
                (gift ? "подарок " : "позиция ") + req.productId() + " x" + qty);
        return orderQueryService.toDetail(updated);
    }

    @PostMapping("/{id}/gift-case")
    @Operation(summary = "Give the order a gift case: the server draws a prize now among the case prizes "
            + "in stock (added at price 0); the customer opens it once the order is paid")
    public OrderDetailDto grantGiftCase(@PathVariable String id,
                                        @RequestBody(required = false) java.util.Map<String, Object> body) {
        boolean notify = body == null || !Boolean.FALSE.equals(body.get("notifyCustomer"));
        com.maxsolch.shop.gift.GiftCaseTier.Tier tier = com.maxsolch.shop.gift.GiftService
                .parseTier(body == null ? null : String.valueOf(body.get("tier")))
                .orElse(com.maxsolch.shop.gift.GiftCaseTier.Tier.SILVER);
        Order updated = orderService.grantGiftCase(load(id).getId(), tier, notify);
        String prize = updated.getItems().stream()
                .filter(i -> i.isAutoGift() && i.getCaseRarity() != null)
                .map(i -> i.getTitleSnapshot() + " (" + i.getCaseRarity() + ")")
                .findFirst().orElse("скидка");
        audit.record("ORDER_GIFT_CASE", "ORDER", id, "выдан кейс " + tier + ", приз: " + prize);
        return orderQueryService.toDetail(updated);
    }

    @PatchMapping("/{id}/items/{itemId}")
    @Operation(summary = "Change an order item's quantity (reserves/releases stock)")
    public OrderDetailDto changeItemQty(@PathVariable String id, @PathVariable long itemId,
                                        @Valid @RequestBody com.maxsolch.shop.web.dto.ChangeItemQtyRequest req) {
        int qty = req.quantity() == null ? 1 : req.quantity();
        boolean notify = req.notifyCustomer() == null || req.notifyCustomer();
        Order updated = orderService.changeItemQuantity(load(id).getId(), itemId, qty, notify);
        audit.record("ORDER_ITEM_QTY", "ORDER", id, "позиция #" + itemId + " → x" + qty);
        return orderQueryService.toDetail(updated);
    }

    @DeleteMapping("/{id}/items/{itemId}")
    @Operation(summary = "Remove an order item (gift/line) and restore its stock")
    public OrderDetailDto removeItem(@PathVariable String id, @PathVariable long itemId) {
        Order updated = orderService.removeItem(load(id).getId(), itemId);
        audit.record("ORDER_ITEM_REMOVE", "ORDER", id, "удалена позиция #" + itemId);
        return orderQueryService.toDetail(updated);
    }

    @PostMapping("/{id}/discount")
    @Operation(summary = "Apply/update/remove a discount (promo code or manual amount/percent)")
    public OrderDetailDto discount(@PathVariable String id,
                                   @Valid @RequestBody com.maxsolch.shop.web.dto.ApplyDiscountRequest req) {
        boolean notify = req.notifyCustomer() == null || req.notifyCustomer();
        Order updated = orderService.applyDiscount(load(id).getId(), req.promoCode(), req.amountMinor(),
                req.percent(), Boolean.TRUE.equals(req.clear()), notify);
        audit.record("ORDER_DISCOUNT", "ORDER", id,
                Boolean.TRUE.equals(req.clear()) ? "скидка снята"
                        : "скидка: " + (req.promoCode() != null ? "промокод " + req.promoCode()
                                : req.amountMinor() != null ? MoneyFormat.uah(req.amountMinor())
                                : req.percent() + "%"));
        return orderQueryService.toDetail(updated);
    }

    /**
     * Orders are never deleted (25.10.2026): the main admin archives a closed one instead — it
     * leaves the board and the lists with everything kept. {@code DELETE} stays as an alias for an
     * admin panel opened before the update, and needs the same role and a reason.
     */
    @PostMapping("/{id}/archive")
    @RequiredSuperAdmin
    @Operation(summary = "Archive a DELIVERED/REJECTED order (main admin only; reason required)")
    public OrderDetailDto archive(@PathVariable String id,
                                  @Valid @RequestBody OrderAdjustmentDtos.ArchiveRequest req) {
        Order archived = orderService.archive(load(id).getId(), req.reason(), audit.currentAdminName());
        audit.record("ORDER_ARCHIVE", "ORDER", id,
                "в архив: " + archived.getCustomerName() + ", " + MoneyFormat.uah(archived.getTotalMinor())
                        + ", статус " + archived.getStatus() + "; причина: " + archived.getArchiveReason());
        return orderQueryService.toDetail(archived);
    }

    @PostMapping("/{id}/unarchive")
    @RequiredSuperAdmin
    @Operation(summary = "Bring an order back from the archive (main admin only)")
    public OrderDetailDto unarchive(@PathVariable String id) {
        Order back = orderService.unarchive(load(id).getId());
        audit.record("ORDER_UNARCHIVE", "ORDER", id, "возвращён из архива");
        return orderQueryService.toDetail(back);
    }

    @DeleteMapping("/{id}")
    @RequiredSuperAdmin
    @Operation(summary = "Deprecated: archives the order (orders are never deleted); reason required")
    public OrderDetailDto delete(@PathVariable String id, @RequestParam(required = false) String reason) {
        return archive(id, new OrderAdjustmentDtos.ArchiveRequest(reason));
    }

    /**
     * Return wizard (V68). The goods and the manual refunds are saved first; a refund through
     * monobank is requested after that commit (it is an outside call) and booked when the bank
     * confirms — so it is never counted twice.
     */
    @PostMapping("/{id}/returns")
    @Operation(summary = "Return wizard: lines (RESTOCK/DEFECT/KEPT), manual refunds by channel, "
            + "optional monobank refund, retained amount")
    public OrderDetailDto returnWizard(@PathVariable String id,
                                       @Valid @RequestBody OrderAdjustmentDtos.ReturnWizardRequest req) {
        Order order = load(id);
        List<OrderAdjustmentService.WizardLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new OrderAdjustmentService.WizardLine(l.itemId(), l.quantity(), parseOutcome(l.outcome())))
                        .toList();
        List<OrderAdjustmentService.ManualRefund> refunds = req.refunds() == null ? List.of()
                : req.refunds().stream()
                        .filter(r -> r.amountMinor() != 0)
                        .map(r -> new OrderAdjustmentService.ManualRefund(
                                com.maxsolch.shop.service.MoneyLedger.parseChannel(r.channel()), r.amountMinor(), r.note()))
                        .toList();
        long mono = req.monoRefundMinor() == null ? 0 : req.monoRefundMinor();
        OrderAdjustmentService.ReturnPlan plan = new OrderAdjustmentService.ReturnPlan(lines, refunds,
                req.retainMinor() == null ? 0 : req.retainMinor(), mono, req.note(),
                req.notifyCustomer() == null || req.notifyCustomer());
        String key = UuidUtil.toString(order.getId());
        if (!returnsInFlight.add(key)) {
            throw new BadRequestException("возврат по этому заказу уже оформляется — дождитесь окончания");
        }
        try {
            // Check first, then the bank, then the books: a refused plan sends no money, and a refund
            // monobank refuses leaves nothing half-saved to be entered twice on a retry.
            adjustments.checkReturnPlan(order.getId(), plan);
            if (mono > 0) {
                String monoInvoice = payments.refundableInvoice(order.getId(), mono);
                try {
                    payments.refund(order.getId(), monoInvoice, mono);
                } catch (BadRequestException e) {
                    throw new BadRequestException("monobank не принял возврат денег: " + e.getMessage()
                            + ". Ничего не сохранено — исправьте и повторите.", "MONO_REFUND_FAILED");
                }
                audit.record("ORDER_REFUND_ONLINE", "ORDER", id,
                        "возврат на карту через monobank " + MoneyFormat.uah(mono) + " (мастер возврата)");
            }
            OrderAdjustmentService.Result r = adjustments.registerReturnPlan(order.getId(), plan,
                    audit.currentAdminName(), mono > 0);
            audit.record("ORDER_RETURN", "ORDER", id, r.auditDetails());
        } finally {
            returnsInFlight.remove(key);
        }
        return orderQueryService.toDetail(orderService.get(order.getId()));
    }

    @PostMapping("/{id}/return-received")
    @Operation(summary = "The refused parcel is back at the shop: sellable units restocked, DEFECT lines written off")
    public OrderDetailDto returnReceived(@PathVariable String id,
                                         @Valid @RequestBody OrderAdjustmentDtos.ReceiveReturnRequest req) {
        List<OrderAdjustmentService.ReceivedLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new OrderAdjustmentService.ReceivedLine(l.itemId(), l.quantity(), parseOutcome(l.outcome())))
                        .toList();
        OrderAdjustmentService.Result r = adjustments.receiveReturn(load(id).getId(), lines, req.note(),
                audit.currentAdminName());
        audit.record("ORDER_RETURN_RECEIVED", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
    }

    private static OrderAdjustmentService.LineOutcome parseOutcome(String s) {
        if (s == null || s.isBlank()) {
            return OrderAdjustmentService.LineOutcome.RESTOCK;
        }
        try {
            return OrderAdjustmentService.LineOutcome.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неизвестное состояние товара: " + s);
        }
    }

    /**
     * Admin attachment for the order chat: pictures or a PDF, stored under {@code chat/} — the
     * private prefix served only through signed, expiring links. Admin files used to go through
     * the product-image upload, i.e. into {@code products/}, which imgproxy serves publicly.
     */
    @PostMapping("/{id}/attachments")
    @Operation(summary = "Upload a chat attachment (image or PDF) for this order; returns the object key")
    public UploadResponse uploadAttachment(@PathVariable String id, @RequestParam("file") MultipartFile file) {
        load(id);
        uploadValidator.validateAttachment(file);
        return UploadResponse.ofKey(imageStorageService.uploadChatAttachment(file));
    }

    @GetMapping("/{id}/messages")
    @Operation(summary = "Chat messages, newest page first (use before= to load older ones)")
    public List<MessageDto> messages(@PathVariable String id,
                                     @RequestParam(required = false) Long before,
                                     @RequestParam(required = false) Integer limit) {
        return messageService.list(load(id).getId(), before, limit);
    }

    @PostMapping("/{id}/messages")
    @Operation(summary = "Send a chat message (admin) — pings the customer")
    public MessageDto sendMessage(@PathVariable String id, @RequestBody SendMessageRequest req) {
        Order order = load(id);
        long adminId = SecurityUtil.currentUserId();
        // Sign with the actual admin instead of a hardcoded "Менеджер".
        return messageService.postAdminMessage(order.getId(), adminId, audit.currentAdminName(), req);
    }

    @PostMapping("/{id}/messages/read")
    @Operation(summary = "Mark customer messages as read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        messageService.markRead(load(id).getId(), SenderType.CUSTOMER);
        return ResponseEntity.noContent().build();
    }

    private Order load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("заказ не найден");
        }
        return orderRepository.findById(key).orElseThrow(() -> new NotFoundException("заказ не найден"));
    }

    private OrderStatus parseStatus(String s) {
        try {
            return OrderStatus.valueOf(s.trim().toUpperCase());
        } catch (Exception e) {
            throw new BadRequestException("неизвестный статус: " + s);
        }
    }

    private RejectReasonCode parseReasonCode(String s) {
        try {
            return RejectReasonCode.parseOrNull(s);
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("неизвестная причина отказа: " + s);
        }
    }

    private OrderStatus parseStatusOrNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return parseStatus(s);
    }
}
