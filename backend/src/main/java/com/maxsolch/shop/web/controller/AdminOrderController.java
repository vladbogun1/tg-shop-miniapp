package com.maxsolch.shop.web.controller;

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

    public AdminOrderController(OrderRepository orderRepository,
                                OrderService orderService,
                                OrderQueryService orderQueryService,
                                MessageService messageService) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
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

        Map<String, List<OrderCardDto>> columns = new LinkedHashMap<>();
        Map<String, Long> counts = new LinkedHashMap<>();
        for (OrderStatus status : OrderStatus.values()) {
            List<OrderCardDto> cards = orderRepository.searchByStatus(status, like, idKey, from, cap).stream()
                    .map(o -> orderQueryService.toCard(o, messageService.unreadForAdmin(o.getId())))
                    .toList();
            columns.put(status.name(), cards);
            counts.put(status.name(), orderRepository.countByStatusSearch(status, like, idKey, from));
        }
        return new OrderBoardDto(columns, counts);
    }

    @GetMapping("/by-user/{telegramUserId}")
    @Operation(summary = "All orders of a single user (newest first) — for the Users profile")
    public List<OrderCardDto> byUser(@PathVariable long telegramUserId) {
        return orderRepository.findByTgUserIdOrderByCreatedAtDesc(telegramUserId).stream()
                .map(o -> orderQueryService.toCard(o, messageService.unreadForAdmin(o.getId())))
                .toList();
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
        Pageable pageable = PageRequest.of(Math.max(0, page), Math.max(1, size), sortOf(sortBy, sortDir));
        return orderRepository.search(statusFilter, like, idKey, from, pageable).getContent().stream()
                .map(o -> orderQueryService.toCard(o, messageService.unreadForAdmin(o.getId())))
                .toList();
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
        return orderQueryService.toDetail(updated);
    }

    @PatchMapping("/{id}/paid")
    @Operation(summary = "Set the order's paid flag")
    public OrderDetailDto setPaid(@PathVariable String id,
                                  @RequestBody com.maxsolch.shop.web.dto.SetPaidRequest req) {
        Order updated = orderService.markPaid(load(id).getId(), req.paid());
        return orderQueryService.toDetail(updated);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete order")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        orderRepository.delete(load(id));
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
        return messageService.postAdminMessage(order.getId(), adminId, "Менеджер", req);
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
