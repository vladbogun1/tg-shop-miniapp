package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.UpdateOrderStatusRequest;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.order.app.DispatchOrderDto;
import com.maxsolch.shop.order.app.MessageDto;
import com.maxsolch.shop.order.app.OrderBoardDto;
import com.maxsolch.shop.order.app.OrderCardDto;
import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.media.app.UploadValidator;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.RequiredSuperAdmin;
import com.maxsolch.shop.order.app.MessageService;
import com.maxsolch.shop.order.app.AdminOrderQueries;
import com.maxsolch.shop.order.app.AdminOrderStatusService;
import com.maxsolch.shop.order.app.OrderDeliveryEditing;
import com.maxsolch.shop.order.app.AdminOrders;
import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.app.OrderDeliveryEditing;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.order.domain.OrderWindow;
import com.maxsolch.shop.media.app.UploadResponse;
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
    private final AdminOrders orders;
    private final OrderQueryService orderQueryService;
    private final MessageService messageService;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;

    public AdminOrderController(AdminOrderQueries queries,
                                AdminOrderStatusService statusService,
                                AdminOrders orders,
                                OrderQueryService orderQueryService,
                                MessageService messageService,
                                ImageStorageService imageStorageService,
                                UploadValidator uploadValidator) {
        this.queries = queries;
        this.statusService = statusService;
        this.orders = orders;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
    }

    private OrderWindow window(String range, String from, String to) {
        return queries.window(range, from, to);
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
        return Map.of("posted", orders.broadcastDispatch());
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
        return orderQueryService.toDetail(orders.updateTracking(id, req.trackingNumber()));
    }

    @PatchMapping("/{id}/delivery")
    @Operation(summary = "Correct recipient name / phone / Nova Poshta city and branch (null fields unchanged)")
    public OrderDetailDto updateDelivery(@PathVariable String id,
                                         @Valid @RequestBody OrderAdjustmentDtos.UpdateDeliveryRequest req) {
        return orderQueryService.toDetail(orders.updateDelivery(id,
                new OrderDeliveryEditing.DeliveryPatch(req.customerName(), req.phone(),
                        req.npCityRef(), req.npCityName(), req.npWarehouseRef(), req.npWarehouseName())));
    }

    @GetMapping("/{id}/merge-candidates")
    @Operation(summary = "Other open (not shipped) orders of the same customer, each with what the merged order would be")
    public List<OrderDetailDto.MergeCandidateDto> mergeCandidates(@PathVariable String id) {
        return orderQueryService.mergeCandidates(orders.mergeCandidates(id));
    }

    @PostMapping("/{id}/merge")
    @Operation(summary = "Merge another open order of the same customer into this one: its lines, discount and "
            + "received money move here, it is closed as REJECTED (MERGED); returns this order")
    public OrderDetailDto merge(@PathVariable String id, @Valid @RequestBody OrderAdjustmentDtos.MergeRequest req) {
        return orderQueryService.toDetail(orders.merge(id, req.sourceId(),
                Boolean.TRUE.equals(req.useSourceDelivery()), req.notifyCustomer() == null || req.notifyCustomer(),
                req.note()));
    }

    @PostMapping
    @Operation(summary = "Create an order by hand (a sale by phone / in person): source ADMIN, no payment deadline")
    public OrderDetailDto create(@Valid @RequestBody com.maxsolch.shop.order.api.AdminCreateOrderRequest req) {
        CreateOrderCommand cmd = new CreateOrderCommand(
                null, req.tgUserId(), null,
                req.items().stream()
                        .map(l -> new CreateOrderCommand.Line(l.productId(), l.variantId(), l.quantity()))
                        .toList(),
                req.customerName(), req.phone(), req.comment(), req.promoCode(), req.deliveryMethod(),
                req.npCityRef(), req.npCityName(), req.npWarehouseRef(), req.npWarehouseName(),
                req.paymentOptionId(), OrderSource.ADMIN);
        return orderQueryService.toDetail(orders.createByHand(cmd, req.paidMinor(), req.paidChannel(), req.note()));
    }

    @PatchMapping("/{id}/paid")
    @Operation(summary = "Set the order's paid flag")
    public OrderDetailDto setPaid(@PathVariable String id,
                                  @Valid @RequestBody com.maxsolch.shop.order.api.SetPaidRequest req) {
        return orderQueryService.toDetail(orders.setPaid(id, req.receivedMinor(), req.channel(), req.note()));
    }

    @PostMapping("/{id}/items")
    @Operation(summary = "Add a product line to the order (paid, or gift when gift=true)")
    public OrderDetailDto addItem(@PathVariable String id,
                                  @Valid @RequestBody com.maxsolch.shop.order.api.AddItemRequest req) {
        int qty = req.quantity() == null ? 1 : req.quantity();
        return orderQueryService.toDetail(orders.addItem(id, req.productId(), req.variantId(), qty,
                Boolean.TRUE.equals(req.gift()), req.notifyCustomer() == null || req.notifyCustomer()));
    }

    @PostMapping("/{id}/gift-case")
    @Operation(summary = "Give the order a gift case: the server draws a prize now among the case prizes "
            + "in stock (added at price 0); the customer opens it once the order is paid")
    public OrderDetailDto grantGiftCase(@PathVariable String id,
                                        @RequestBody(required = false) java.util.Map<String, Object> body) {
        boolean notify = body == null || !Boolean.FALSE.equals(body.get("notifyCustomer"));
        return orderQueryService.toDetail(orders.grantGiftCase(id,
                body == null ? null : String.valueOf(body.get("tier")), notify));
    }

    @PatchMapping("/{id}/items/{itemId}")
    @Operation(summary = "Change an order item's quantity (reserves/releases stock)")
    public OrderDetailDto changeItemQty(@PathVariable String id, @PathVariable long itemId,
                                        @Valid @RequestBody com.maxsolch.shop.order.api.ChangeItemQtyRequest req) {
        int qty = req.quantity() == null ? 1 : req.quantity();
        return orderQueryService.toDetail(orders.changeItemQuantity(id, itemId, qty,
                req.notifyCustomer() == null || req.notifyCustomer()));
    }

    @DeleteMapping("/{id}/items/{itemId}")
    @Operation(summary = "Remove an order item (gift/line) and restore its stock")
    public OrderDetailDto removeItem(@PathVariable String id, @PathVariable long itemId) {
        return orderQueryService.toDetail(orders.removeItem(id, itemId));
    }

    @PostMapping("/{id}/discount")
    @Operation(summary = "Apply/update/remove a discount (promo code or manual amount/percent)")
    public OrderDetailDto discount(@PathVariable String id,
                                   @Valid @RequestBody com.maxsolch.shop.order.api.ApplyDiscountRequest req) {
        return orderQueryService.toDetail(orders.applyDiscount(id, req.promoCode(), req.amountMinor(),
                req.percent(), Boolean.TRUE.equals(req.clear()), req.notifyCustomer() == null || req.notifyCustomer()));
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
        return orderQueryService.toDetail(orders.archive(id, req.reason()));
    }

    @PostMapping("/{id}/unarchive")
    @RequiredSuperAdmin
    @Operation(summary = "Bring an order back from the archive (main admin only)")
    public OrderDetailDto unarchive(@PathVariable String id) {
        return orderQueryService.toDetail(orders.unarchive(id));
    }

    @DeleteMapping("/{id}")
    @RequiredSuperAdmin
    @Operation(summary = "Deprecated: archives the order (orders are never deleted); reason required")
    public OrderDetailDto delete(@PathVariable String id, @RequestParam(required = false) String reason) {
        return archive(id, new OrderAdjustmentDtos.ArchiveRequest(reason));
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
        return orders.sendMessage(id, req);
    }

    @PostMapping("/{id}/messages/read")
    @Operation(summary = "Mark customer messages as read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        orders.markCustomerMessagesRead(id);
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
