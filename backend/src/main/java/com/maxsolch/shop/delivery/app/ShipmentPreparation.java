package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NovaPoshtaGateway;
import com.maxsolch.shop.delivery.domain.NovaPoshtaWarehouse;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.NovaPoshtaWarehouseRepository;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.CyrillicNames;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.settings.app.SettingsService;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Reads what a waybill of the order needs and says what blocks it ({@link Prepared#problems()}) or may go wrong
 * ({@link Prepared#warnings()}): destination, recipient, parcel (with the admin's overrides and the locker's limits),
 * money, sender branch. No NP call and no transaction stays open here.
 */
@Component
class ShipmentPreparation {


    private final NovaPoshtaGateway api;
    private final NovaPoshtaSenderService sender;
    private final BoxSuggestion suggestions;
    private final ShipmentOrders orders;
    private final OrderShipmentRepository shipments;
    private final NovaPoshtaWarehouseRepository warehouses;
    private final SettingsService settings;
    private final ShopZone zone;
    private final Clock clock;

    ShipmentPreparation(NovaPoshtaGateway api, NovaPoshtaSenderService sender, BoxSuggestion suggestions,
                        ShipmentOrders orders, OrderShipmentRepository shipments,
                        NovaPoshtaWarehouseRepository warehouses, SettingsService settings, ShopZone zone,
                        Clock clock) {
        this.api = api;
        this.sender = sender;
        this.suggestions = suggestions;
        this.orders = orders;
        this.shipments = shipments;
        this.warehouses = warehouses;
        this.settings = settings;
        this.zone = zone;
        this.clock = clock;
    }

    /** Where the parcel goes: the branch (or locker) and its directory row, or the courier address. */
    private record Destination(String ref, String text, NovaPoshtaWarehouse warehouse) {
    }

    Prepared prepare(byte[] orderId, Options o) {
        ShippingOrder order = orders.find(orderId).orElseThrow(NpErrors::orderNotFound);
        List<String> problems = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        orderChecks(order, problems);
        NpServiceType service = order.serviceType() == null ? NpServiceType.WAREHOUSE : order.serviceType();
        String cityRef = blankToNull(order.cityRef());
        if (cityRef == null) {
            problems.add("Не выбран город получателя");
        }
        Destination dest = destination(order, service, problems, warnings);
        String phone = NovaPoshtaSenderService.normalizePhone(order.phone());
        if (phone == null) {
            problems.add("Телефон получателя не похож на украинский (+380…)");
        }
        String[] name = recipient(order, o, problems, warnings);
        BoxSuggestion.Suggested suggested = suggestions.forOrder(order);
        Parcel parcel = parcel(suggested.parcel(), o, service, dest, problems, warnings);
        long cod = Math.max(0, order.codMinor());
        boolean collect = o.collectCod() == null || o.collectCod();
        long declared = o.declaredMinor() != null && o.declaredMinor() > 0 ? o.declaredMinor() : order.totalMinor();
        OrderShipment active = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(order.id()).orElse(null);
        NovaPoshtaSenderService.SenderConfig cfg = sender.get().orElse(null);
        NovaPoshtaSenderService.SenderWarehouse from = senderBranch(cfg, o, active, problems);
        if (!api.keyConfigured()) {
            problems.add("Ключ API Новой почты не настроен на сервере");
        }
        String description = firstNonBlank(o.description(),
                settings.getString(DeliverySettings.NP_CARGO_DESCRIPTION), "Товари");
        LocalDate today = zone.today(clock);
        LocalDate date = o.date() != null && !o.date().isBefore(today) ? o.date() : today;
        // The order module's rule (OrderMoney): a prepayment or a top-up still due counts, a balance the admin let
        // the parcel collect does not, «при отриманні» never.
        boolean unpaid = order.onlinePaymentMissing();
        String id = UuidUtil.toString(order.id());
        return new Prepared(id, order.shortId(), order.status().name(), service, cityRef, order.cityName(),
                dest.ref(), dest.text(), blankToNull(order.streetRef()), blankToNull(order.streetName()),
                blankToNull(order.building()), blankToNull(order.flat()), phone, name[0], name[1], name[2], parcel,
                declared, cod, collect && cod > 0, description, date, cfg, from, problems, warnings, unpaid,
                unpaid ? order.amountDueMinor() : 0, active, ShipmentFacts.goodsKey(order), ShipmentFacts.recipientKey(order),
                suggested);
    }

    private static void orderChecks(ShippingOrder order, List<String> problems) {
        if (order.status() != OrderStatus.NEW && order.status() != OrderStatus.APPROVED) {
            problems.add("ТТН создаётся для нового или одобренного заказа");
        }
        if (order.archived()) {
            problems.add("Заказ в архиве");
        }
        if (order.cancelRequestPending()) {
            problems.add("Покупатель просит отменить заказ — сначала решите запрос отмены");
        }
        if (!order.novaPoshta()) {
            problems.add("Заказ не на доставку Новой почтой");
        }
    }

    private Destination destination(ShippingOrder order, NpServiceType service, List<String> problems,
                                    List<String> warnings) {
        if (service == NpServiceType.DOORS) {
            if (blankToNull(order.streetName()) == null || blankToNull(order.building()) == null) {
                problems.add("Для курьера нужны улица и дом");
            } else if (blankToNull(order.streetRef()) == null) {
                warnings.add("Улица вписана вручную — при создании ТТН найдём её в справочнике Новой почты");
            }
            return new Destination(null, address(order), null);
        }
        String ref = blankToNull(order.warehouseRef());
        if (ref == null) {
            problems.add(service == NpServiceType.POSTOMAT ? "Не выбран поштомат" : "Не выбрано отделение");
            return new Destination(null, order.warehouseName(), null);
        }
        NovaPoshtaWarehouse w = warehouses.findById(ref).orElse(null);
        if (w == null) {
            return new Destination(ref, order.warehouseName(), null);
        }
        if (!w.isActive()) {
            problems.add("Отделение получателя закрыто или пропало из справочника Новой почты — "
                    + "выберите другое в «Изменить доставку»");
        }
        return new Destination(ref, firstNonBlank(w.getDescription(), order.warehouseName()), w);
    }

    /** [last, first, middle]: the dialog's, else the order's stored parts, else split from the one line. */
    static String[] recipient(ShippingOrder order, Options o, List<String> problems, List<String> warnings) {
        String[] split = splitName(order.customerName());
        // Look-alike Latin letters in a Cyrillic word («Курзiн») are swapped: old orders and the dialog's fields.
        String last = CyrillicNames.fixLookalikes(firstNonBlank(o.recipientLastName(), order.recipientLastName(), split[0]));
        String first = CyrillicNames.fixLookalikes(firstNonBlank(o.recipientFirstName(), order.recipientFirstName(), split[1]));
        String middle = CyrillicNames.fixLookalikes(firstNonBlank(o.recipientMiddleName(), order.recipientMiddleName(), split[2]));
        String line = String.join(" ", last == null ? "" : last, first == null ? "" : first, middle == null ? "" : middle).trim();
        if (last == null || first == null) {
            problems.add("Нужны фамилия и имя получателя");
        } else if (CyrillicNames.hasLatin(line)) {
            // NP answers «LastName has invalid characters»: say it here, before the waybill, with the name itself.
            problems.add("Имя получателя «" + line + "» с латинскими буквами — Новая почта принимает только кириллицу. "
                    + "Исправьте фамилию и имя получателя в «Изменить доставку»");
        } else if (blankToNull(o.recipientLastName()) == null && blankToNull(order.recipientLastName()) == null) {
            warnings.add("Фамилия и имя взяты из одной строки «" + order.customerName()
                    + "» — проверьте, что фамилия — это «" + last + "»");
        }
        return new String[] {last, first, middle};
    }

    private Parcel parcel(Parcel suggested, Options o, NpServiceType service, Destination dest,
                          List<String> problems, List<String> warnings) {
        Parcel parcel = withOverrides(suggested, o);
        if (Boolean.FALSE.equals(o.documents())) {
            parcel = parcel.withDocuments(false);
        } else if (Boolean.TRUE.equals(o.documents()) && !parcel.documents()) {
            if (parcel.weightG() > 1000 || parcel.seats().size() > 1) {
                problems.add("«Документи» — одно место до 1 кг; эта посылка тяжелее");
            } else {
                parcel = parcel.withDocuments(true);
            }
        }
        if (parcel.documents()) {
            warnings.add("Отправка тарифом «Документи» (" + parcel.weightG() + " г) — дешевле посылки; "
                    + "если внутри не только плоские товары, переключите на посылку");
        }
        if (parcel.seats().size() > 1) {
            warnings.add("Посылка на " + parcel.seats().size() + " места (" + parcel.source()
                    + ") — впишите вес и коробку, чтобы отправить одним местом");
            if (service == NpServiceType.POSTOMAT) {
                problems.add("В поштомат — только одно место; впишите одну коробку или выберите отделение");
            }
        }
        if (service == NpServiceType.POSTOMAT && dest.ref() != null) {
            int maxKg = PostomatLimits.maxKg(dest.warehouse(), settings);
            if (parcel.weightG() > maxKg * 1000) {
                problems.add("Посылка тяжелее " + maxKg + " кг — в этот поштомат не примут");
            }
            int[] box = PostomatLimits.box(dest.warehouse(), settings);
            if (!PostomatLimits.fits(parcel, box)) {
                problems.add("Коробка больше " + box[2] / 10 + "×" + box[1] / 10 + "×" + box[0] / 10
                        + " см — в поштомат не влезет");
            }
        }
        return parcel;
    }

    /** Editing or remaking keeps the waybill's branch unless the admin picks another one; never silently another. */
    private NovaPoshtaSenderService.SenderWarehouse senderBranch(NovaPoshtaSenderService.SenderConfig cfg, Options o,
                                                                 OrderShipment active, List<String> problems) {
        if (cfg == null || !cfg.complete()) {
            problems.add("Отправитель не настроен — «Настройки» → «Доставка» → «ТТН и отправитель» → «Загрузить из кабинета НП»");
            return null;
        }
        String stored = active != null && OrderShipment.ORIGIN_API.equals(active.getOrigin())
                ? active.getSenderWarehouseRef() : null;
        String wanted = firstNonBlank(o.senderWarehouseRef(), stored);
        NovaPoshtaSenderService.SenderWarehouse from = cfg.warehouse(wanted).orElse(null);
        if (wanted != null && (from == null || !wanted.equals(from.ref()))) {
            problems.add("Отделение отправки не найдено среди отделений отправителя — выберите его заново");
            return null;
        }
        if (from != null) {
            NovaPoshtaWarehouse fw = warehouses.findById(from.ref()).orElse(null);
            if (fw != null && !fw.isActive()) {
                problems.add("Отделение отправки «" + from.description() + "» закрыто — выберите другое");
            }
        }
        return from;
    }

    /** Blocking problems, or an unpaid online order without the admin's confirmation. */
    static void requireReady(Prepared p, Options o) {
        if (!p.problems().isEmpty()) {
            throw NpErrors.bad(String.join("; ", p.problems()));
        }
        if (p.unpaid() && !o.allowUnpaid()) {
            throw new DomainException.BadRequest(DeliveryError.NP_UNPAID, "Онлайн-оплата по заказу #" + p.shortId()
                    + " не пришла — создать ТТН можно только с подтверждением");
        }
    }

    /** Our waybill NP has no parcel for yet; anything else is not changed here. */
    static OrderShipment editable(OrderShipment s) {
        if (s == null) {
            throw new DomainException.NotFound(DeliveryError.NP_NO_SHIPMENT);
        }
        if (!OrderShipment.ORIGIN_API.equals(s.getOrigin())) {
            throw NpErrors.bad("ТТН введена вручную — изменить или отменить её можно только в кабинете Новой почты");
        }
        ShipmentStage stage = s.stageEnum();
        if (stage != null && stage != ShipmentStage.CREATED && stage != ShipmentStage.NOT_FOUND) {
            throw NpErrors.bad("Новая почта уже приняла посылку — ТТН больше не меняется");
        }
        return s;
    }

    /**
     * The dialog always sends the weight and box it shows; only values that differ from the computed parcel are the
     * admin's own — they make one seat of that box. Equal values keep the computed seats.
     */
    static Parcel withOverrides(Parcel auto, Options o) {
        boolean weightSame = o.weightG() == null || o.weightG() <= 0 || o.weightG() == auto.weightG();
        boolean boxSame = sameOrUnset(o.lengthMm(), auto.lengthMm()) && sameOrUnset(o.widthMm(), auto.widthMm())
                && sameOrUnset(o.heightMm(), auto.heightMm());
        if (weightSame && boxSame) {
            return auto;
        }
        Parcel own = new Parcel(positiveOr(o.weightG(), auto.weightG()), positiveOr(o.lengthMm(), auto.lengthMm()),
                positiveOr(o.widthMm(), auto.widthMm()), positiveOr(o.heightMm(), auto.heightMm()),
                "указано вручную");
        // Flat goods typed lighter still go as «Документи»; heavier — a parcel.
        return own.withDocuments(auto.documents() && own.weightG() <= 1000);
    }

    /** cm in the dialog → mm here: 9.8 cm comes back as 98 mm, so compare whole centimetres. */
    private static boolean sameOrUnset(Integer v, int auto) {
        return v == null || v <= 0 || (v + 9) / 10 == (auto + 9) / 10;
    }

    private static int positiveOr(Integer v, int fallback) {
        return v != null && v > 0 ? v : fallback;
    }

    /** «Іван Петренко» / «Петренко Іван Іванович»: [last, first, middle] — checkout types the name first. */
    static String[] splitName(String full) {
        String[] out = new String[3];
        if (full == null || full.isBlank()) {
            return out;
        }
        String[] w = full.trim().split("\\s+");
        if (w.length == 1) {
            out[1] = w[0];
        } else if (w.length == 2) {
            out[1] = w[0];
            out[0] = w[1];
        } else {
            // Three words is the Ukrainian «Прізвище Ім'я По батькові» order.
            out[0] = w[0];
            out[1] = w[1];
            out[2] = String.join(" ", Arrays.copyOfRange(w, 2, w.length));
        }
        return out;
    }

    private static String address(ShippingOrder o) {
        StringBuilder sb = new StringBuilder();
        if (o.streetName() != null) {
            sb.append(o.streetName());
        }
        if (o.building() != null) {
            sb.append(", ").append(o.building());
        }
        if (o.flat() != null && !o.flat().isBlank()) {
            sb.append(", кв. ").append(o.flat());
        }
        return sb.isEmpty() ? null : sb.toString();
    }

    static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v.trim();
            }
        }
        return null;
    }
}
