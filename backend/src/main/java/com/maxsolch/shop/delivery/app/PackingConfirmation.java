package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.app.PackingCommands.ConfirmBox;
import com.maxsolch.shop.delivery.app.PackingCommands.Confirmed;
import com.maxsolch.shop.delivery.app.PackingCommands.CustomBox;
import com.maxsolch.shop.delivery.app.PackingCommands.Place;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.BoxOptions;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.Parcel;
import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.delivery.infra.PackingMemoryStore;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminDirectory;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * «Подтвердить коробку»: the packer says which box the parcel really went into. Under the order's database lock
 * {@code np-ttn:<order>} (the same as «Створити / Змінити ТТН»), with no transaction open while NP answers:
 * <ul>
 *   <li>our waybill NP has no parcel for yet — changed to this box through the usual update ({@link ShipmentEditing});
 *       a printed one is deleted and made again, so its number changes ({@link Confirmed#ttnNumberChanged()});</li>
 *   <li>NP already has the parcel, or the number was typed in — nothing is sent, the box is only recorded;</li>
 *   <li>no waybill yet — it is made now with this box and weight ({@link ShipmentCreation}): the waybill (and its
 *       label) comes after the packing, never before (v3.67.0; approving no longer makes one).</li>
 * </ul>
 * Always: the box is written on the waybill row and the packing memory learns it for these goods.
 */
@Slf4j
@Service
public class PackingConfirmation {

    static final int MAX_SIDE_MM = 3000;
    static final int MAX_WEIGHT_G = 1_000_000;

    private final ShipmentLocks locks;
    private final OrderShipmentRepository shipments;
    private final ShipmentOrders orders;
    private final ShipmentEditing editing;
    private final ShipmentCreation creation;
    private final ShipmentStore store;
    private final NpBoxCatalog catalog;
    private final ParcelSizeService parcels;
    private final PackingMemoryStore memory;
    private final CurrentActor actor;
    private final AdminDirectory admins;
    private final AdminAuditService audit;
    private final PostomatCells postomats;
    private final ShipmentPreparation preparation;
    private final Clock clock;

    PackingConfirmation(ShipmentLocks locks, OrderShipmentRepository shipments, ShipmentOrders orders,
                        ShipmentEditing editing, ShipmentCreation creation, ShipmentStore store, NpBoxCatalog catalog, ParcelSizeService parcels,
                        PackingMemoryStore memory, CurrentActor actor, AdminDirectory admins,
                        AdminAuditService audit, PostomatCells postomats, ShipmentPreparation preparation, Clock clock) {
        this.locks = locks;
        this.shipments = shipments;
        this.orders = orders;
        this.editing = editing;
        this.creation = creation;
        this.store = store;
        this.catalog = catalog;
        this.parcels = parcels;
        this.memory = memory;
        this.actor = actor;
        this.admins = admins;
        this.audit = audit;
        this.postomats = postomats;
        this.preparation = preparation;
        this.clock = clock;
    }

    /** The box chosen: a catalog box (height null = full / a bag's thickness) or typed-in sides. */
    private record Choice(NpBox box, String name, int lengthMm, int widthMm, Integer heightMm, int tareG,
                          boolean saveAsBox, boolean bag) {
    }

    /**
     * The parcel this box makes of the order's goods: sides (a bag folded into the locker's cell) and weight. Several
     * seats: the first seat's sides, the whole weight, every seat and their label.
     */
    private record Measured(int lengthMm, int widthMm, int heightMm, int weightG, int[] folded, List<Parcel.Seat> seats,
                            String label, List<NpBoxCatalog.OwnBox> own) {
    }

    private Measured measure(ShippingOrder order, String service, Choice c, Integer weightG) {
        List<Unit> units = parcels.units(order);
        int height = c.heightMm() != null ? c.heightMm() : BoxOptions.bagHeight(units);
        int weight = weightG != null ? weightG : units.stream().mapToInt(Unit::weightG).sum() + c.tareG();
        // A bag goes to NP as the goods wrapped in it, not as the empty bag laid flat.
        int[] sides = c.bag() ? BoxOptions.bagFootprint(c.lengthMm(), c.widthMm(), units)
                : new int[] {c.lengthMm(), c.widthMm()};
        int[] cell = c.bag() ? postomats.cell(service, order) : null;
        int[] folded = cell == null ? null : BoxOptions.foldBag(sides[0], sides[1], height, units, cell);
        return new Measured(folded == null ? sides[0] : folded[0], folded == null ? sides[1] : folded[1],
                height, weight, folded, null, null, List.of());
    }

    /** Several seats: each its box or sides; a weight not typed is the goods' weight shared equally + the tare. */
    private Measured places(ShippingOrder order, List<Place> places) {
        if (places.size() > PackingPlaces.MAX) {
            throw NpErrors.bad("Не больше " + PackingPlaces.MAX + " мест в одной ТТН");
        }
        List<Unit> units = parcels.units(order);
        int share = (int) Math.ceil(units.stream().mapToInt(Unit::weightG).sum() / (double) places.size());
        List<Parcel.Seat> seats = new ArrayList<>();
        List<NpBoxCatalog.OwnBox> own = new ArrayList<>();
        for (Place p : places) {
            if (p == null) {
                throw NpErrors.bad("Место " + (seats.size() + 1) + ": выберите коробку или впишите размеры");
            }
            Choice c = choice(p);
            checkWeight(p.weightG());
            int h = c.heightMm() != null ? c.heightMm() : thickness(p.custom(), units);
            // An own bag's thickness is in its label: the label is what tells the same seats again.
            String name = c.box() != null ? BoxOptions.option(c.box(), h).label()
                    : customLabel(c.name() != null ? c.name() : c.bag() ? "Свой пакет" : null, c.lengthMm(), c.widthMm(), h);
            seats.add(new Parcel.Seat(p.weightG() != null ? p.weightG() : share + c.tareG(), c.lengthMm(), c.widthMm(), h, name));
            if (c.box() == null && c.saveAsBox()) {
                own.add(new NpBoxCatalog.OwnBox(ownName(c, h), c.lengthMm(), c.widthMm(), h, c.bag()));
            }
        }
        Parcel.Seat first = seats.get(0);
        return new Measured(first.lengthMm(), first.widthMm(), first.heightMm(),
                seats.stream().mapToInt(Parcel.Seat::weightG).sum(), null, seats,
                PackingPlaces.label(seats.stream().map(Parcel.Seat::box).toList()), own);
    }

    /** A bag of one seat: as thick as typed in for an own bag (a mat in stretch film), else as the goods. */
    private static int thickness(CustomBox c, List<Unit> units) {
        return c != null && c.isBag() && side(c.heightMm()) ? c.heightMm() : BoxOptions.bagHeight(units);
    }

    private Measured measured(ShippingOrder order, OrderShipment s, ConfirmBox req, Choice c) {
        return c == null ? places(order, req.places()) : measure(order, serviceOf(s, order), c, req.weightG());
    }

    private static void checkWeight(Integer weight) {
        if (weight != null && (weight <= 0 || weight > MAX_WEIGHT_G)) {
            throw NpErrors.bad("Вес посылки — от 1 г до 1000 кг");
        }
    }

    private static String serviceOf(OrderShipment s, ShippingOrder order) {
        return s != null ? s.getServiceType() : order.serviceType() == null ? null : order.serviceType().name();
    }

    /**
     * «Упаковано» before it is pressed: what would stop the waybill made (or changed) for this box — the same
     * checks «Створити ТТН» runs, with the bag folded the same way. No NP call, no lock.
     */
    public PackingCommands.Check check(String orderId, ConfirmBox req) {
        byte[] id = UuidUtil.toBytes(orderId);
        Choice c = singleChoice(req);
        checkWeight(req.weightG());
        ShippingOrder order = orders.find(id).orElseThrow(NpErrors::orderNotFound);
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(id).orElse(null);
        Measured m = measured(order, s, req, c);
        if (s != null && (!(OrderShipment.ORIGIN_API.equals(s.getOrigin()) && beforeHandover(s))
                || unchanged(s, order, m))) {
            return new PackingCommands.Check(List.of(), List.of());  // only recorded, nothing goes to NP
        }
        Options o = s == null ? firstWaybill(m) : options(s, m);
        Prepared p = preparation.prepare(id, o);
        List<String> problems = new ArrayList<>(p.problems());
        if (s == null && p.unpaid()) {
            problems.add(PackingCommands.unpaidReason(p.amountDueMinor()));
        }
        List<String> warnings = new ArrayList<>(p.warnings());
        String bulky = c != null && c.bag()
                ? BoxOptions.bagVolumeWarning(m.lengthMm(), m.widthMm(), m.heightMm(), m.weightG()) : null;
        if (bulky != null) {
            warnings.add(bulky);
        }
        return new PackingCommands.Check(problems, warnings);
    }

    public Confirmed confirm(String orderId, ConfirmBox req) {
        byte[] id = UuidUtil.toBytes(orderId);
        Choice c = singleChoice(req);
        checkWeight(req.weightG());
        Confirmed done = locks.withOrder(id, () -> confirmLocked(id, req, c));
        audit.record("NP_BOX_CONFIRM", "ORDER", orderId, "Коробка «" + done.shipment().packing().boxLabel() + "»"
                + (done.ttnCreated() ? ", ТТН создана " + done.shipment().ttn() : "")
                + (done.ttnNumberChanged() ? ", новая ТТН " + done.shipment().ttn() : ""));
        return done;
    }

    /** {@code c} null = several seats ({@code req.places()}). */
    private Confirmed confirmLocked(byte[] orderId, ConfirmBox req, Choice c) {
        ShippingOrder order = orders.find(orderId).orElseThrow(NpErrors::orderNotFound);
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId).orElse(null);
        String confirmedBefore = s != null && s.getBoxConfirmedAt() != null ? s.getBoxLabel() : null;
        Measured m = measured(order, s, req, c);
        int height = m.heightMm();
        int[] folded = m.folded();
        int length = m.lengthMm();
        int width = m.widthMm();
        OrderShipment target = s;
        boolean updated = false;
        if (s == null && (order.status() != OrderStatus.APPROVED || order.archived())) {
            // The waybill is made by packing an approved order only; before approval — the main admin by hand.
            throw new DomainException.Conflict(DeliveryError.NP_BOX_NO_TTN, "Сначала одобрите заказ — ТТН создаётся "
                    + "при «Упаковано» у одобренного заказа");
        }
        if (s == null && ShipmentManualSync.typed(order) != null) {
            // A number typed by hand is not tracked yet (its row comes after commit): never make a second waybill.
            throw new DomainException.Conflict(DeliveryError.NP_BOX_NO_TTN,
                    "У заказа номер ТТН, введённый вручную, — обновите страницу через пару секунд");
        }
        if (s == null) {
            // Packed first, the waybill now: its box and weight are what is really in hand.
            target = creation.createHeld(orderId, firstWaybill(m));
        } else if (OrderShipment.ORIGIN_API.equals(s.getOrigin()) && beforeHandover(s) && !unchanged(s, order, m)) {
            target = editing.updateHeld(orderId, options(s, m));
            updated = true;
        }
        boolean created = s == null;
        boolean numberChanged = !created && !s.getTtn().equals(target.getTtn());
        NpBox box = c == null ? null : c.box() != null ? c.box()
                : c.saveAsBox() ? catalog.saveOwn(ownName(c, height), c.lengthMm(), c.widthMm(), height, c.bag()) : null;
        String label = c == null ? m.label() : (box != null ? BoxOptions.option(box, height).label() : c.bag()
                ? bagLabel(c.name(), c.lengthMm(), c.widthMm()) : customLabel(c.name(), c.lengthMm(), c.widthMm(), height))
                + (folded == null ? "" : " · сложить до " + BoxOptions.cm(length) + "×" + BoxOptions.cm(width) + " см");
        byte[] boxId = box == null ? null : box.getId();
        Instant now = clock.instant();
        String by = actorName();
        store.change(target.getId(), x -> {
            x.confirmBox(label, boxId, height, now, by);
            if (numberChanged && s.getBoxSuggested() != null) {
                // The remade waybill is a new row: what was suggested before the packer chose stays with it.
                x.setBoxSuggested(s.getBoxSuggested());
                x.setBoxSuggestedSource(s.getBoxSuggestedSource());
            }
        });
        try {
            catalog.saveOwnAll(m.own());
        } catch (RuntimeException e) {
            // The waybill and the packing are saved already: a box not kept in «Мои коробки» is no reason to fail them.
            log.warn("Own boxes of order {} not saved: {}", order.shortId(), e.toString());
        }
        if (c == null || label.equals(confirmedBefore)) {
            // Confirmed again (a double tap, the weight added later): the goods taught us this box once already.
            // Several seats teach nothing: the memory suggests one box for these goods.
            return done(target, order, updated, created, numberChanged, label);
        }
        String key = boxId != null ? PackingMemoryEntry.boxKey(UuidUtil.toString(boxId), height)
                : PackingMemoryEntry.customKey(c.lengthMm(), c.widthMm(), height);
        memory.remember(new PackingMemoryEntry(ShipmentFacts.goodsKey(order), key, boxId, c.lengthMm(), c.widthMm(),
                height, 1, now), now);
        return done(target, order, updated, created, numberChanged, label);
    }

    private Confirmed done(OrderShipment target, ShippingOrder order, boolean updated, boolean created,
                           boolean numberChanged, String label) {
        log.info("Box «{}» confirmed for order {} (waybill {}{})", label, order.shortId(), target.getTtn(),
                created ? ", made now" : updated ? ", updated at NP" : "");
        OrderShipment fresh = shipments.findById(target.getId()).orElse(target);
        return new Confirmed(ShipmentFacts.brief(fresh, order), updated, created, numberChanged);
    }

    /** The first waybill of a packed parcel: this box and weight, everything else from the order and settings. */
    private static Options firstWaybill(Measured m) {
        return new Options(null, m.weightG(), m.lengthMm(), m.widthMm(), m.heightMm(), null, null, null, null, null,
                null, null, false, null, m.seats());
    }

    /**
     * The waybill already says this box and weight: nothing to send — above all, a printed one is not remade (its
     * label on the parcel stays valid). Several seats are the same when their label and each stored seat are (rows from
     * before the seats were kept have only the label); and they are remade after the order changed, as the automatic
     * update leaves them alone.
     */
    private static boolean unchanged(OrderShipment s, ShippingOrder order, Measured m) {
        boolean sides = Objects.equals(s.getLengthMm(), m.lengthMm()) && Objects.equals(s.getWidthMm(), m.widthMm())
                && Objects.equals(s.getHeightMm(), m.heightMm()) && Objects.equals(s.getWeightG(), m.weightG());
        if (m.label() == null) {
            return sides && !PackingPlaces.multi(s);
        }
        List<Parcel.Seat> stored = PackingPlaces.stored(s);
        boolean seats = stored.isEmpty() || stored.equals(m.seats() == null ? List.of() : m.seats());
        return sides && seats && s.getBoxConfirmedAt() != null && m.label().equals(s.getBoxLabel())
                && ShipmentFacts.staleReasons(order, s).isEmpty();
    }

    /** NP has no parcel yet: the waybill may still change. */
    private static boolean beforeHandover(OrderShipment s) {
        ShipmentStage stage = s.stageEnum();
        return stage == ShipmentStage.CREATED || stage == ShipmentStage.NOT_FOUND;
    }

    /**
     * The waybill as it is, with this box and weight: same sender branch, declared value, «collect» choice and
     * cargo type (as the automatic update after an order change).
     */
    private static Options options(OrderShipment s, Measured m) {
        Boolean collect = Boolean.FALSE.equals(s.getCollectCod()) ? Boolean.FALSE : null;
        return new Options(s.getSenderWarehouseRef(), m.weightG(), m.lengthMm(), m.widthMm(), m.heightMm(),
                s.getDeclaredMinor(), collect, null, null, null, null, null, true,
                "Documents".equals(s.getCargoType()) ? null : Boolean.FALSE, m.seats());
    }

    /** The one box asked for; null = several seats. */
    private Choice singleChoice(ConfirmBox req) {
        if (req == null) {
            throw NpErrors.bad("Выберите коробку или впишите размеры");
        }
        return req.multi() ? null : choice(req.single());
    }

    private Choice choice(Place req) {
        if (req.boxId() != null && !req.boxId().isBlank()) {
            NpBox box = catalog.find(bytes(req.boxId()))
                    .orElseThrow(() -> new DomainException.NotFound(DeliveryError.NP_BOX_NOT_FOUND));
            Integer h = req.heightMm();
            if (h == null && !box.bag()) {
                h = box.heights().isEmpty() ? null : box.heights().get(0);
            }
            if (h != null && !BoxOptions.allows(box, h)) {
                throw NpErrors.bad("У коробки «" + box.getName() + "» нет высоты " + BoxOptions.cm(h) + " см");
            }
            if (h == null && !box.bag()) {
                throw NpErrors.bad("У коробки «" + box.getName() + "» не указана высота");
            }
            return new Choice(box, box.getName(), box.getLengthMm(), box.getWidthMm(), h, box.getTareG(), false,
                    box.bag());
        }
        CustomBox c = req.custom();
        if (c == null) {
            throw NpErrors.bad("Выберите коробку или впишите размеры");
        }
        if (!side(c.lengthMm()) || !side(c.widthMm()) || (!c.isBag() && !side(c.heightMm()))) {
            throw NpErrors.bad(c.isBag() ? "Размеры пакета — от 1 до 300 см" : "Размеры коробки — от 1 до 300 см");
        }
        String name = c.name() == null || c.name().isBlank() ? null : c.name().trim();
        if (name != null && name.length() > 60) {
            throw NpErrors.bad("Название коробки — до 60 символов");
        }
        // An own bag is as thick as the goods (like «Пакет НП»), whatever was typed for its height.
        return new Choice(null, name, c.lengthMm(), c.widthMm(), c.isBag() ? null : c.heightMm(), 0, c.saveAsBox(),
                c.isBag());
    }

    private static boolean side(Integer mm) {
        return mm != null && mm >= 10 && mm <= MAX_SIDE_MM;
    }

    private static byte[] bytes(String id) {
        try {
            return UuidUtil.toBytes(id.trim());
        } catch (IllegalArgumentException e) {
            throw new DomainException.NotFound(DeliveryError.NP_BOX_NOT_FOUND);
        }
    }

    private static String ownName(Choice c, int heightMm) {
        if (c.name() != null) {
            return c.name();
        }
        return c.bag() ? bagLabel(null, c.lengthMm(), c.widthMm()) : customLabel(null, c.lengthMm(), c.widthMm(), heightMm);
    }

    /** «Свой пакет 55×50 см» / «Стретч 55×50 см». */
    static String bagLabel(String name, int lengthMm, int widthMm) {
        return (name == null ? "Свой пакет" : name) + " " + BoxOptions.cm(lengthMm) + "×" + BoxOptions.cm(widthMm) + " см";
    }

    /** «Своя коробка 40×24×9,5 см» / «Короб от клавиатуры 45×15×5 см». */
    static String customLabel(String name, int lengthMm, int widthMm, int heightMm) {
        return (name == null ? "Своя коробка" : name) + " " + BoxOptions.cm(lengthMm) + "×" + BoxOptions.cm(widthMm)
                + "×" + BoxOptions.cm(heightMm) + " см";
    }

    private String actorName() {
        return actor.principalIfPresent().map(p -> admins.displayName(p.telegramUserId())
                .orElse("админ #" + p.telegramUserId())).orElse(null);
    }
}
