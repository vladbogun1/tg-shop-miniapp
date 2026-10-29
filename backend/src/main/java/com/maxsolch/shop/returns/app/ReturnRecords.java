package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.order.app.OrderLookup;
import com.maxsolch.shop.order.app.OrderReturnsView;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.returns.domain.OrderReturn;
import com.maxsolch.shop.returns.domain.OrderReturnLine;
import com.maxsolch.shop.returns.infra.OrderExchangeRepository;
import com.maxsolch.shop.returns.infra.OrderReturnLineRepository;
import com.maxsolch.shop.returns.infra.OrderReturnRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * Return and exchange records of an order for the admin drawer: the order module asks for them through
 * {@link OrderReturnsView}, so it never imports this module.
 */
@Service
public class ReturnRecords implements OrderReturnsView {

    private final OrderReturnRepository returnRecords;
    private final OrderReturnLineRepository returnLines;
    private final OrderExchangeRepository exchangeRepository;
    private final OrderLookup orders;

    public ReturnRecords(OrderReturnRepository returnRecords, OrderReturnLineRepository returnLines,
                         OrderExchangeRepository exchangeRepository, OrderLookup orders) {
        this.returnRecords = returnRecords;
        this.returnLines = returnLines;
        this.exchangeRepository = exchangeRepository;
        this.orders = orders;
    }

    @Override
    public List<ExchangeDto> exchangesOf(byte[] orderId) {
        return exchangeRepository.findByOrderIdOrderByCreatedAtAsc(orderId).stream()
                .map(e -> new ExchangeDto(e.getCreatedAt(), e.getPreviousStatus(),
                        e.getPreviousTracking(), e.getReturnedSummary(), e.getGivenSummary(),
                        e.getTotalBeforeMinor(), e.getTotalAfterMinor(), e.getNote(), e.getAdminName(),
                        e.getNewOrderId() == null ? null : UuidUtil.toString(e.getNewOrderId())))
                .toList();
    }

    @Override
    public List<ReturnRecordDto> records(Order o, Function<List<OrderItem>, Map<String, String>> thumbnails) {
        List<OrderReturn> recs = returnRecords.findByOrderIdOrderByIdAsc(o.getId());
        if (recs.isEmpty()) {
            return List.of();
        }
        Map<Long, List<OrderReturnLine>> byRecord = new HashMap<>();
        returnLines.findByReturnIdInOrderByIdAsc(recs.stream().map(OrderReturn::getId).toList())
                .forEach(l -> byRecord.computeIfAbsent(l.getReturnId(), k -> new ArrayList<>()).add(l));
        Map<Long, OrderItem> items = new HashMap<>();
        o.getItems().forEach(i -> { if (i.getId() != null) items.put(i.getId(), i); });
        Map<String, String> images = thumbnails.apply(o.getItems());
        OrderReturn newest = recs.stream().filter(r -> r.getCancelledAt() == null)
                .reduce((a, b) -> b).orElse(null);
        List<ReturnRecordDto> out = new ArrayList<>();
        for (OrderReturn r : recs) {
            String newOrderId = null;
            Order replacement = null;
            if (r.getExchangeId() != null) {
                var ex = exchangeRepository.findById(r.getExchangeId()).orElse(null);
                if (ex != null && ex.getNewOrderId() != null) {
                    newOrderId = UuidUtil.toString(ex.getNewOrderId());
                    replacement = orders.find(ex.getNewOrderId()).orElse(null);
                }
            }
            List<ReturnRecordLineDto> lines = byRecord.getOrDefault(r.getId(), List.of()).stream()
                    .map(l -> line(l, items, images))
                    .toList();
            boolean isNewest = r == newest;
            String blocker = isNewest ? r.cancelBlocker(replacement) : null;
            out.add(new ReturnRecordDto(r.getId(), r.getKind(), r.getCreatedAt(), r.getAdminName(),
                    r.getNote(), lines, r.getRefundMinor(), r.getRefundChannel(), r.getMonoRefundMinor(), newOrderId,
                    r.getCancelledAt(), r.getCancelledBy(), r.getCancelNote(), r.getDebtMinor(), r.getDebtPaidAt(),
                    isNewest && blocker == null, blocker));
        }
        return out;
    }

    private static ReturnRecordLineDto line(OrderReturnLine l, Map<Long, OrderItem> items, Map<String, String> images) {
        OrderItem it = items.get(l.getItemId());
        String title = it == null ? "—" : ReturnText.title(it);
        String img = it == null || it.getProductId() == null ? null : images.get(UuidUtil.toString(it.getProductId()));
        return new ReturnRecordLineDto(l.getItemId(), title, img, l.getQuantity(), l.getOutcome(),
                l.getRestockedQty(), l.getDefectQty(), l.pendingQty());
    }
}
