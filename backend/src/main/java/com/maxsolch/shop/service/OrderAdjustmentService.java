package com.maxsolch.shop.service;

import com.maxsolch.shop.domain.DeliveryMethod;
import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.domain.OrderItem;
import com.maxsolch.shop.domain.OrderStatus;
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
 * Admin corrections to an order that do not change its status: fixing the tracking number after
 * shipping, fixing the recipient / delivery address, and registering a (partial) return.
 *
 * <p>Each method returns a short Russian description of what changed, for the admin audit log.
 */
@Service
public class OrderAdjustmentService {

    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final ApplicationEventPublisher events;

    public OrderAdjustmentService(OrderRepository orderRepository,
                                  OrderService orderService,
                                  ApplicationEventPublisher events) {
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.events = events;
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
     * can be recorded: a rejected order's stock was settled at rejection time.
     */
    @Transactional
    public Result registerReturn(byte[] orderId, List<ReturnLine> lines, long refundMinor, String note) {
        Order order = load(orderId);
        OrderStatus s = order.getStatus();
        if (s != OrderStatus.SHIPPED && s != OrderStatus.DELIVERED && s != OrderStatus.REJECTED) {
            throw new BadRequestException("возврат оформляется для отправленного, доставленного или отклонённого заказа");
        }
        List<ReturnLine> safeLines = lines == null ? List.of() : lines;
        if (s == OrderStatus.REJECTED && safeLines.stream().anyMatch(l -> l.quantity() > 0)) {
            throw new BadRequestException("по отклонённому заказу можно оформить только возврат денег");
        }
        if (refundMinor < 0) {
            throw new BadRequestException("сумма возврата не может быть отрицательной");
        }
        long refundable = refundableMinor(order);
        if (refundMinor > refundable) {
            throw new BadRequestException("вернуть можно не больше, чем получено: " + refundable / 100 + " ₴");
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
            parts.add("возврат денег " + refundMinor / 100 + " ₴");
        }
        order.setReturnedAt(Instant.now());
        Order saved = orderRepository.save(order);
        events.publishEvent(OrderEvents.Edited.silent(saved.getId()));
        String details = "возврат: " + String.join(", ", parts)
                + (note == null || note.isBlank() ? "" : "; " + note.trim());
        return new Result(saved, details);
    }

    /** Money that can still be refunded: what was received minus what was already given back. */
    public static long refundableMinor(Order order) {
        long received = OrderQueryService.receivedMinor(order);
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
