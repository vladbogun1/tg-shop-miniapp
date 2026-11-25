package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.DeliveryTarget;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.RecipientName;
import com.maxsolch.shop.platform.error.DomainException;

import java.util.List;

/**
 * The checkout v2 part of an admin's delivery correction (V98): the recipient's name split for the waybill and a new
 * Nova Poshta address for a given service type (branch, parcel locker or courier). Each change adds a Russian line
 * for the audit log.
 */
final class OrderAddressChanges {

    private OrderAddressChanges() {
    }

    /** Surname / name / middle name as on the waybill; null fields unchanged. */
    static void recipient(Order order, OrderDeliveryEditing.DeliveryPatch patch, List<String> changes) {
        if (!patch.recipientGiven()) {
            return;
        }
        RecipientName now = order.recipientName();
        String last = patch.recipientLastName() == null ? (now == null ? null : now.lastName())
                : clean(patch.recipientLastName(), 128);
        String first = patch.recipientFirstName() == null ? (now == null ? null : now.firstName())
                : clean(patch.recipientFirstName(), 128);
        String middle = patch.recipientMiddleName() == null ? (now == null ? null : now.middleName())
                : clean(patch.recipientMiddleName(), 128);
        if (isBlank(last) || isBlank(first)) {
            throw new DomainException.BadRequest(OrderError.RECIPIENT_NAME_REQUIRED);
        }
        String before = full(now);
        RecipientName next = new RecipientName(last, first, isBlank(middle) ? null : middle);
        if (!before.equals(full(next))) {
            // A new name for a Nova Poshta parcel must be Cyrillic; an old Latin one does not block other edits.
            if (order.getDeliveryMethod() == DeliveryMethod.NOVA_POSHTA && next.latin()) {
                throw new DomainException.BadRequest(OrderError.RECIPIENT_NOT_CYRILLIC);
            }
            changes.add("получатель: " + (before.isEmpty() ? "—" : before) + " → " + full(next));
            order.nameRecipient(next);
        }
    }

    /** The method a patch asks for; null = not given (the order keeps its own). */
    static DeliveryMethod method(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return DeliveryMethod.valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(OrderError.DELIVERY_METHOD_UNKNOWN);
        }
    }

    /**
     * The order was (or will be) handed over in the shop: no Nova Poshta address and no ТТН — a typed-in number left
     * on it would be tracked at NP and shown as «ТТН не найдена». The recipient's name parts stay.
     */
    static void toPickup(Order order, List<String> changes) {
        String before = describe(order);
        order.deliverTo(new DeliveryTarget(DeliveryMethod.PICKUP, null, null, null, null));
        changes.add("доставка: " + before + " → самовывоз");
        String ttn = order.getTrackingNumber();
        if (!isBlank(ttn)) {
            order.changeTrackingNumber(null);
            changes.add("ТТН " + ttn + " убрана");
        }
    }

    /**
     * A new address for the given service type: branch / parcel locker, or the courier address.
     *
     * @param switching the order is a pickup and becomes a Nova Poshta one with this address
     */
    static void serviceAddress(Order order, OrderDeliveryEditing.DeliveryPatch patch, boolean switching,
                               List<String> changes) {
        if (order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA && !switching) {
            throw new DomainException.BadRequest(OrderError.PICKUP_NO_NP_ADDRESS);
        }
        NpServiceType type;
        try {
            type = NpServiceType.parseStrict(patch.npServiceType());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(OrderError.NP_SERVICE_TYPE_UNKNOWN);
        }
        if (type == null) {
            throw new DomainException.BadRequest(OrderError.NP_SERVICE_TYPE_UNKNOWN);
        }
        String cityRef = isBlank(patch.npCityRef()) ? order.getNpCityRef() : patch.npCityRef().trim();
        String cityName = isBlank(patch.npCityName()) ? order.getNpCityName() : patch.npCityName().trim();
        if (isBlank(cityRef) || isBlank(cityName)) {
            throw new DomainException.BadRequest(OrderError.NP_EDIT_CITY_REQUIRED);
        }
        String before = describe(order);
        if (type == NpServiceType.DOORS) {
            if (isBlank(patch.npStreetName()) || isBlank(patch.npBuilding())) {
                throw new DomainException.BadRequest(OrderError.NP_EDIT_ADDRESS_REQUIRED);
            }
            order.deliverTo(new DeliveryTarget(DeliveryMethod.NOVA_POSHTA, cityRef, cityName, null, null, type,
                    isBlank(patch.npStreetRef()) ? null : patch.npStreetRef().trim(),
                    clean(patch.npStreetName(), 255), clean(patch.npBuilding(), 32),
                    isBlank(patch.npFlat()) ? null : clean(patch.npFlat(), 32)));
        } else {
            if (isBlank(patch.npWarehouseRef()) || isBlank(patch.npWarehouseName())) {
                throw new DomainException.BadRequest(type == NpServiceType.POSTOMAT
                        ? OrderError.NP_EDIT_POSTOMAT_REQUIRED : OrderError.NP_EDIT_BRANCH_REQUIRED);
            }
            order.deliverTo(new DeliveryTarget(DeliveryMethod.NOVA_POSHTA, cityRef, cityName,
                    patch.npWarehouseRef().trim(), clean(patch.npWarehouseName(), 512), type,
                    null, null, null, null));
        }
        String after = describe(order);
        if (!before.equals(after)) {
            changes.add("доставка: " + before + " → " + after);
        }
    }

    private static String full(RecipientName r) {
        return r == null ? "" : (r.oneLine() + (r.middleName() == null ? "" : " " + r.middleName())).trim();
    }

    private static String describe(Order o) {
        if (o.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA) {
            return "самовывоз";
        }
        NpServiceType t = o.npService();
        String where = t == NpServiceType.DOORS
                ? "курьер, " + nz(o.getNpStreetName()) + " " + nz(o.getNpBuilding())
                        + (isBlank(o.getNpFlat()) ? "" : ", кв. " + o.getNpFlat())
                : (t == NpServiceType.POSTOMAT ? "почтомат " : "") + nz(o.getNpWarehouseName());
        return nz(o.getNpCityName()) + ", " + where;
    }

    private static String clean(String s, int max) {
        String t = s == null ? null : s.trim();
        return t == null || t.length() <= max ? t : t.substring(0, max);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "—" : s;
    }
}
