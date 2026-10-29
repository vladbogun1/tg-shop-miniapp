package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.analytics.AnalyticsZone;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.service.MessageService;
import com.maxsolch.shop.service.AdminOrderQueries;
import com.maxsolch.shop.service.AdminOrderStatusService;
import com.maxsolch.shop.service.OrderAdjustmentService;
import com.maxsolch.shop.service.OrderMergeService;
import com.maxsolch.shop.service.OrderQueryService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.service.OrderWindow;
import com.maxsolch.shop.service.ReturnWizardService;
import com.maxsolch.shop.platform.error.BadRequestException;
import com.maxsolch.shop.platform.web.SecurityUtil;
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
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/orders")
@RequiredAdmin
@Tag(name = "Admin Orders", description = "Admin order board, table, detail, status and chat")
@SecurityRequirement(name = "bearer-jwt")
public class AdminOrderController {

    private final AdminOrderQueries queries;
    private final AdminOrderStatusService statusService;
    private final ReturnWizardService returnWizards;
    private final OrderService orderService;
    private final OrderQueryService orderQueryService;
    private final MessageService messageService;
    private final AdminAuditService audit;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;
    private final OrderAdjustmentService adjustments;
    private final OnlinePaymentService payments;

    /** The shop's timezone: calendar periods («Этот месяц», «Свой») are cut in it. */
    private AppProperties props;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setProps(AppProperties props) {
        this.props = props;
    }

    private OrderWindow window(String range, String from, String to) {
        return OrderWindow.parse(range, from, to, AnalyticsZone.of(props), Instant.now());
    }

    /** Merging orders (V71). */
    private OrderMergeService merges;

    @org.springframework.beans.factory.annotation.Autowired
    void setMerges(OrderMergeService merges) {
        this.merges = merges;
    }

