package com.maxsolch.shop.web.controller;

import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.audit.AdminAuditService;
import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.payment.CancelRequestService;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.security.RequiredAdmin;
import com.maxsolch.shop.service.OrderQueryService;
import com.maxsolch.shop.web.NotFoundException;
import com.maxsolch.shop.web.dto.OrderDetailDto;
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

    private final CancelRequestService cancelRequests;
    private final OrderRepository orderRepository;
    private final OrderQueryService orderQueryService;
    private final AdminAuditService audit;

    public AdminCancelRequestController(CancelRequestService cancelRequests, OrderRepository orderRepository,
                                        OrderQueryService orderQueryService, AdminAuditService audit) {
        this.cancelRequests = cancelRequests;
        this.orderRepository = orderRepository;
        this.orderQueryService = orderQueryService;
        this.audit = audit;
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
        Order order = load(id);
        CancelRequestService.ApproveResult r = cancelRequests.approve(order.getId(), req == null ? null : req.comment());
        audit.record("ORDER_CANCEL_REQUEST_APPROVE", "ORDER", id,
                "запрос отмены одобрен: заказ отменён, сток возвращён, на возврат "
                        + MoneyFormat.uah(r.refundRequestedMinor()) + " (" + r.refundedInvoices() + " счёт.)"
                        + (r.refundErrors().isEmpty() ? "" : ", ошибки возврата: " + String.join("; ", r.refundErrors()))
                        + (r.manualRefundMinor() > 0 ? ", вернуть вручную: " + MoneyFormat.uah(r.manualRefundMinor()) : ""));
        return new ApproveResponse(orderQueryService.toDetail(r.order()), r.refundRequestedMinor(),
                r.refundedInvoices(), r.refundErrors(), r.manualRefundMinor());
    }

    @PostMapping("/decline")
    @Operation(summary = "Decline with a comment (required) shown to the customer")
    public OrderDetailDto decline(@PathVariable String id, @RequestBody(required = false) ResolveRequest req) {
        Order order = load(id);
        String comment = req == null ? null : req.comment();
        Order updated = cancelRequests.decline(order.getId(), comment);
        audit.record("ORDER_CANCEL_REQUEST_DECLINE", "ORDER", id, "запрос отмены отклонён: " + comment);
        return orderQueryService.toDetail(updated);
    }

    private Order load(String id) {
        byte[] key;
        try {
            key = UuidUtil.toBytes(id);
        } catch (IllegalArgumentException e) {
            throw new NotFoundException("заказ не найден");
        }
        return orderRepository.findById(key).orElseThrow(() -> new NotFoundException("заказ не найден"));
    }
}
