package com.maxsolch.shop.payment.api;

import com.maxsolch.shop.order.app.CustomerOrders;
import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.payment.app.CustomerPaymentRefresh;
import com.maxsolch.shop.payment.app.OnlinePaymentService;
import com.maxsolch.shop.payment.app.PaymentStartResponse;
import com.maxsolch.shop.payment.app.ReceiptDto;
import com.maxsolch.shop.payment.app.ReceiptService;
import com.maxsolch.shop.payment.app.StartPaymentRequest;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.journal.ActivityLog;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.translation.domain.ContentLocale;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;

/** What the customer does about the money of their own order: pay, refresh the status, see the receipts. */
@RestController
@RequestMapping("/api/me")
@Tag(name = "Me", description = "Customer profile, orders and chat")
@SecurityRequirement(name = "bearer-jwt")
@PreAuthorize("hasRole('CUSTOMER')")
public class MeOrderPaymentController {

    private final CustomerOrders customerOrders;
    private final OrderQueryService orderQueryService;
    private final OrderLookup orderLookup;
    private final OnlinePaymentService onlinePayments;
    private final CustomerPaymentRefresh paymentRefresh;
    private final ReceiptService receipts;
    private final ActivityLog activity;
    private final CurrentActor actor;

    public MeOrderPaymentController(CustomerOrders customerOrders, OrderQueryService orderQueryService,
                                    OrderLookup orderLookup, OnlinePaymentService onlinePayments,
                                    CustomerPaymentRefresh paymentRefresh, ReceiptService receipts,
                                    ActivityLog activity, CurrentActor actor) {
        this.customerOrders = customerOrders;
        this.orderQueryService = orderQueryService;
        this.orderLookup = orderLookup;
        this.onlinePayments = onlinePayments;
        this.paymentRefresh = paymentRefresh;
        this.receipts = receipts;
        this.activity = activity;
        this.actor = actor;
    }

    @GetMapping("/orders/{id}/receipts")
    @Operation(summary = "Payment receipts of the order: fiscal checks (sale / return) and the bank "
            + "receipt per paid invoice, with short-lived signed download links. Empty on any failure")
    public List<ReceiptDto> receipts(@PathVariable String id) {
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
                throw new DomainException.BadRequest("returnTo must be SITE or MINIAPP");
            }
        } else {
            returnTo = actor.principal().isWeb()
                    ? OnlinePaymentService.ReturnTo.SITE : OnlinePaymentService.ReturnTo.MINIAPP;
        }
        String lang = req != null && req.locale() != null && !req.locale().isBlank()
                ? ContentLocale.normalize(Locale.forLanguageTag(req.locale())) : ContentLocale.normalize(locale);
        boolean embedded = req != null && "IFRAME".equalsIgnoreCase(req.display());
        OnlinePaymentService.StartedPayment p;
        try {
            p = onlinePayments.start(order.getId(), returnTo, lang, embedded);
        } catch (RuntimeException e) {
            activity.record(ActivityLog.fromRequest("PAYMENT_START_FAILED").order(order.getId())
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
        return orderQueryService.toDetail(orderLookup.get(order.getId()), ContentLocale.normalize(locale));
    }

    private Order ownedOrder(String id) {
        return customerOrders.ownedBy(id, actor.userId());
    }
}
