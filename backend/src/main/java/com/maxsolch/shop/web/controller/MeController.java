package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.repository.AdminUserRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.repository.UserRepository;
import com.maxsolch.shop.service.MessageService;
import com.maxsolch.shop.service.OrderQueryService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.ForbiddenException;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.CancelOrderRequest;
import com.maxsolch.shop.web.dto.MeProfileDto;
import com.maxsolch.shop.web.dto.MessageDto;
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.OrderSummaryDto;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import com.maxsolch.shop.web.dto.UploadResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeController {

    private final UserRepository userRepository;
    private final AdminUserRepository adminUserRepository;
    private final OrderRepository orderRepository;
    private final OrderQueryService orderQueryService;
    private final MessageService messageService;
    private final OrderService orderService;
    private final ImageStorageService imageStorageService;

    public MeController(UserRepository userRepository,
                        AdminUserRepository adminUserRepository,
                        OrderRepository orderRepository,
                        OrderQueryService orderQueryService,
                        MessageService messageService,
                        OrderService orderService,
                        ImageStorageService imageStorageService) {
        this.userRepository = userRepository;
        this.adminUserRepository = adminUserRepository;
        this.orderRepository = orderRepository;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.orderService = orderService;
        this.imageStorageService = imageStorageService;
    }

    @GetMapping
    @Operation(summary = "Current customer profile")
    public MeProfileDto me() {
        long userId = SecurityUtil.currentUserId();
        boolean admin = adminUserRepository.existsByTelegramUserIdAndActiveTrue(userId);
        return userRepository.findById(userId)
                .map(u -> new MeProfileDto(u.getTelegramUserId(), u.getUsername(),
                        u.getFirstName(), u.getLastName(), admin))
                .orElseGet(() -> new MeProfileDto(userId, null, null, null, admin));
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Total unread admin messages across my orders (bell)")
    public java.util.Map<String, Long> unreadCount() {
        return java.util.Map.of("count", messageService.totalUnreadForCustomer(SecurityUtil.currentUserId()));
    }

    @GetMapping("/conversations")
    @Operation(summary = "My orders with unread admin messages (notifications inbox)")
    public List<com.maxsolch.shop.web.dto.ConversationDto> conversations() {
        return messageService.customerConversations(SecurityUtil.currentUserId());
    }

    @GetMapping("/orders")
    @Operation(summary = "List my orders")
    public List<OrderSummaryDto> myOrders() {
        long userId = SecurityUtil.currentUserId();
        return orderRepository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(orderQueryService::toSummary)
                .toList();
    }

    @GetMapping("/orders/{id}")
    @Operation(summary = "Get one of my orders")
    public OrderDetailDto myOrder(@PathVariable String id) {
        return orderQueryService.toDetail(ownedOrder(id));
    }

    @GetMapping("/orders/{id}/messages")
    @Operation(summary = "List chat messages for my order")
    public List<MessageDto> messages(@PathVariable String id) {
        Order order = ownedOrder(id);
        return messageService.list(order.getId());
    }

    @PostMapping("/orders/{id}/messages")
    @Operation(summary = "Send a chat message (customer)")
    public MessageDto sendMessage(@PathVariable String id, @RequestBody SendMessageRequest req) {
        Order order = ownedOrder(id);
        String name = order.getCustomerName();
        return messageService.postCustomerMessage(order.getId(), order.getUserId(), name, req);
    }

    @PostMapping("/orders/{id}/pay")
    @Operation(summary = "Submit a transfer screenshot → posts it to the order chat and marks the order paid")
    public OrderDetailDto pay(@PathVariable String id, @RequestBody SendMessageRequest req) {
        Order order = ownedOrder(id);
        if (req == null || req.attachmentUrl() == null || req.attachmentUrl().isBlank()) {
            throw new BadRequestException("payment proof (screenshot) is required");
        }
        // Post the proof into the order chat (admins get notified via MessageService).
        messageService.postCustomerMessage(order.getId(), order.getUserId(), order.getCustomerName(), req);
        Order paid = orderService.markPaid(order.getId(), true);
        return orderQueryService.toDetail(paid);
    }

    @PostMapping("/orders/{id}/cancel")
    @Operation(summary = "Cancel an unpaid order (NEW/APPROVED) with an optional reason")
    public OrderDetailDto cancel(@PathVariable String id, @RequestBody(required = false) CancelOrderRequest req) {
        Order order = ownedOrder(id);
        Order cancelled = orderService.cancelByCustomer(order.getId(), req == null ? null : req.reason());
        return orderQueryService.toDetail(cancelled);
    }

    @PostMapping("/orders/{id}/messages/read")
    @Operation(summary = "Mark admin messages as read")
    public ResponseEntity<Void> markRead(@PathVariable String id) {
        Order order = ownedOrder(id);
        messageService.markRead(order.getId(), SenderType.ADMIN);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/uploads")
    @Operation(summary = "Upload a chat attachment")
    public UploadResponse upload(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("file is required");
        }
        return UploadResponse.ofKey(imageStorageService.uploadChatAttachment(file));
    }

    private Order ownedOrder(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("order not found");
        }
        Order order = orderRepository.findById(key)
                .orElseThrow(() -> new NotFoundException("order not found"));
        long userId = SecurityUtil.currentUserId();
        if (order.getUserId() == null || order.getUserId() != userId) {
            throw new ForbiddenException("not your order");
        }
        return order;
    }
}
