package com.maxsolch.shop.order.app;

import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.DeliveryTarget;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderError;
import com.maxsolch.shop.order.domain.OrderSource;
import com.maxsolch.shop.order.domain.RecipientName;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.CyrillicNames;
import com.maxsolch.shop.platform.util.MoneyFormat;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Component;

import java.time.Instant;

import static com.maxsolch.shop.platform.util.Texts.trimToNull;

/**
 * The checkout v2 part of placing an order (V98): who receives it (the name split for the waybill), where Nova Poshta
 * takes it (branch, parcel locker or courier address, checked against the directory by {@link DeliveryAddressCheck})
 * and whether it is paid on delivery — offered only when switched on, for the deliveries the option lists, under the
 * sum ceiling and the number of open such orders per buyer.
 *
 * <p>Kept out of {@link Checkout}, which only calls it: a new delivery kind or payment kind changes this class.
 */
@Component
class CheckoutDelivery {

    /** The one-line name every screen shows and, when sent split, the waybill's parts. */
    record Recipient(String customerName, RecipientName parts) {
    }

    private final DeliveryAddressCheck addressCheck;
    private final SettingsService settings;
    private final OrderRepository orders;
    private final OrderOps ops;

    CheckoutDelivery(DeliveryAddressCheck addressCheck, SettingsService settings, OrderRepository orders,
                     OrderOps ops) {
        this.addressCheck = addressCheck;
        this.settings = settings;
        this.orders = orders;
        this.ops = ops;
    }


    /**
     * Checkout v2 sends the surname and the name apart; the one-line name is "Прізвище Ім'я" then. Latin letters
     * are refused only for Nova Poshta (its waybill takes Cyrillic only); a pickup buyer may write any letters.
     */
    Recipient recipient(CreateOrderCommand cmd, DeliveryMethod method) {
        CreateOrderCommand.NpDetails np = cmd.np();
        String last = np == null ? null : trimToNull(np.lastName());
        String first = np == null ? null : trimToNull(np.firstName());
        if ((last == null) != (first == null)) {
            throw new DomainException.BadRequest(OrderError.RECIPIENT_REQUIRED);
        }
        String oneLine = trimToNull(cmd.customerName());
        if (last == null) {
            if (oneLine == null) {
                throw new DomainException.BadRequest(OrderError.FIELD_REQUIRED, ops.fieldLabel("customerName"));
            }
            return new Recipient(oneLine, null);
        }
        RecipientName parts = new RecipientName(cut(last, 128), cut(first, 128), cut(trimToNull(np.middleName()), 128));
        if (method == DeliveryMethod.NOVA_POSHTA && parts.latin()) {
            // NP refuses Latin letters in the recipient's name: the waybill would never be made.
            throw new DomainException.BadRequest(OrderError.RECIPIENT_NOT_CYRILLIC);
        }
        return new Recipient(oneLine != null ? CyrillicNames.fixLookalikes(oneLine) : cut(parts.oneLine(), 255), parts);
    }

    /**
     * Where the parcel goes: a city always; a branch of that city for WAREHOUSE / POSTOMAT (the kind follows the
     * branch — the map lets one pick a parcel locker in the branch list); a street and a house for DOORS.
     */
    DeliveryTarget target(CreateOrderCommand cmd, DeliveryMethod method) {
        if (method != DeliveryMethod.NOVA_POSHTA) {
            return new DeliveryTarget(method, null, null, null, null);
        }
        String cityRef = trimToNull(cmd.npCityRef());
        if (cityRef == null) {
            throw new DomainException.BadRequest(OrderError.NP_CITY_REQUIRED);
        }
        CreateOrderCommand.NpDetails np = cmd.np();
        NpServiceType requested;
        try {
            requested = np == null ? null : NpServiceType.parseStrict(np.serviceType());
        } catch (IllegalArgumentException e) {
            throw new DomainException.BadRequest(OrderError.NP_WAREHOUSE_REQUIRED);
        }
        if (requested == NpServiceType.DOORS) {
            String street = trimToNull(np.streetName());
            String building = trimToNull(np.building());
            if (street == null || building == null) {
                throw new DomainException.BadRequest(OrderError.NP_ADDRESS_REQUIRED);
            }
            if (byCustomer(cmd)) {
                addressCheck.check(new DeliveryAddressCheck.Address(NpServiceType.DOORS, cityRef, null,
                        trimToNull(np.streetRef()), street, building));
            }
            return new DeliveryTarget(method, cityRef, cmd.npCityName(), null, null, NpServiceType.DOORS,
                    cut(trimToNull(np.streetRef()), 64), cut(street, 255), cut(building, 32),
                    cut(trimToNull(np.flat()), 32));
        }
        String whRef = trimToNull(cmd.npWarehouseRef());
        if (whRef == null) {
            throw new DomainException.BadRequest(OrderError.NP_WAREHOUSE_REQUIRED);
        }
        NpServiceType kind = requested == null ? NpServiceType.WAREHOUSE : requested;
        DeliveryAddressCheck.Resolved resolved = byCustomer(cmd)
                ? addressCheck.check(new DeliveryAddressCheck.Address(kind, cityRef, whRef, null, null, null))
                : new DeliveryAddressCheck.Resolved(kind, null);
        // The name on the order (and the waybill) is the directory's, not what the client sent.
        String whName = resolved.warehouseName() != null ? resolved.warehouseName() : cmd.npWarehouseName();
        return new DeliveryTarget(method, cityRef, cmd.npCityName(), whRef, cut(trimToNull(whName), 255),
                resolved.serviceType(), null, null, null, null);
    }

