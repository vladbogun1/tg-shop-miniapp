package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.media.app.UploadResponse;
import com.maxsolch.shop.media.app.UploadValidator;
import com.maxsolch.shop.order.app.CancelRequestService;
import com.maxsolch.shop.order.app.ConversationDto;
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
import com.maxsolch.shop.platform.journal.ActivityLog;
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
    private final CancelRequestService cancelRequests;
    private final Messages messages;
    private final ActivityLog activity;
    private final CurrentActor actor;

    public MeOrdersController(CustomerOrders customerOrders, OrderQueryService orderQueryService,
                              MessageService messageService, ImageStorageService imageStorageService,
                              UploadValidator uploadValidator, CancelRequestService cancelRequests,
                              Messages messages, ActivityLog activity, CurrentActor actor) {
        this.customerOrders = customerOrders;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.cancelRequests = cancelRequests;
        this.messages = messages;
        this.activity = activity;
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
        String name = order.getCustomerName();
        MessageDto sent = messageService.postCustomerMessage(order.getId(), order.getUserId(), name, req);
        // The text itself stays in the chat — the journal only notes that the customer wrote.
        activity.record(activity.fromRequest("CHAT_MESSAGE").order(order.getId())
                .text("Покупатель написал в чат заказа #" + id.substring(0, Math.min(8, id.length())))
                .detail("kind", req == null ? null : req.type()));
        return sent;
    }

    @PostMapping("/orders/{id}/cancel")
    @Operation(summary = "Cancel an unpaid order (NEW/APPROVED) with an optional reason")
    public OrderDetailDto cancel(@PathVariable String id, @RequestBody(required = false) CancelOrderRequest req,
                                 Locale locale) {
        Order order = ownedOrder(id);
        // Refreshes the payment state first; 400 PAYMENT_IN_PROGRESS while the bank is charging,
        // 400 PAID_NEEDS_REQUEST once money arrived (→ cancel-request).
        Order cancelled;
        try {
            cancelled = cancelRequests.cancelUnpaid(order.getId(), req == null ? null : req.reason());
        } catch (RuntimeException e) {
            activity.record(activity.fromRequest("ORDER_CANCEL_FAILED").order(order.getId())
                    .text("Отмена заказа не прошла: " + e.getMessage()).rejected(e));
            throw e;
        }
        activity.record(activity.fromRequest("ORDER_CANCELLED").order(order.getId())
                .text("Покупатель отменил неоплаченный заказ" + reasonSuffix(req)));
        return orderQueryService.toDetail(cancelled, ContentLocale.normalize(locale));
    }

    @PostMapping("/orders/{id}/cancel-request")
    @Operation(summary = "Ask to cancel a PAID order (NEW/APPROVED); reason required, max 500. One request "
            + "per order — an admin approves (cancel + refund) or declines with a comment")
    public OrderDetailDto cancelRequest(@PathVariable String id, @RequestBody(required = false) CancelOrderRequest req,
                                        Locale locale) {
        Order order = ownedOrder(id);
        Order updated;
        try {
            updated = cancelRequests.request(order.getId(), req == null ? null : req.reason());
        } catch (RuntimeException e) {
            activity.record(activity.fromRequest("CANCEL_REQUEST_FAILED").order(order.getId())
                    .text("Заявка на отмену не принята: " + e.getMessage()).rejected(e));
            throw e;
        }
        activity.record(activity.fromRequest("CANCEL_REQUESTED").order(order.getId())
                .text("Заявка на отмену оплаченного заказа" + reasonSuffix(req)));
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
        uploadValidator.validateAttachment(file);
        return UploadResponse.ofKey(imageStorageService.uploadCustomerChatAttachment(file, actor.userId()));
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

    private static String reasonSuffix(CancelOrderRequest req) {
        String r = req == null || req.reason() == null ? "" : req.reason().trim();
        return r.isEmpty() ? "" : ": " + (r.length() > 200 ? r.substring(0, 199) + "…" : r);
    }
}
