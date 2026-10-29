package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.analytics.ClientEventBatch;
import com.maxsolch.shop.analytics.ClientEventService;
import com.maxsolch.shop.i18n.Messages;
import com.maxsolch.shop.journal.ActivityLog;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.SenderType;
import com.maxsolch.shop.media.ImageStorageService;
import com.maxsolch.shop.media.UploadValidator;
import com.maxsolch.shop.payment.CustomerPaymentRefresh;
import com.maxsolch.shop.payment.OnlinePaymentService;
import com.maxsolch.shop.service.CustomerOrders;
import com.maxsolch.shop.service.CustomerProfileService;
import com.maxsolch.shop.service.MessageService;
import com.maxsolch.shop.service.OrderQueryService;
import com.maxsolch.shop.service.OrderService;
import com.maxsolch.shop.service.PromoService;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.SecurityUtil;
import com.maxsolch.shop.web.dto.CancelOrderRequest;
import com.maxsolch.shop.web.dto.MeProfileDto;
import com.maxsolch.shop.web.dto.MessageDto;
import com.maxsolch.shop.translation.ContentLocale;
import com.maxsolch.shop.web.dto.OrderDetailDto;
import com.maxsolch.shop.web.dto.OrderSummaryDto;
import com.maxsolch.shop.web.dto.PaymentStartResponse;
import com.maxsolch.shop.web.dto.StartPaymentRequest;
import com.maxsolch.shop.web.dto.PromoPreviewDto;
import com.maxsolch.shop.web.dto.SendMessageRequest;
import com.maxsolch.shop.web.dto.UploadResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Locale;