    /**
     * Only the customer's checkout is checked against the Nova Poshta directory (branch exists in the city and is
     * open, courier / parcel locker switched on, the goods fit the locker). The admin's manual order and an
     * exchange replacement (source ADMIN) carry the address as given — a copy of the original order's, whose
     * branch may have closed since; the admin sees it on the waybill.
     */
    private static boolean byCustomer(CreateOrderCommand cmd) {
        return cmd.source() != OrderSource.ADMIN;
    }

    /** WAREHOUSE / POSTOMAT / DOORS / PICKUP — the key {@link OrderPaymentOptions.Option#allowsDelivery} matches. */
    static String deliveryKey(Order order) {
        return order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA ? "PICKUP" : order.npService().name();
    }

    /**
     * The payment snapshot: online (the clock to pay starts now) or «при отриманні» — only when switched on, for
     * Nova Poshta and for the deliveries the option lists.
     */
    void choosePayment(Order order, OrderPaymentOptions.Option po, Instant payBy) {
        if (po.onDelivery() && !settings.get(CheckoutSettings.ON_DELIVERY_ENABLED, false)) {
            throw new DomainException.BadRequest(OrderError.PAYMENT_METHOD_UNKNOWN);
        }
        if (!po.allowsDelivery(deliveryKey(order))
                || (po.onDelivery() && order.getDeliveryMethod() != DeliveryMethod.NOVA_POSHTA)) {
            throw new DomainException.BadRequest(OrderError.PAYMENT_NOT_FOR_DELIVERY);
        }
        if (po.onDelivery()) {
            // Everything is collected by Nova Poshta («Контроль оплати»): nothing to pay online, no deadline.
            order.choosePaymentOnDelivery(po.id(), po.title());
        } else {
            order.choosePayment(po.id(), po.title(), po.requiresPrepayment() ? po.prepaymentMinor() : 0, payBy);
        }
    }

    /**
     * After pricing: the sum ceiling, and one unfinished «при отриманні» order per buyer by default — goods do not sit
     * reserved for someone who never comes to the post office.
     */
    void checkOnDeliveryLimits(Order order, Long userId) {
        if (!order.isPaymentOnDelivery()) {
            return;
        }
        long maxMinor = Math.max(0, settings.get(CheckoutSettings.ON_DELIVERY_MAX_UAH, 5000)) * 100L;
        if (maxMinor > 0 && order.getTotalMinor() > maxMinor) {
            throw new DomainException.BadRequest(OrderError.ON_DELIVERY_LIMIT, MoneyFormat.uah(maxMinor));
        }
        int maxOpen = settings.get(CheckoutSettings.ON_DELIVERY_MAX_OPEN, 1);
        if (maxOpen > 0 && userId != null && orders.countOpenOnDelivery(userId) >= maxOpen) {
            throw new DomainException.BadRequest(OrderError.ON_DELIVERY_OPEN_LIMIT, maxOpen);
        }
    }

    /** A parcel locker takes only so much: say it at the order, not when the waybill fails. */
    void checkPostomatFits(Order order, CreateOrderCommand cmd) {
        if (byCustomer(cmd) && order.getDeliveryMethod() == DeliveryMethod.NOVA_POSHTA
                && order.npService() == NpServiceType.POSTOMAT) {
            addressCheck.checkPostomatFits(order.getNpWarehouseRef(), cmd.items());
        }
    }

    private static String cut(String s, int max) {
        return s == null || s.length() <= max ? s : s.substring(0, max);
    }
}
