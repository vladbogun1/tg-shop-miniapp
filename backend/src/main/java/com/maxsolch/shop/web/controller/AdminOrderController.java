package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.MessageService;
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
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import com.maxsolch.shop.web.dto.UpdateOrderStatusRequest;
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

    public AdminOrderController(OrderRepository orderRepository,
                                OrderService orderService,
                                OrderQueryService orderQueryService,
                                MessageService messageService,
                                AdminAuditService audit) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.audit = audit;
    }

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

    @GetMapping("/conversations")
    @Operation(summary = "Orders with unread customer messages (notifications inbox)")
    public List<com.maxsolch.shop.web.dto.ConversationDto> conversations() {
        return messageService.adminConversations();
    }

    @PostMapping("/read-all")
    @Operation(summary = "Mark ALL unread customer messages read")
    public Map<String, Integer> readAll() {
        return Map.of("marked", messageService.markAllReadForAdmin());
    }

    @GetMapping("/board")
    @Operation(summary = "Kanban board grouped by status (q + range filtered, newest first, capped)")
    public OrderBoardDto board(@RequestParam(required = false) String q,
                               @RequestParam(defaultValue = "month") String range) {
        TimeRange timeRange = TimeRange.parse(range);
        Instant from = timeRange.from();
        String like = likeOrNull(q);
        byte[] idKey = idKeyOrNull(q);
        Pageable cap = PageRequest.of(0, BOARD_COLUMN_LIMIT);

        // Fetch every column first, then map them together: the unread and item counts come from
        // two grouped queries for the whole board instead of two per card (5 columns x 300 cards
        // used to mean ~3000 queries on every 10-second refresh).
        Map<String, List<Order>> byStatus = new LinkedHashMap<>();
        List<Order> all = new ArrayList<>();
        for (OrderStatus status : OrderStatus.values()) {
            List<Order> orders = orderRepository.searchByStatus(status, like, idKey, from, cap);
            byStatus.put(status.name(), orders);
            all.addAll(orders);
        }
        OrderQueryService.CardContext ctx =
                orderQueryService.cardContext(all, SenderType.CUSTOMER);

        Map<String, List<OrderCardDto>> columns = new LinkedHashMap<>();
        byStatus.forEach((status, orders) ->
                columns.put(status, orders.stream().map(o -> orderQueryService.toCard(o, ctx)).toList()));

        // True per-column totals in one grouped query (was one COUNT per status).
        Map<String, Long> counts = new LinkedHashMap<>();
        for (OrderStatus status : OrderStatus.values()) {
            counts.put(status.name(), 0L);
        }
        for (Object[] row : orderRepository.countsByStatus(like, idKey, from)) {
            counts.put(((OrderStatus) row[0]).name(), ((Number) row[1]).longValue());
        }
        return new OrderBoardDto(columns, counts);
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
                                   @RequestParam(defaultValue = "desc") String sortDir) {
        OrderStatus statusFilter = parseStatusOrNull(status);
        String like = likeOrNull(q);
        byte[] idKey = idKeyOrNull(q);
        Instant from = TimeRange.parse(range).from();
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 200),
                sortOf(sortBy, sortDir));
        return orderQueryService.toCards(
                orderRepository.search(statusFilter, like, idKey, from, pageable).getContent(),
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

    /** Lowercased {@code %term%} for the LIKE predicates, or null when there is no query. */
    private static String likeOrNull(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        return "%" + q.trim().toLowerCase() + "%";
    }

    /** Binary order-id key when {@code q} parses as a UUID, so search-by-id works; else null. */
    private static byte[] idKeyOrNull(String q) {
        if (q == null || q.isBlank()) {
            return null;
        }
        try {
            return UuidUtil.toBytes(q.trim());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @GetMapping("/dispatch")
    @Operation(summary = "Seller dispatch list — approved orders with COD (наложка) amounts")
    public List<DispatchOrderDto> dispatch() {
        return orderQueryService.dispatchList();
    }

    @PostMapping("/dispatch/broadcast")
    @Operation(summary = "Post the dispatch cards of all approved orders to the seller Telegram topic")
    public Map<String, Integer> dispatchBroadcast() {
        return Map.of("posted", orderService.broadcastDispatch());
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
        Order updated = orderService.changeStatus(load(id).getId(), target,
                req.trackingNumber(), req.rejectReason(), restock);
        audit.record("ORDER_STATUS", "ORDER", id,
                "статус → " + target.name()
                        + (req.trackingNumber() == null ? "" : ", ТТН " + req.trackingNumber())
                        + (req.rejectReason() == null ? "" : ", причина: " + req.rejectReason())
                        + (target == OrderStatus.REJECTED ? (restock ? ", сток возвращён" : ", БЕЗ возврата стока") : ""));
        return orderQueryService.toDetail(updated);
    }

    @PatchMapping("/{id}/paid")
    @Operation(summary = "Set the order's paid flag")
    public OrderDetailDto setPaid(@PathVariable String id,
                                  @RequestBody com.maxsolch.shop.web.dto.SetPaidRequest req) {
        Order updated = orderService.markPaid(load(id).getId(), req.receivedMinor());
        audit.record("ORDER_PAID", "ORDER", id,
                req.receivedMinor() > 0
                        ? "подтверждено получено: " + req.receivedMinor() + " (мин. ед.)"
                        : "оплата снята");
        return orderQueryService.toDetail(updated);
    }

    @PostMapping("/{id}/gift")
    @Operation(summary = "Add a free gift product to the order (stock decremented, price 0)")
    public OrderDetailDto addGift(@PathVariable String id,
                                  @Valid @RequestBody com.maxsolch.shop.web.dto.GiftRequest req) {
        int qty = req.quantity() == null ? 1 : req.quantity();
        boolean notify = req.notifyCustomer() == null || req.notifyCustomer();
        Order updated = orderService.addGift(load(id).getId(), req.productId(), req.variantId(), qty, notify);
        audit.record("ORDER_GIFT", "ORDER", id, "подарок " + req.productId() + " x" + qty);
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

    @PatchMapping("/{id}/items/{itemId}")
    @Operation(summary = "Change an order item's quantity (reserves/releases stock)")
    public OrderDetailDto changeItemQty(@PathVariable String id, @PathVariable long itemId,
                                        @RequestBody com.maxsolch.shop.web.dto.ChangeItemQtyRequest req) {
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
                                   @RequestBody com.maxsolch.shop.web.dto.ApplyDiscountRequest req) {
        boolean notify = req.notifyCustomer() == null || req.notifyCustomer();
        Order updated = orderService.applyDiscount(load(id).getId(), req.promoCode(), req.amountMinor(),
                req.percent(), Boolean.TRUE.equals(req.clear()), notify);
        audit.record("ORDER_DISCOUNT", "ORDER", id,
                Boolean.TRUE.equals(req.clear()) ? "скидка снята"
                        : "скидка: " + (req.promoCode() != null ? "промокод " + req.promoCode()
                                : req.amountMinor() != null ? req.amountMinor() + " (мин. ед.)"
                                : req.percent() + "%"));
        return orderQueryService.toDetail(updated);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete order")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        Order order = load(id);
        // Hard delete cascades to items and chat history — record it before it is gone.
        audit.record("ORDER_DELETE", "ORDER", id,
                "удалён заказ " + order.getCustomerName() + ", " + order.getTotalMinor() + " (мин. ед.), "
                        + "статус " + order.getStatus());
        orderRepository.delete(order);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/messages")
    @Operation(summary = "List chat messages (admin)")
    public List<MessageDto> messages(@PathVariable String id) {
        return messageService.list(load(id).getId());
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
            throw new NotFoundException("order not found");
        }
        return orderRepository.findById(key).orElseThrow(() -> new NotFoundException("order not found"));
    }

    private OrderStatus parseStatus(String s) {
        try {
            return OrderStatus.valueOf(s.trim().toUpperCase());
        } catch (Exception e) {
            throw new BadRequestException("unknown status: " + s);
        }
    }

    private OrderStatus parseStatusOrNull(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return parseStatus(s);
    }
}
