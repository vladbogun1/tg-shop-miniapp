package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderEvents;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.order.domain.OrderTransitions;
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
    private final ParcelGuard parcels;

    OrderDeliveryEditing(OrderOps ops, OrderRepository orderRepository, DomainEvents events, ParcelGuard parcels) {
        this.parcels = parcels;
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
                                String npWarehouseName,
                                /** WAREHOUSE | POSTOMAT | DOORS; given = the address is set anew for that type. */
                                String npServiceType,
                                String npStreetRef,
                                String npStreetName,
                                String npBuilding,
                                String npFlat,
                                String recipientLastName,
                                String recipientFirstName,
                                String recipientMiddleName,
                                /** NOVA_POSHTA | PICKUP; given and different = the order switches to it. */
                                String deliveryMethod) {

        public DeliveryPatch(String customerName, String phone, String npCityRef, String npCityName,
                             String npWarehouseRef, String npWarehouseName) {
            this(customerName, phone, npCityRef, npCityName, npWarehouseRef, npWarehouseName,
                    null, null, null, null, null, null, null, null);
        }

        public DeliveryPatch(String customerName, String phone, String npCityRef, String npCityName,
                             String npWarehouseRef, String npWarehouseName, String npServiceType,
                             String npStreetRef, String npStreetName, String npBuilding, String npFlat,
                             String recipientLastName, String recipientFirstName, String recipientMiddleName) {
            this(customerName, phone, npCityRef, npCityName, npWarehouseRef, npWarehouseName, npServiceType,
                    npStreetRef, npStreetName, npBuilding, npFlat, recipientLastName, recipientFirstName,
                    recipientMiddleName, null);
        }

        /** Only the switch to a pickup: the order was handed over in the shop, not sent. */
        public static DeliveryPatch pickup() {
            return new DeliveryPatch(null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, DeliveryMethod.PICKUP.name());
        }

        boolean recipientGiven() {
            return recipientLastName != null || recipientFirstName != null || recipientMiddleName != null;
        }

        /** Touches what the waybill at Nova Poshta already carries (recipient or address). */
        boolean touchesWaybill() {
            return recipientGiven() || npServiceType != null || npCityRef != null || npWarehouseRef != null
                    || npStreetRef != null || npStreetName != null;
        }
    }

    /**
     * Fixes the recipient's name / phone or the Nova Poshta branch while the parcel can still be
     * re-addressed. Before this the only way out of a customer's typo was to reject and re-create.
     */
    @Transactional
    public OrderChange updateDelivery(byte[] orderId, DeliveryPatch patch) {
        Order order = ops.lock(orderId);
        DeliveryMethod method = OrderAddressChanges.method(patch.deliveryMethod());
        boolean toPickup = method == DeliveryMethod.PICKUP && order.getDeliveryMethod() != DeliveryMethod.PICKUP;
        boolean toNovaPoshta = method == DeliveryMethod.NOVA_POSHTA
                && order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA;
        requireEditable(order, toPickup, toNovaPoshta);
        if (patch.touchesWaybill() || toPickup) {
            // The waybill at NP keeps the old recipient and branch; ours would silently disagree.
            parcels.requireNotHandedOver(order);
        }
        if (toPickup) {
            // Our waybill is deleted at NP by «Скасувати ТТН» first; a typed-in number is just forgotten.
            parcels.requireNoOwnWaybill(order);
        }
        List<String> changes = new ArrayList<>();
        changeName(order, patch, changes);
        changePhone(order, patch, changes);
        if (toPickup) {
            OrderAddressChanges.toPickup(order, changes);
        } else {
            changeAddress(order, patch, toNovaPoshta, changes);
        }
        if (changes.isEmpty()) {
            return new OrderChange(order, "без изменений");
        }
        Order saved = orderRepository.save(order);
        // Refreshes the seller's dispatch card ("К ОТПРАВКЕ") and the channel card; a pickup forgets a typed-in ТТН.
        events.publish(OrderEvents.Edited.of(saved.getId(), OrderEvents.EditKind.DETAILS, false));
        return new OrderChange(saved, String.join("; ", changes));
    }

    /**
     * Recipient and address edits go while the parcel can still be re-addressed (open or SHIPPED). The switch to a
     * pickup also fits a delivered order: it was handed over in the shop and only marked as a Nova Poshta one. Back to
     * Nova Poshta only before shipping — a pickup that already left has no parcel to send.
     */
    private static void requireEditable(Order order, boolean toPickup, boolean toNovaPoshta) {
        OrderStatus s = order.getStatus();
        boolean allowed = toPickup
                ? s != OrderStatus.REJECTED
                : OrderTransitions.isDeliveryEditable(s) && (!toNovaPoshta || OrderTransitions.isOpen(s));
        if (!allowed) {
            throw new DomainException.BadRequest(toNovaPoshta && s != OrderStatus.REJECTED
                    ? OrderError.NP_SWITCH_AFTER_SHIPPING : OrderError.DELIVERY_EDIT_NOT_ALLOWED);
        }
    }

    /** Recipient parts and the Nova Poshta address; a pickup order becomes a Nova Poshta one only with a full address. */
    private static void changeAddress(Order order, DeliveryPatch patch, boolean toNovaPoshta, List<String> changes) {
        if (toNovaPoshta && patch.npServiceType() == null) {
            throw new DomainException.BadRequest(OrderError.NP_SERVICE_TYPE_UNKNOWN);
        }
        if (patch.npServiceType() != null) {
            OrderAddressChanges.serviceAddress(order, patch, toNovaPoshta, changes);
        } else {
            changeBranch(order, patch, changes);
        }
        // After the address: a new Nova Poshta recipient is checked for Cyrillic against the method it now has.
        OrderAddressChanges.recipient(order, patch, changes);
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
