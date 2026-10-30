package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.tx.DomainEvents;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Admin corrections of where an order goes and who gets it: the tracking number after shipping, the recipient's
 * name / phone and the Nova Poshta branch. None of them changes the status.
 *
 * <p>Each method returns an {@link OrderChange}: the saved order and a short Russian line for the audit log.
 */
@Service
public class OrderDeliveryEditing {

    private final OrderOps ops;
    private final OrderRepository orderRepository;
    private final DomainEvents events;

    OrderDeliveryEditing(OrderOps ops, OrderRepository orderRepository, DomainEvents events) {
        this.ops = ops;
        this.orderRepository = orderRepository;
        this.events = events;
    }

    /**
     * Replaces the ТТН of a shipped order. Before this existed a typo stayed forever and the
     * customer tracked somebody else's parcel. The customer is told the new number.
     */
    @Transactional
    public OrderChange updateTracking(byte[] orderId, String trackingNumber) {
        Order order = ops.lock(orderId);
        if (order.getStatus() != OrderStatus.SHIPPED && order.getStatus() != OrderStatus.DELIVERED) {
            throw new DomainException.BadRequest(OrderError.TTN_EDIT_STATUS_NOT_ALLOWED);
        }
        String ttn = trackingNumber == null ? "" : trackingNumber.replaceAll("\\s+", "");
        if (ttn.isEmpty()) {
            throw new DomainException.BadRequest(OrderError.TTN_REQUIRED);
        }
        if (ttn.length() > 128) {
            throw new DomainException.BadRequest(OrderError.TTN_TOO_LONG);
        }
        String old = order.getTrackingNumber();
        if (ttn.equals(old)) {
            return new OrderChange(order, "ТТН не изменилась");
        }
        order.changeTrackingNumber(ttn);
        Order saved = orderRepository.save(order);
        events.publish(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.TRACKING, true));
        return new OrderChange(saved, "ТТН: " + (old == null ? "—" : old) + " → " + ttn);
    }

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
    public OrderChange updateDelivery(byte[] orderId, DeliveryPatch patch) {
        Order order = ops.lock(orderId);
        OrderStatus s = order.getStatus();
        if (s != OrderStatus.NEW && s != OrderStatus.APPROVED && s != OrderStatus.SHIPPED) {
            throw new DomainException.BadRequest(OrderError.DELIVERY_EDIT_NOT_ALLOWED);
        }
        List<String> changes = new ArrayList<>();
        changeName(order, patch, changes);
        changePhone(order, patch, changes);
        changeBranch(order, patch, changes);
        if (changes.isEmpty()) {
            return new OrderChange(order, "без изменений");
        }
        Order saved = orderRepository.save(order);
        // Refreshes the seller's dispatch card ("К ОТПРАВКЕ") and the channel card.
        events.publish(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.DETAILS, false));
        return new OrderChange(saved, String.join("; ", changes));
    }

    private static void changeName(Order order, DeliveryPatch patch, List<String> changes) {
        if (patch.customerName() == null) {
            return;
        }
        String name = patch.customerName().trim();
        if (name.isEmpty()) {
            throw new DomainException.BadRequest(OrderError.FULL_NAME_REQUIRED);
        }
        if (name.length() > 255) {
            throw new DomainException.BadRequest(OrderError.FULL_NAME_TOO_LONG);
        }
        if (!name.equals(order.getCustomerName())) {
            changes.add("ФИО: " + order.getCustomerName() + " → " + name);
            order.rename(name);
        }
    }

    private static void changePhone(Order order, DeliveryPatch patch, List<String> changes) {
        if (patch.phone() == null) {
            return;
        }
        String phone = patch.phone().trim();
        if (phone.replaceAll("\\D", "").length() < 10 || phone.length() > 64) {
            throw new DomainException.BadRequest(OrderError.PHONE_INVALID);
        }
        if (!phone.equals(order.getPhone())) {
            changes.add("телефон: " + order.getPhone() + " → " + phone);
            order.changePhone(phone);
        }
    }

    private static void changeBranch(Order order, DeliveryPatch patch, List<String> changes) {
        boolean addressGiven = patch.npCityRef() != null || patch.npWarehouseRef() != null
                || patch.npCityName() != null || patch.npWarehouseName() != null;
        if (!addressGiven) {
            return;
        }
        if (order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA) {
            throw new DomainException.BadRequest(OrderError.PICKUP_NO_BRANCH);
        }
        if (isBlank(patch.npCityRef()) || isBlank(patch.npCityName())
                || isBlank(patch.npWarehouseRef()) || isBlank(patch.npWarehouseName())) {
            throw new DomainException.BadRequest(OrderError.NP_BRANCH_REQUIRED);
        }
        if (!Objects.equals(patch.npWarehouseRef().trim(), order.getNpWarehouseRef())
                || !Objects.equals(patch.npCityRef().trim(), order.getNpCityRef())) {
            changes.add("доставка: " + nz(order.getNpCityName()) + ", " + nz(order.getNpWarehouseName())
                    + " → " + patch.npCityName().trim() + ", " + patch.npWarehouseName().trim());
            order.changeBranch(patch.npCityRef().trim(), patch.npCityName().trim(),
                    patch.npWarehouseRef().trim(), patch.npWarehouseName().trim());
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "—" : s;
    }
}
