package com.maxsolch.shop.service;

import com.maxsolch.shop.common.MoneyFormat;
import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderExchange;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
import com.maxsolch.shop.repository.OrderExchangeRepository;
import com.maxsolch.shop.repository.OrderRepository;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.NotFoundException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Admin corrections to an order: fixing the tracking number after shipping, fixing the recipient /
 * delivery address, registering a (partial) return — none of these change the status — and an
 * exchange, which sends the order round again.
 *
 * <p>Each method returns a short Russian description of what changed, for the admin audit log.
 */
@Service
public class OrderAdjustmentService {

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final ApplicationEventPublisher events;
    private final OrderExchangeRepository exchangeRepository;

    public OrderAdjustmentService(OrderRepository orderRepository,
                                  OrderService orderService,
                                  ApplicationEventPublisher events,
                                  OrderExchangeRepository exchangeRepository) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.events = events;
        this.exchangeRepository = exchangeRepository;
    }

    /** Result of an adjustment: the saved order and the audit line. */
    public record Result(Order order, String auditDetails) {
    }

    // ----- tracking number -----

    /**
     * Replaces the ТТН of a shipped order. Before this existed a typo stayed forever and the
     * customer tracked somebody else's parcel. The customer is told the new number.
     */
    @Transactional
    public Result updateTracking(byte[] orderId, String trackingNumber) {
        Order order = load(orderId);
        if (order.getStatus() != OrderStatus.SHIPPED && order.getStatus() != OrderStatus.DELIVERED) {
            throw new BadRequestException("ТТН можно изменить только у отправленного или доставленного заказа");
        }
        String ttn = trackingNumber == null ? "" : trackingNumber.replaceAll("\\s+", "");
        if (ttn.isEmpty()) {
            throw new BadRequestException("укажите номер ТТН");
        }
        if (ttn.length() > 128) {
            throw new BadRequestException("номер ТТН слишком длинный");
        }
        String old = order.getTrackingNumber();
        if (ttn.equals(old)) {
            return new Result(order, "ТТН не изменилась");
        }
        order.setTrackingNumber(ttn);
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.TRACKING, true));
        return new Result(saved, "ТТН: " + (old == null ? "—" : old) + " → " + ttn);
    }

    // ----- recipient & delivery -----

    /** Fields to change; null = leave as is. City and warehouse go together (refs + names). */
    public record DeliveryPatch(String customerName,
                                String phone,
                                String npCityRef,
                                String npCityName,
                                String npWarehouseRef,
                                String npWarehouseName) {
    }

    /**
     * Fixes the recipient's name / phone or the Nova Poshta branch while the parcel can still be
     * re-addressed. Before this the only way out of a customer's typo was to reject and re-create.
     */
    @Transactional
    public Result updateDelivery(byte[] orderId, DeliveryPatch patch) {
        Order order = load(orderId);
        OrderStatus s = order.getStatus();
        if (s != OrderStatus.NEW && s != OrderStatus.APPROVED && s != OrderStatus.SHIPPED) {
            throw new BadRequestException("данные доставки можно менять, пока заказ не доставлен и не отклонён");
        }
        List<String> changes = new ArrayList<>();

        if (patch.customerName() != null) {
            String name = patch.customerName().trim();
            if (name.isEmpty()) {
                throw new BadRequestException("ФИО не может быть пустым");
            }
            if (name.length() > 255) {
                throw new BadRequestException("ФИО слишком длинное");
            }
            if (!name.equals(order.getCustomerName())) {
                changes.add("ФИО: " + order.getCustomerName() + " → " + name);
                order.setCustomerName(name);
            }
        }
        if (patch.phone() != null) {
            String phone = patch.phone().trim();
            if (phone.replaceAll("\\D", "").length() < 10 || phone.length() > 64) {
                throw new BadRequestException("проверьте номер телефона");
            }
            if (!phone.equals(order.getPhone())) {
                changes.add("телефон: " + order.getPhone() + " → " + phone);
                order.setPhone(phone);
            }
        }
        boolean addressGiven = patch.npCityRef() != null || patch.npWarehouseRef() != null
                || patch.npCityName() != null || patch.npWarehouseName() != null;
        if (addressGiven) {
            if (order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA) {
                throw new BadRequestException("у заказа самовывоз — отделение не указывается");
            }
            if (isBlank(patch.npCityRef()) || isBlank(patch.npCityName())
                    || isBlank(patch.npWarehouseRef()) || isBlank(patch.npWarehouseName())) {
                throw new BadRequestException("выберите город и отделение Новой Почты");
            }
            if (!Objects.equals(patch.npWarehouseRef().trim(), order.getNpWarehouseRef())
                    || !Objects.equals(patch.npCityRef().trim(), order.getNpCityRef())) {
                changes.add("доставка: " + nz(order.getNpCityName()) + ", " + nz(order.getNpWarehouseName())
                        + " → " + patch.npCityName().trim() + ", " + patch.npWarehouseName().trim());
                order.setNpCityRef(patch.npCityRef().trim());
                order.setNpCityName(patch.npCityName().trim());
                order.setNpWarehouseRef(patch.npWarehouseRef().trim());
                order.setNpWarehouseName(patch.npWarehouseName().trim());
            }
        }
        if (changes.isEmpty()) {
            return new Result(order, "без изменений");
        }
        Order saved = orderRepository.save(order);
        // Refreshes the seller's dispatch card ("К ОТПРАВКЕ") and the channel card.
        events.publishEvent(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.DETAILS, false));
        return new Result(saved, String.join("; ", changes));
    }

    // ----- returns -----

    /**
     * One returned line.
     *
     * @param itemId   order item id
     * @param quantity units the customer sent back now
     * @param restock  put those units back on the shelf (false when not sellable)
     */
    public record ReturnLine(long itemId, int quantity, boolean restock) {
    }

    /**
     * Registers a (partial) return: which units came back, which of them go back to stock, and how
     * much money is refunded. The status is not touched — a fully refused parcel is still an
     * "Отклонить" with reason REFUSED_AT_POST; this is for what happens around and after that.
     *
     * <p>Allowed for SHIPPED / DELIVERED (goods came back) and for REJECTED, where only a refund
     * can be recorded: a rejected order's stock was settled at rejection time. NEW / APPROVED only
     * for money, and only while the customer has paid more than the total (an exchange for
     * something cheaper sends the order back to NEW with the difference still to give back).
     */
    @Transactional
    public Result registerReturn(byte[] orderId, List<ReturnLine> lines, long refundMinor, String note) {
        Order order = load(orderId);
        OrderStatus s = order.getStatus();
        boolean overpaidInWork = (s == OrderStatus.NEW || s == OrderStatus.APPROVED)
                && order.getReceivedMinor() - Math.max(0, order.getRefundedMinor()) > order.getTotalMinor();
        if (s != OrderStatus.SHIPPED && s != OrderStatus.DELIVERED && s != OrderStatus.REJECTED && !overpaidInWork) {
            throw new BadRequestException("возврат оформляется для отправленного, доставленного или отклонённого заказа");
        }
        List<ReturnLine> safeLines = lines == null ? List.of() : lines;
        if ((s == OrderStatus.REJECTED || overpaidInWork) && safeLines.stream().anyMatch(l -> l.quantity() > 0)) {
            throw new BadRequestException(s == OrderStatus.REJECTED
                    ? "по отклонённому заказу можно оформить только возврат денег"
                    : "заказ ещё не отправлен — можно вернуть только переплату");
        }
        if (overpaidInWork && refundMinor > order.getReceivedMinor() - Math.max(0, order.getRefundedMinor())
                - order.getTotalMinor()) {
            throw new BadRequestException("до отправки можно вернуть только переплату: " + MoneyFormat.uah(
                    order.getReceivedMinor() - Math.max(0, order.getRefundedMinor()) - order.getTotalMinor()));
        }
        if (refundMinor < 0) {
            throw new BadRequestException("сумма возврата не может быть отрицательной");
        }
        long refundable = refundableMinor(order);
        if (refundMinor > refundable) {
            throw new BadRequestException("вернуть можно не больше, чем получено: " + MoneyFormat.uah(refundable));
        }

        List<String> parts = new ArrayList<>();
        int units = 0;
        for (ReturnLine line : safeLines) {
            if (line.quantity() <= 0) {
                continue;
            }
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == line.itemId())
                    .findFirst()
                    .orElseThrow(() -> new NotFoundException("order item not found"));
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.quantity() > left) {
                throw new BadRequestException("по позиции «" + item.getTitleSnapshot()
                        + "» можно вернуть не больше " + left + " шт.");
            }
            item.setReturnedQty(item.getReturnedQty() + line.quantity());
            if (line.restock()) {
                // Never more than is still out of stock for this line.
                int canRestock = item.getQuantity() - item.getRestockedQty();
                orderService.restockItem(item, Math.min(line.quantity(), canRestock));
            }
            units += line.quantity();
            parts.add(item.getTitleSnapshot() + " ×" + line.quantity() + (line.restock() ? " (на склад)" : " (не на склад)"));
        }
        if (units == 0 && refundMinor == 0) {
            throw new BadRequestException("укажите, что вернули, или сумму возврата");
        }
        if (refundMinor > 0) {
            order.setRefundedMinor(order.getRefundedMinor() + refundMinor);
            parts.add("возврат денег " + MoneyFormat.uah(refundMinor));
        }
        order.setReturnedAt(Instant.now());
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        String details = "возврат: " + String.join(", ", parts)
                + (note == null || note.isBlank() ? "" : "; " + note.trim());
        return new Result(saved, details);
    }

    // ----- exchange -----

    /** One line going out instead of the returned goods. */
    public record ExchangeNewLine(String productId, String variantId, int quantity) {
    }

    /** Where the order goes after an exchange: back to «Новый» (default) or straight to «Одобрен». */
    public static boolean isExchangeTarget(OrderStatus s) {
        return s == OrderStatus.NEW || s == OrderStatus.APPROVED;
    }

    /**
     * Exchange on an order the customer already received (or that is on its way): some units come
     * back — each line either returns to stock or is written off — and other goods go out in the
     * same order, so a customer who paid is never asked to place and pay a new one.
     *
     * <p>The returned units leave the order, the new ones are added at today's price with their
     * stock reserved, the totals are recomputed (the stored discount amount stays). Money is not
     * touched: a dearer replacement leaves the difference as cash on delivery (or online payment
     * for a fully prepaid option), a cheaper one leaves an overpayment for the admin to refund.
     * The order goes back to NEW (or APPROVED) with the tracking number cleared, so it is shipped
     * again with a new ТТН; the old one stays in {@link OrderExchange}.
     */
    @Transactional
    public Result exchange(byte[] orderId, List<ReturnLine> returned, List<ExchangeNewLine> given,
                           OrderStatus target, boolean notifyCustomer, String note, String adminName) {
        Order order = load(orderId);
        OrderStatus before = order.getStatus();
        if (before != OrderStatus.SHIPPED && before != OrderStatus.DELIVERED) {
            throw new BadRequestException("обмен оформляется для отправленного или доставленного заказа");
        }
        OrderStatus to = target == null ? OrderStatus.NEW : target;
        if (!isExchangeTarget(to)) {
            throw new BadRequestException("после обмена заказ уходит в «Новый» или «Одобрен»");
        }
        List<ReturnLine> back = returned == null ? List.of()
                : returned.stream().filter(l -> l.quantity() > 0).toList();
        List<ExchangeNewLine> out = given == null ? List.of()
                : given.stream().filter(l -> l.quantity() > 0).toList();
        if (back.isEmpty()) {
            throw new BadRequestException("отметьте, что покупатель вернул");
        }
        if (out.isEmpty()) {
            throw new BadRequestException("выберите товар на замену");
        }
        String cleanNote = note == null || note.isBlank() ? null : note.trim();
        if (cleanNote != null && cleanNote.length() > 500) {
            throw new BadRequestException("комментарий длиннее 500 символов");
        }

        long totalBefore = order.getTotalMinor();
        String trackingBefore = order.getTrackingNumber();

        // 1. What came back: stock (or written off), then the units leave the order.
        List<String> backParts = new ArrayList<>();
        for (ReturnLine line : back) {
            OrderItem item = order.getItems().stream()
                    .filter(i -> i.getId() != null && i.getId() == line.itemId())
                    .findFirst()
                    .orElseThrow(() -> new NotFoundException("order item not found"));
            int left = item.getQuantity() - item.getReturnedQty();
            if (line.quantity() > left) {
                throw new BadRequestException("по позиции «" + item.getTitleSnapshot()
                        + "» можно обменять не больше " + left + " шт.");
            }
            if (line.restock()) {
                orderService.releaseUnits(item, line.quantity());
            }
            backParts.add(item.getTitleSnapshot()
                    + (item.getVariantNameSnapshot() == null ? "" : " (" + item.getVariantNameSnapshot() + ")")
                    + " ×" + line.quantity() + (line.restock() ? " (на склад)" : " (списано)"));
            int remaining = item.getQuantity() - line.quantity();
            if (remaining <= 0) {
                order.getItems().remove(item);
            } else {
                item.setQuantity(remaining);
                item.setRestockedQty(Math.min(item.getRestockedQty(), remaining));
            }
        }

        // 2. What goes out instead, at today's price.
        List<String> outParts = new ArrayList<>();
        for (ExchangeNewLine line : out) {
            outParts.add(orderService.addExchangeLine(order, line.productId(), line.variantId(), line.quantity()));
        }
        orderService.recomputeOrderTotals(order);

        // 3. Back into the pipeline: shipped again with a new ТТН.
        order.setStatus(to);
        order.setTrackingNumber(null);
        order.setShippedAt(null);
        order.setDeliveredAt(null);
        order.setApprovedAt(to == OrderStatus.APPROVED ? Instant.now() : null);
        Order saved = orderRepository.save(order);

        OrderExchange ex = new OrderExchange();
        ex.setOrderId(saved.getId());
        ex.setPreviousStatus(before.name());
        ex.setPreviousTracking(trackingBefore);
        ex.setReturnedSummary(cut(String.join("; ", backParts), 2000));
        ex.setGivenSummary(cut(String.join("; ", outParts), 2000));
        ex.setTotalBeforeMinor(totalBefore);
        ex.setTotalAfterMinor(saved.getTotalMinor());
        ex.setNote(cleanNote);
        ex.setAdminName(adminName);
        exchangeRepository.save(ex);

        events.publishEvent(new OrderEvents.Exchanged(saved.getId(), notifyCustomer,
                String.join(", ", outParts)));

        long diff = saved.getTotalMinor() - totalBefore;
        String details = "обмен: вернули " + String.join(", ", backParts)
                + "; взамен " + String.join(", ", outParts)
                + "; сумма " + MoneyFormat.uah(totalBefore) + " → " + MoneyFormat.uah(saved.getTotalMinor())
                + (diff > 0 ? " (доплата " + MoneyFormat.uah(diff) + ")"
                        : diff < 0 ? " (к возврату " + MoneyFormat.uah(-diff) + ")" : "")
                + (trackingBefore == null ? "" : "; старая ТТН " + trackingBefore)
                + "; статус " + before.name() + " → " + to.name()
                + (cleanNote == null ? "" : "; " + cleanNote);
        return new Result(saved, details);
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }

    /**
     * Money that can still be refunded: what was received minus what was already given back. The
     * raw received amount, not capped at the total: after an exchange for something cheaper the
     * overpayment is exactly what has to go back.
     */
    public static long refundableMinor(Order order) {
        long received = Math.max(0, order.getReceivedMinor());
        return Math.max(0, received - Math.max(0, order.getRefundedMinor()));
    }

    /** Same row lock as every other order change (OrderService), so edits cannot interleave. */
    private Order load(byte[] orderId) {
        return orderService.lock(orderId);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "—" : s;
    }
}
