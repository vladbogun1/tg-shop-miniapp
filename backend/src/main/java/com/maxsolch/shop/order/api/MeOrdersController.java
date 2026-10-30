package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.media.app.UploadResponse;
import com.maxsolch.shop.media.app.UploadValidator;
import com.maxsolch.shop.order.app.ConversationDto;
import com.maxsolch.shop.order.app.CustomerOrderActions;
import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.order.app.MessageDto;
import com.maxsolch.shop.order.app.MessageService;
import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.app.OrderSummaryDto;
import com.maxsolch.shop.order.app.SendMessageRequest;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.SenderType;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.translation.domain.ContentLocale;
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
import com.maxsolch.shop.platform.web.UploadedFile;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/** The customer's own orders: list, one order, chat, attachments, cancelling. The URLs stay under {@code /api/me}. */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeOrdersController {

    private final CustomerOrders customerOrders;
    private final OrderQueryService orderQueryService;
    private final MessageService messageService;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;
    private final CustomerOrderActions orderActions;
    private final Messages messages;
    private final CurrentActor actor;

    public MeOrdersController(CustomerOrders customerOrders, OrderQueryService orderQueryService,
                              MessageService messageService, ImageStorageService imageStorageService,
                              UploadValidator uploadValidator, CustomerOrderActions orderActions,
                              Messages messages, CurrentActor actor) {
        this.customerOrders = customerOrders;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.orderActions = orderActions;
        this.messages = messages;
        this.actor = actor;
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Total unread admin messages across my orders (bell)")
    public Map<String, Long> unreadCount() {
        return Map.of("count", messageService.totalUnreadForCustomer(actor.userId()));
    }

    @GetMapping("/conversations")
    @Operation(summary = "My orders with unread admin messages (notifications inbox)")
    public List<ConversationDto> conversations() {
        return messageService.customerConversations(actor.userId());
    }

    @GetMapping("/orders")
    @Operation(summary = "List my orders")
    public List<OrderSummaryDto> myOrders() {
        // Unread and item counts come from two grouped queries, not one pair per order.
        return orderQueryService.toSummaries(customerOrders.activeOf(actor.userId()));
    }

    @GetMapping("/orders/{id}")
    @Operation(summary = "Get one of my orders")
    public OrderDetailDto myOrder(@PathVariable String id, Locale locale) {
        return orderQueryService.toDetail(ownedOrder(id), ContentLocale.normalize(locale));
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
        requireOwnAttachment(req);
        return orderActions.sendMessage(order, id, req);
    }

    @PostMapping("/orders/{id}/cancel")
    @Operation(summary = "Cancel an unpaid order (NEW/APPROVED) with an optional reason")
    public OrderDetailDto cancel(@PathVariable String id, @RequestBody(required = false) CancelOrderRequest req,
                                 Locale locale) {
        Order order = ownedOrder(id);
        Order cancelled = orderActions.cancelUnpaid(order, req == null ? null : req.reason());
        return orderQueryService.toDetail(cancelled, ContentLocale.normalize(locale));
    }

    @PostMapping("/orders/{id}/cancel-request")
    @Operation(summary = "Ask to cancel a PAID order (NEW/APPROVED); reason required, max 500. One request "
            + "per order — an admin approves (cancel + refund) or declines with a comment")
    public OrderDetailDto cancelRequest(@PathVariable String id, @RequestBody(required = false) CancelOrderRequest req,
                                        Locale locale) {
        Order order = ownedOrder(id);
        Order updated = orderActions.requestCancel(order, req == null ? null : req.reason());
        return orderQueryService.toDetail(updated, ContentLocale.normalize(locale));
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
        uploadValidator.validateAttachment(UploadedFile.of(file));
        return UploadResponse.ofKey(imageStorageService.uploadCustomerChatAttachment(UploadedFile.of(file), actor.userId()));
    }

    /** A customer may attach only a file they uploaded themselves (their chat/u{id}/ prefix). */
    private void requireOwnAttachment(SendMessageRequest req) {
        if (req == null || req.attachmentUrl() == null || req.attachmentUrl().isBlank()) {
            return;
        }
        if (!ImageStorageService.isCustomerAttachmentKey(req.attachmentUrl(), actor.userId())) {
            throw new DomainException.BadRequest(OrderError.BAD_ATTACHMENT);
        }
    }

    private Order ownedOrder(String id) {
        return customerOrders.ownedBy(id, actor.userId());
    }
}
