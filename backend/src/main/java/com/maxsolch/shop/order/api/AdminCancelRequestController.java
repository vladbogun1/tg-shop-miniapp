package com.maxsolch.shop.order.api;

import com.maxsolch.shop.order.app.AdminCancelRequests;
import com.maxsolch.shop.order.app.CancelRequestService;
import com.maxsolch.shop.order.app.OrderDetailDto;
import com.maxsolch.shop.order.app.OrderQueryService;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Admin side of customers' cancellation requests for paid orders. */
@RestController
@RequestMapping("/api/admin/orders/{id}/cancel-request")
@RequiredAdmin
@Tag(name = "Admin Cancel Requests", description = "Approve (cancel + refund) or decline a customer's cancellation request")
@SecurityRequirement(name = "bearer-jwt")
public class AdminCancelRequestController {

    private final AdminCancelRequests cancelRequests;
    private final OrderQueryService orderQueryService;

    public AdminCancelRequestController(AdminCancelRequests cancelRequests, OrderQueryService orderQueryService) {
        this.cancelRequests = cancelRequests;
        this.orderQueryService = orderQueryService;
    }

    /** Optional (approve) / required (decline) comment shown to the customer. */
    public record ResolveRequest(String comment) {
    }

    /**
     * @param refundRequestedMinor sent to monobank for refund now (booked when the bank confirms)
     * @param refundErrors         invoices monobank refused to refund — return those by hand
     * @param manualRefundMinor    money recorded by hand (not via monobank) — return it by hand
     */
    public record ApproveResponse(OrderDetailDto order, long refundRequestedMinor, int refundedInvoices,
                                  List<String> refundErrors, long manualRefundMinor) {
    }

    @PostMapping("/approve")
    @Operation(summary = "Approve: reject the order (CHANGED_MIND), restock, refund every paid monobank invoice in full")
    public ApproveResponse approve(@PathVariable String id, @RequestBody(required = false) ResolveRequest req) {
        CancelRequestService.ApproveResult r = cancelRequests.approve(id, req == null ? null : req.comment());
        return new ApproveResponse(orderQueryService.toDetail(r.order()), r.refundRequestedMinor(),
                r.refundedInvoices(), r.refundErrors(), r.manualRefundMinor());
    }

    @PostMapping("/decline")
    @Operation(summary = "Decline with a comment (required) shown to the customer")
    public OrderDetailDto decline(@PathVariable String id, @RequestBody(required = false) ResolveRequest req) {
        return orderQueryService.toDetail(cancelRequests.decline(id, req == null ? null : req.comment()));
    }
}
