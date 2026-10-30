package com.maxsolch.shop.returns.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.returns.domain.ReturnsError;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.platform.util.UuidUtil;

/** The small text and lookup helpers every return scenario repeats. */
final class ReturnText {

    private ReturnText() {
    }

    /** «Title (variant)» of an order line, as shown in the audit log and the customer message. */
    static String title(OrderItem item) {
        return item.getTitleSnapshot()
                + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")");
    }

    static String shortId(byte[] id) {
        return UuidUtil.toString(id).substring(0, 8);
    }

    static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    /** The note without surrounding blanks; null when blank. */
    static String cleanNote(String note) {
        return note == null || note.isBlank() ? null : note.trim();
    }

    /** The order line with this id, 404 when the order has none. */
    static OrderItem item(Order order, long itemId) {
        return order.getItems().stream()
                .filter(i -> i.getId() != null && i.getId() == itemId)
                .findFirst()
                .orElseThrow(() -> new DomainException.NotFound(ReturnsError.ORDER_ITEM_NOT_FOUND));
    }
}