    public AdminOrderController(AdminOrderQueries queries,
                                AdminOrderStatusService statusService,
                                ReturnWizardService returnWizards,
                                OrderService orderService,
                                OrderQueryService orderQueryService,
                                MessageService messageService,
                                AdminAuditService audit,
                                ImageStorageService imageStorageService,
                                UploadValidator uploadValidator,
                                OrderAdjustmentService adjustments,
                                OnlinePaymentService payments) {
        this.queries = queries;
        this.statusService = statusService;
        this.returnWizards = returnWizards;
        this.orderService = orderService;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.audit = audit;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.adjustments = adjustments;
        this.payments = payments;
    }

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
            + "(rolling week|month|halfyear|year|all, calendar thismonth|prevmonth|thisyear|prevyear, or custom "
            + "with from/to yyyy-MM-dd) applies to the closed columns (DELIVERED / REJECTED) only; closedLimit caps those columns.")
    public OrderBoardDto board(@RequestParam(required = false) String q,
                               @RequestParam(defaultValue = "month") String range,
                               @RequestParam(required = false) String from,
                               @RequestParam(required = false) String to,
                               @RequestParam(required = false) Integer closedLimit) {
        return queries.board(q, window(range, from, to), closedLimit);
    }

    @GetMapping("/by-user/{telegramUserId}")
    @Operation(summary = "All orders of a single user (newest first) — for the Users profile")
    public List<OrderCardDto> byUser(@PathVariable long telegramUserId) {
        return queries.byUser(telegramUserId);
    }

    @GetMapping
    @Operation(summary = "Paged/filterable/sortable order list (status + q + range, sortBy + sortDir)")
    public List<OrderCardDto> list(@RequestParam(required = false) String status,
                                   @RequestParam(required = false) String q,
                                   @RequestParam(defaultValue = "month") String range,
                                   @RequestParam(required = false) String from,
                                   @RequestParam(required = false) String to,
                                   @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "20") int size,
                                   @RequestParam(defaultValue = "createdAt") String sortBy,
                                   @RequestParam(defaultValue = "desc") String sortDir,
                                   @RequestParam(defaultValue = "false") boolean archived) {
        return queries.list(parseStatusOrNull(status), q, window(range, from, to), page, size, sortBy, sortDir, archived);
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
        return orderQueryService.toDetail(statusService.change(id, req));
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
    @Operation(summary = "Exchange on a delivered order: the returned units come back like a return (on their way "
            + "or already in stock / written off), the replacement goes out as a NEW linked order with its own ТТН; "
            + "returns the new order")
    public OrderDetailDto exchange(@PathVariable String id,
                                   @Valid @RequestBody OrderAdjustmentDtos.ExchangeRequest req) {
        List<OrderAdjustmentService.WizardLine> returned = req.returned() == null ? List.of()
                : req.returned().stream()
                        .map(l -> new OrderAdjustmentService.WizardLine(l.itemId(), l.quantity(),
                                l.outcome() == null || l.outcome().isBlank() ? null : ReturnWizardService.parseOutcome(l.outcome())))
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

    @GetMapping("/{id}/merge-candidates")
    @Operation(summary = "Other open (not shipped) orders of the same customer, each with what the merged order would be")
    public List<OrderDetailDto.MergeCandidateDto> mergeCandidates(@PathVariable String id) {
        return orderQueryService.mergeCandidates(merges.candidates(load(id).getId()));
    }

    @PostMapping("/{id}/merge")
    @Operation(summary = "Merge another open order of the same customer into this one: its lines, discount and "
            + "received money move here, it is closed as REJECTED (MERGED); returns this order")
    public OrderDetailDto merge(@PathVariable String id, @Valid @RequestBody OrderAdjustmentDtos.MergeRequest req) {
        Order target = load(id);
        Order source = load(req.sourceId());
        if (payments.hasPaymentInFlight(target.getId()) || payments.hasPaymentInFlight(source.getId())) {
            throw new BadRequestException("по одному из заказов банк ещё проводит оплату — подождите пару минут");
        }
        OrderMergeService.Result r = merges.merge(target.getId(), source.getId(),
                Boolean.TRUE.equals(req.useSourceDelivery()), req.notifyCustomer() == null || req.notifyCustomer(),
                req.note(), audit.currentAdminName());
        // The merged order will not be paid any more; the open pages of this one are for the old amount.
        payments.closeOpenInvoices(source.getId());
        payments.closeOpenInvoices(target.getId());
        audit.record("ORDER_MERGE", "ORDER", id, r.auditDetails());
        audit.record("ORDER_MERGED_INTO", "ORDER", UuidUtil.toString(source.getId()),
                "объединён в заказ #" + OrderMergeService.shortId(target.getId()));
        return orderQueryService.toDetail(orderService.get(r.target().getId()));
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
        audit.record("ORDER_CREATE_ADMIN", "ORDER", com.maxsolch.shop.platform.util.UuidUtil.toString(created.getId()),
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

    /** Return wizard (V68): the whole flow, incl. the monobank refund and the one-at-a-time lock, is in {@link ReturnWizardService}. */
    @PostMapping("/{id}/returns")
    @Operation(summary = "Return wizard: lines (RESTOCK/DEFECT/KEPT), manual refunds by channel, "
            + "optional monobank refund, retained amount")
    public OrderDetailDto returnWizard(@PathVariable String id,
                                       @Valid @RequestBody OrderAdjustmentDtos.ReturnWizardRequest req) {
        return orderQueryService.toDetail(returnWizards.register(id, req));
    }

    @PostMapping("/{id}/return-received")
    @Operation(summary = "The refused parcel is back at the shop: sellable units restocked, DEFECT lines written off")
    public OrderDetailDto returnReceived(@PathVariable String id,
                                         @Valid @RequestBody OrderAdjustmentDtos.ReceiveReturnRequest req) {
        List<OrderAdjustmentService.ReceivedLine> lines = req.lines() == null ? List.of()
                : req.lines().stream()
                        .map(l -> new OrderAdjustmentService.ReceivedLine(l.itemId(), l.quantity(), ReturnWizardService.parseOutcome(l.outcome())))
                        .toList();
        OrderAdjustmentService.Result r = adjustments.receiveReturn(load(id).getId(), lines, req.note(),
                audit.currentAdminName());
        audit.record("ORDER_RETURN_RECEIVED", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
    }

    @PostMapping("/{id}/returns/{returnId}/cancel")
    @Operation(summary = "Cancel the newest return / exchange: units back into the order, money back or as a debt")
    public OrderDetailDto cancelReturn(@PathVariable String id, @PathVariable long returnId,
                                       @Valid @RequestBody OrderAdjustmentDtos.CancelReturnRequest req) {
        OrderAdjustmentService.CancelMoney money = null;
        if (req.money() != null && !req.money().isBlank()) {
            try {
                money = OrderAdjustmentService.CancelMoney.valueOf(req.money().trim().toUpperCase());
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("неизвестный вариант денег: " + req.money());
            }
        }
        OrderAdjustmentService.Result r = adjustments.cancelReturn(load(id).getId(), returnId, money, req.note(),
                audit.currentAdminName());
        audit.record("ORDER_RETURN_CANCEL", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(orderService.get(r.order().getId()));
    }

    @PostMapping("/{id}/returns/{returnId}/debt-paid")
    @Operation(summary = "The customer sent back the money of a cancelled return")
    public OrderDetailDto returnDebtPaid(@PathVariable String id, @PathVariable long returnId) {
        OrderAdjustmentService.Result r = adjustments.settleReturnDebt(load(id).getId(), returnId, audit.currentAdminName());
        audit.record("ORDER_RETURN_DEBT_PAID", "ORDER", id, r.auditDetails());
        return orderQueryService.toDetail(r.order());
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
        return queries.load(id);
    }

    private OrderStatus parseStatusOrNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return AdminOrderStatusService.parseStatus(s);
    }
}
