package com.maxsolch.shop.service;

import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderReturn;
import com.maxsolch.shop.domain.OrderReturnLine;
import com.maxsolch.shop.repository.OrderExchangeRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.dto.OrderDetailDto;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/** Return / exchange records of an order for the admin drawer (moved out of {@link OrderQueryService} as is). */
final class OrderReturnRecordsAssembler {

    private OrderReturnRecordsAssembler() {
    }

    /**
     * The order's return records, with what each did and whether it can be undone.
     *
     * @param thumbnails first photo per product id for the order's lines (asked only when there are records)
     */
    static List<OrderDetailDto.ReturnRecordDto> assemble(Order o, OrderAdjustmentService adjustments,
                                                         OrderExchangeRepository exchangeRepository,
                                                         OrderRepository orderRepository,
                                                         Function<List<OrderItem>, Map<String, String>> thumbnails) {
        if (adjustments == null) {
            return List.of();
        }
        List<OrderReturn> recs = adjustments.returnRecordsOf(o.getId());
        if (recs.isEmpty()) {
            return List.of();
        }
        Map<Long, List<OrderReturnLine>> byRecord = new HashMap<>();
        adjustments.returnLinesOf(recs.stream().map(OrderReturn::getId).toList())
                .forEach(l -> byRecord.computeIfAbsent(l.getReturnId(), k -> new ArrayList<>()).add(l));
        Map<Long, OrderItem> items = new HashMap<>();
        o.getItems().forEach(i -> { if (i.getId() != null) items.put(i.getId(), i); });
        Map<String, String> images = thumbnails.apply(o.getItems());
        OrderReturn newest = recs.stream().filter(r -> r.getCancelledAt() == null)
                .reduce((a, b) -> b).orElse(null);
        List<OrderDetailDto.ReturnRecordDto> out = new ArrayList<>();
        for (OrderReturn r : recs) {
            String newOrderId = null;
            Order replacement = null;
            if (r.getExchangeId() != null) {
                var ex = exchangeRepository.findById(r.getExchangeId()).orElse(null);
                if (ex != null && ex.getNewOrderId() != null) {
                    newOrderId = UuidUtil.toString(ex.getNewOrderId());
                    replacement = orderRepository.findById(ex.getNewOrderId()).orElse(null);
                }
            }
            List<OrderDetailDto.ReturnRecordLineDto> lines = byRecord.getOrDefault(r.getId(), List.of()).stream()
                    .map(l -> {
                        OrderItem it = items.get(l.getItemId());
                        String title = it == null ? "—" : it.getTitleSnapshot()
                                + (it.getVariantNameSnapshot() == null ? "" : " (" + it.getVariantNameSnapshot() + ")");
                        String img = it == null || it.getProductId() == null ? null
                                : images.get(UuidUtil.toString(it.getProductId()));
                        return new OrderDetailDto.ReturnRecordLineDto(l.getItemId(), title, img, l.getQuantity(),
                                l.getOutcome(), l.getRestockedQty(), l.getDefectQty(), l.pendingQty());
                    })
                    .toList();
            boolean isNewest = r == newest;
            String blocker = isNewest ? adjustments.cancelBlocker(r, replacement) : null;
            out.add(new OrderDetailDto.ReturnRecordDto(r.getId(), r.getKind(), r.getCreatedAt(), r.getAdminName(),
                    r.getNote(), lines, r.getRefundMinor(), r.getRefundChannel(), r.getMonoRefundMinor(), newOrderId,
                    r.getCancelledAt(), r.getCancelledBy(), r.getCancelNote(), r.getDebtMinor(), r.getDebtPaidAt(),
                    isNewest && blocker == null, blocker));
        }
        return out;
    }
}
