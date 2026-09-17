package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
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
    private final UploadValidator uploadValidator;

    public MeController(UserRepository userRepository,
                        AdminUserRepository adminUserRepository,
                        OrderRepository orderRepository,
                        OrderQueryService orderQueryService,
                        MessageService messageService,
                        OrderService orderService,
                        ImageStorageService imageStorageService,
                        UploadValidator uploadValidator) {
        this.userRepository = userRepository;
        this.adminUserRepository = adminUserRepository;
        this.orderRepository = orderRepository;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.orderService = orderService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
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
        // Unread and item counts come from two grouped queries, not one pair per order.
        return orderQueryService.toSummaries(orderRepository.findByUserIdOrderByCreatedAtDesc(userId));
    }

    @GetMapping("/orders/{id}")
    @Operation(summary = "Get one of my orders")
    public OrderDetailDto myOrder(@PathVariable String id) {
        return orderQueryService.toDetail(ownedOrder(id));
    }

    @GetMapping("/orders/{id}/messages")
    @Operation(summary = "Chat messages, newest page first (use before= to load older ones)")
    public List<MessageDto> messages(@PathVariable String id,
                                     @RequestParam(required = false) Long before,
                                     @RequestParam(required = false) Integer limit) {
        Order order = ownedOrder(id);
        return messageService.list(order.getId(), before, limit);
    }

    @PostMapping("/orders/{id}/messages")
    @Operation(summary = "Send a chat message (customer)")
    public MessageDto sendMessage(@PathVariable String id, @RequestBody SendMessageRequest req) {
        Order order = ownedOrder(id);
        String name = order.getCustomerName();
        return messageService.postCustomerMessage(order.getId(), order.getUserId(), name, req);
    }

    @PostMapping("/orders/{id}/pay")
    @Operation(summary = "Submit a transfer screenshot → posts it to the order chat and flags the "
            + "order as 'payment claimed' (an admin still has to confirm the money arrived)")
    public OrderDetailDto pay(@PathVariable String id, @RequestBody SendMessageRequest req) {
        Order order = ownedOrder(id);
        if (req == null || req.attachmentUrl() == null || req.attachmentUrl().isBlank()) {
            throw new BadRequestException("payment proof (screenshot) is required");
        }
        // Post the proof into the order chat (admins get notified via MessageService).
        messageService.postCustomerMessage(order.getId(), order.getUserId(), order.getCustomerName(), req);
        // NOTE: this only records a CLAIM. It must not set paid/received — doing so used to zero
        // out the cash-on-delivery amount on the seller's dispatch card, so any customer could get
        // goods shipped without paying by uploading an arbitrary picture. Confirmation is manual:
        // PATCH /api/admin/orders/{id}/paid.
        Order claimed = orderService.claimPayment(order.getId());
        return orderQueryService.toDetail(claimed);
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
        uploadValidator.validateAttachment(file);
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