@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeController {

    private final CustomerProfileService profiles;
    private final CustomerOrders customerOrders;
    private final OrderQueryService orderQueryService;
    private final MessageService messageService;
    private final OrderService orderService;
    private final ImageStorageService imageStorageService;
    private final UploadValidator uploadValidator;
    private final PromoService promoService;
    private final ClientEventService clientEventService;
    private final Messages messages;
    private final OnlinePaymentService onlinePayments;
    private final CustomerPaymentRefresh paymentRefresh;
    @org.springframework.beans.factory.annotation.Autowired
    private com.maxsolch.shop.payment.CancelRequestService cancelRequests;
    @org.springframework.beans.factory.annotation.Autowired
    private com.maxsolch.shop.payment.ReceiptService receipts;
    /** «Журнал → Бот и сайт»: what the customer did here (optional — tests build the controller bare). */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.maxsolch.shop.journal.ActivityLog activity;

    /** Opening the gift case (V57); a setter so the unit tests' constructor stays as it is. */
    private com.maxsolch.shop.gift.GiftCaseService giftCaseService;

    @org.springframework.beans.factory.annotation.Autowired
    void setGiftCaseService(com.maxsolch.shop.gift.GiftCaseService giftCaseService) {
        this.giftCaseService = giftCaseService;
    }

    public MeController(CustomerProfileService profiles,
                        CustomerOrders customerOrders,
                        OrderQueryService orderQueryService,
                        MessageService messageService,
                        OrderService orderService,
                        ImageStorageService imageStorageService,
                        UploadValidator uploadValidator,
                        PromoService promoService,
                        ClientEventService clientEventService,
                        Messages messages,
                        OnlinePaymentService onlinePayments,
                        CustomerPaymentRefresh paymentRefresh) {
        this.profiles = profiles;
        this.customerOrders = customerOrders;
        this.orderQueryService = orderQueryService;
        this.messageService = messageService;
        this.orderService = orderService;
        this.imageStorageService = imageStorageService;
        this.uploadValidator = uploadValidator;
        this.promoService = promoService;
        this.clientEventService = clientEventService;
        this.messages = messages;
        this.onlinePayments = onlinePayments;
        this.paymentRefresh = paymentRefresh;
    }

    /**
     * Takes the Mini App's buffered interaction journal.
     *
     * <p>There was no way to see what a customer actually did before they gave up — only the
     * orders and messages that came out of it. The client keeps events locally and flushes them on
     * a timer and on close, so the database sees occasional batches instead of a write per tap.
     * Never fails loudly: a rejected batch would be noise in the app for data nobody is waiting on.
     */
    @PostMapping("/analytics")
    @Operation(summary = "Submit a batch of buffered client events")
    public ResponseEntity<Void> analytics(@RequestBody ClientEventBatch batch) {
        clientEventService.record(SecurityUtil.currentUserId(), batch);
        return ResponseEntity.noContent().build();
    }

    /**
     * Checks the code for this cart and, when it is a limited one, holds it for this customer for
     * half an hour. The cart calls this as the code is typed, so the discount shown there is the
     * discount the order will actually get — and cannot be taken by somebody else's checkout in
     * the meantime.
     */
    @PostMapping("/promo/reserve")
    @Operation(summary = "Validate a promo code and hold it for this customer")
    public PromoPreviewDto reservePromo(@RequestParam String code,
                                        @RequestParam long subtotalMinor,
                                        @RequestParam(required = false) String items) {
        // items: the cart's lines "id*qty,…" — a case code is counted without the low-margin products.
        PromoPreviewDto preview = promoService.reserve(code, subtotalMinor, SecurityUtil.currentUserId(),
                com.maxsolch.shop.gift.CaseLowMargin.parseItems(items));
        // Only accepted codes: the cart checks as the code is typed, so refusals are mostly half-typed words.
        if (preview != null && preview.valid()) {
            journal(ActivityLog.fromRequest("PROMO_APPLIED")
                    .text("Промокод " + code.trim().toUpperCase(Locale.ROOT) + " принят: скидка "
                            + com.maxsolch.shop.common.MoneyFormat.amount(preview.discountMinor()) + " грн")
                    .detail("code", code.trim().toUpperCase(Locale.ROOT))
                    .detail("discountMinor", preview.discountMinor())
                    .detail("subtotalMinor", subtotalMinor));
        }
        return preview;
    }

    /**
     * Remembers the language the customer chose in the app, so the bot writes to them in it.
     *
     * <p>Separate from the `language_code` Telegram reports, which is overwritten on every sign-in:
     * a deliberate choice must not be undone by a device setting. An unsupported value is ignored
     * rather than rejected — the app would have nothing useful to do with the error.
     */
    @PostMapping("/locale")
    @Operation(summary = "Remember the customer's interface language")
    public ResponseEntity<Void> setLocale(@RequestParam String locale) {
        java.util.Locale parsed = Messages.normalize(locale);
        if (parsed != null) {
            profiles.changeLocale(SecurityUtil.currentUserId(), parsed.getLanguage()).ifPresent(change ->
                    journal(ActivityLog.fromRequest("LOCALE_CHANGED")
                            .text("Язык: " + (change.before() == null ? "—" : change.before()) + " → " + change.after())
                            .detail("from", change.before()).detail("to", change.after())));
        }
        return ResponseEntity.noContent().build();
    }

    /** Gives a held code back when the customer clears or replaces it. */
    @DeleteMapping("/promo/reserve")
    @Operation(summary = "Release a held promo code")
    public ResponseEntity<Void> releasePromo(@RequestParam String code) {
        promoService.release(code, SecurityUtil.currentUserId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    @Operation(summary = "Current customer profile")
    public MeProfileDto me() {
        return profiles.profile(SecurityUtil.currentUserId());
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
        // Unread and item counts come from two grouped queries, not one pair per order.
        return orderQueryService.toSummaries(customerOrders.activeOf(SecurityUtil.currentUserId()));
    }

    @GetMapping("/orders/{id}")
    @Operation(summary = "Get one of my orders")
    public OrderDetailDto myOrder(@PathVariable String id, Locale locale) {
        return orderQueryService.toDetail(ownedOrder(id), ContentLocale.normalize(locale));
    }

    @PostMapping("/orders/{id}/gift-case/open")
    @Operation(summary = "Open the gift case of my order (once, paid orders only): the prize drawn at checkout, "
            + "the tier's prizes for the reel, the code of a discount prize and the swap offer")
    public com.maxsolch.shop.gift.GiftDtos.CaseOpenDto openGiftCase(@PathVariable String id, Locale locale) {
        Order order = ownedOrder(id);
        com.maxsolch.shop.gift.GiftDtos.CaseOpenDto opened =
                giftCaseService.open(order.getId(), ContentLocale.normalize(locale));
        journal(ActivityLog.fromRequest("GIFT_CASE_OPENED").order(order.getId())
                .text("Покупатель открыл кейс (" + opened.tier() + "): " + prizeText(opened.won())
                        + " (" + opened.won().rarity() + ")"));
        return opened;
    }

    @PostMapping("/orders/{id}/gift-case/swap")
    @Operation(summary = "Swap the case prize (similar to what I bought) for a personal code on the next order; "
            + "the prize leaves the order. 400 GIFT_CASE_SWAP_UNAVAILABLE when it is not offered")
    public com.maxsolch.shop.gift.GiftDtos.CaseOpenDto swapGiftCase(@PathVariable String id, Locale locale) {
        Order order = ownedOrder(id);
        com.maxsolch.shop.gift.GiftDtos.CaseOpenDto swapped =
                giftCaseService.swap(order.getId(), ContentLocale.normalize(locale));
        journal(ActivityLog.fromRequest("GIFT_CASE_SWAPPED").order(order.getId())
                .text("Покупатель заменил приз кейса «" + swapped.won().title() + "» на промокод −"
                        + swapped.swap().amountMinor() / 100 + " ₴"));
        return swapped;
    }

    public record CaseSizeRequest(String variantId) {
    }

    @PostMapping("/orders/{id}/gift-case/size")
    @Operation(summary = "Pick the size of my case prize (a product with sizes) among those in stock while the order "
            + "is being put together; 400 GIFT_CASE_SIZE_UNAVAILABLE when that size is gone or it is too late")
    public com.maxsolch.shop.gift.GiftDtos.SizeDto chooseGiftCaseSize(@PathVariable String id,
                                                                      @RequestBody CaseSizeRequest req) {
        Order order = ownedOrder(id);
        com.maxsolch.shop.gift.GiftDtos.SizeDto size = giftCaseService.chooseSize(order.getId(), req.variantId());
        journal(ActivityLog.fromRequest("GIFT_CASE_SIZE").order(order.getId())
                .text("Покупатель выбрал размер приза кейса: " + size.name()));
        return size;
    }

    private static String prizeText(com.maxsolch.shop.gift.GiftDtos.CaseItemDto won) {
        if ("DISCOUNT".equals(won.kind())) {
            return won.discountPercent() > 0 ? "скидка " + won.discountPercent() + " %"
                    : "скидка " + won.discountAmountMinor() / 100 + " ₴";
        }
        return won.title();
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
        journal(ActivityLog.fromRequest("CHAT_MESSAGE").order(order.getId())
                .text("Покупатель написал в чат заказа #" + id.substring(0, Math.min(8, id.length())))
                .detail("kind", req == null ? null : req.type()));
        return sent;
    }

    @GetMapping("/orders/{id}/receipts")
    @Operation(summary = "Payment receipts of the order: fiscal checks (sale / return) and the bank "
            + "receipt per paid invoice, with short-lived signed download links. Empty on any failure")
    public List<com.maxsolch.shop.web.dto.ReceiptDto> receipts(@PathVariable String id) {
        return receipts.forOrder(ownedOrder(id).getId());
    }

    @PostMapping("/orders/{id}/payment")
    @Operation(summary = "Get a monobank payment page for what is due now (whole order or the "
            + "prepayment). Reuses a live page; 409 with a code when the order cannot be paid")
    public PaymentStartResponse startPayment(@PathVariable String id,
                                             @RequestBody(required = false) StartPaymentRequest req,
                                             Locale locale) {
        Order order = ownedOrder(id);
        OnlinePaymentService.ReturnTo returnTo;
        if (req != null && req.returnTo() != null && !req.returnTo().isBlank()) {
            try {
                returnTo = OnlinePaymentService.ReturnTo.valueOf(req.returnTo().trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException e) {
                throw new BadRequestException("returnTo must be SITE or MINIAPP");
            }
        } else {
            returnTo = SecurityUtil.currentPrincipal().isWeb()
                    ? OnlinePaymentService.ReturnTo.SITE : OnlinePaymentService.ReturnTo.MINIAPP;
        }
        String lang = req != null && req.locale() != null && !req.locale().isBlank()
                ? ContentLocale.normalize(Locale.forLanguageTag(req.locale())) : ContentLocale.normalize(locale);
        boolean embedded = req != null && "IFRAME".equalsIgnoreCase(req.display());
        OnlinePaymentService.StartedPayment p;
        try {
            p = onlinePayments.start(order.getId(), returnTo, lang, embedded);
        } catch (RuntimeException e) {
            journal(ActivityLog.fromRequest("PAYMENT_START_FAILED").order(order.getId())
                    .text("Не удалось открыть оплату: " + e.getMessage())
                    .detail("returnTo", returnTo).rejected(e));
            throw e;
        }
        return new PaymentStartResponse(p.invoiceId(), p.pageUrl(), p.amountMinor(), p.expiresAt());
    }

    @PostMapping("/orders/{id}/payment/refresh")
    @Operation(summary = "Ask monobank for the latest payment status now (after returning from the "
            + "payment page) and return the order")
    public OrderDetailDto refreshPayment(@PathVariable String id, Locale locale) {
        Order order = ownedOrder(id);
        paymentRefresh.refreshIfDue(id, order.getId());
        return orderQueryService.toDetail(orderService.get(order.getId()), ContentLocale.normalize(locale));
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
            journal(ActivityLog.fromRequest("ORDER_CANCEL_FAILED").order(order.getId())
                    .text("Отмена заказа не прошла: " + e.getMessage()).rejected(e));
            throw e;
        }
        journal(ActivityLog.fromRequest("ORDER_CANCELLED").order(order.getId())
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
            journal(ActivityLog.fromRequest("CANCEL_REQUEST_FAILED").order(order.getId())
                    .text("Заявка на отмену не принята: " + e.getMessage()).rejected(e));
            throw e;
        }
        journal(ActivityLog.fromRequest("CANCEL_REQUESTED").order(order.getId())
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
        return UploadResponse.ofKey(
                imageStorageService.uploadCustomerChatAttachment(file, SecurityUtil.currentUserId()));
    }

    /** A customer may attach only a file they uploaded themselves (their chat/u{id}/ prefix). */
    private void requireOwnAttachment(SendMessageRequest req) {
        if (req == null || req.attachmentUrl() == null || req.attachmentUrl().isBlank()) {
            return;
        }
        if (!ImageStorageService.isCustomerAttachmentKey(req.attachmentUrl(), SecurityUtil.currentUserId())) {
            throw new BadRequestException(messages.current("api.chat.badAttachment"));
        }
    }

    private Order ownedOrder(String id) {
        return customerOrders.ownedBy(id, SecurityUtil.currentUserId());
    }

    private void journal(ActivityLog.Entry entry) {
        if (activity != null) {
            activity.record(entry);
        }
    }

    private static String reasonSuffix(CancelOrderRequest req) {
        String r = req == null || req.reason() == null ? "" : req.reason().trim();
        return r.isEmpty() ? "" : ": " + (r.length() > 200 ? r.substring(0, 199) + "…" : r);
    }
}
