package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.delivery.app.PackingCommands.ConfirmBox;
import com.maxsolch.shop.delivery.app.PackingCommands.Confirmed;
import com.maxsolch.shop.delivery.app.PackingCommands.CustomBox;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.domain.BoxOptions;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.NpBox;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.PackingMemoryEntry;
import com.maxsolch.shop.delivery.domain.ParcelPacking.Unit;
import com.maxsolch.shop.delivery.domain.ShipmentStage;
import com.maxsolch.shop.delivery.infra.OrderShipmentRepository;
import com.maxsolch.shop.delivery.infra.PackingMemoryStore;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminDirectory;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.web.CurrentActor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * «Подтвердить коробку»: the packer says which box the parcel really went into. Under the order's database lock
 * {@code np-ttn:<order>} (the same as «Створити / Змінити ТТН»), with no transaction open while NP answers:
 * <ul>
 *   <li>our waybill NP has no parcel for yet — changed to this box through the usual update ({@link ShipmentEditing});
 *       a printed one is deleted and made again, so its number changes ({@link Confirmed#ttnNumberChanged()});</li>
 *   <li>NP already has the parcel, or the number was typed in — nothing is sent, the box is only recorded;</li>
 *   <li>no waybill yet — refused (409 {@code NP_BOX_NO_TTN}): the box is confirmed against a waybill.</li>
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
    private final ShipmentStore store;
    private final NpBoxCatalog catalog;
    private final ParcelSizeService parcels;
    private final PackingMemoryStore memory;
    private final CurrentActor actor;
    private final AdminDirectory admins;
    private final AdminAuditService audit;
    private final Clock clock;

    PackingConfirmation(ShipmentLocks locks, OrderShipmentRepository shipments, ShipmentOrders orders,
                        ShipmentEditing editing, ShipmentStore store, NpBoxCatalog catalog, ParcelSizeService parcels,
                        PackingMemoryStore memory, CurrentActor actor, AdminDirectory admins,
                        AdminAuditService audit, Clock clock) {
        this.locks = locks;
        this.shipments = shipments;
        this.orders = orders;
        this.editing = editing;
        this.store = store;
        this.catalog = catalog;
        this.parcels = parcels;
        this.memory = memory;
        this.actor = actor;
        this.admins = admins;
        this.audit = audit;
        this.clock = clock;
    }

    /** The box chosen: a catalog box (height null = full / a bag's thickness) or typed-in sides. */
    private record Choice(NpBox box, String name, int lengthMm, int widthMm, Integer heightMm, int tareG,
                          boolean saveAsBox) {
    }

    public Confirmed confirm(String orderId, ConfirmBox req) {
        byte[] id = UuidUtil.toBytes(orderId);
        Choice c = choice(req);
        Integer weight = req.weightG();
        if (weight != null && (weight <= 0 || weight > MAX_WEIGHT_G)) {
            throw NpErrors.bad("Вес посылки — от 1 г до 1000 кг");
        }
        Confirmed done = locks.withOrder(id, () -> confirmLocked(id, c, weight));
        audit.record("NP_BOX_CONFIRM", "ORDER", orderId, "Коробка «" + done.shipment().packing().boxLabel() + "»"
                + (done.ttnNumberChanged() ? ", новая ТТН " + done.shipment().ttn() : ""));
        return done;
    }

    private Confirmed confirmLocked(byte[] orderId, Choice c, Integer weightG) {
        ShippingOrder order = orders.find(orderId).orElseThrow(NpErrors::orderNotFound);
        OrderShipment s = shipments.findFirstByOrderIdAndActiveTrueOrderByCreatedAtDesc(orderId)
                .orElseThrow(() -> new DomainException.Conflict(DeliveryError.NP_BOX_NO_TTN));
        List<Unit> units = parcels.units(order);
        int height = c.heightMm() != null ? c.heightMm() : BoxOptions.bagHeight(units);
        int weight = weightG != null ? weightG : units.stream().mapToInt(Unit::weightG).sum() + c.tareG();
        OrderShipment target = s;
        boolean updated = false;
        if (OrderShipment.ORIGIN_API.equals(s.getOrigin()) && beforeHandover(s)) {
            target = editing.updateHeld(orderId, options(s, weight, c.lengthMm(), c.widthMm(), height));
            updated = true;
        }
        boolean numberChanged = !s.getTtn().equals(target.getTtn());
        NpBox box = c.box() != null ? c.box()
                : c.saveAsBox() ? catalog.saveOwn(ownName(c, height), c.lengthMm(), c.widthMm(), height) : null;
        String label = box != null ? BoxOptions.option(box, height).label() : customLabel(c.name(), c.lengthMm(),
                c.widthMm(), height);
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
        String key = boxId != null ? PackingMemoryEntry.boxKey(UuidUtil.toString(boxId), height)
                : PackingMemoryEntry.customKey(c.lengthMm(), c.widthMm(), height);
        memory.remember(new PackingMemoryEntry(ShipmentFacts.goodsKey(order), key, boxId, c.lengthMm(), c.widthMm(),
                height, 1, now), now);
        log.info("Box «{}» confirmed for order {} (waybill {}{})", label, order.shortId(), target.getTtn(),
                updated ? ", updated at NP" : "");
        OrderShipment fresh = shipments.findById(target.getId()).orElse(target);
        return new Confirmed(ShipmentFacts.brief(fresh, order), updated, numberChanged);
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
    static Options options(OrderShipment s, int weightG, int lengthMm, int widthMm, int heightMm) {
        Boolean collect = Boolean.FALSE.equals(s.getCollectCod()) ? Boolean.FALSE : null;
        return new Options(s.getSenderWarehouseRef(), weightG, lengthMm, widthMm, heightMm, s.getDeclaredMinor(),
                collect, null, null, null, null, null, true, "Documents".equals(s.getCargoType()) ? null : Boolean.FALSE);
    }

    private Choice choice(ConfirmBox req) {
        if (req == null) {
            throw NpErrors.bad("Выберите коробку или впишите размеры");
        }
        if (req.seats() != null && req.seats() != 1) {
            throw NpErrors.bad("Пока подтверждается одно место");
        }
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
            return new Choice(box, box.getName(), box.getLengthMm(), box.getWidthMm(), h, box.getTareG(), false);
        }
        CustomBox c = req.custom();
        if (c == null) {
            throw NpErrors.bad("Выберите коробку или впишите размеры");
        }
        if (!side(c.lengthMm()) || !side(c.widthMm()) || !side(c.heightMm())) {
            throw NpErrors.bad("Размеры коробки — от 1 до 300 см");
        }
        String name = c.name() == null || c.name().isBlank() ? null : c.name().trim();
        if (name != null && name.length() > 60) {
            throw NpErrors.bad("Название коробки — до 60 символов");
        }
        return new Choice(null, name, c.lengthMm(), c.widthMm(), c.heightMm(), 0, c.saveAsBox());
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
        return c.name() != null ? c.name() : customLabel(null, c.lengthMm(), c.widthMm(), heightMm);
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
