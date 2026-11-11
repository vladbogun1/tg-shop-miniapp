package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.Prepared.NpResult;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.delivery.app.ShipmentCommands.Preview;
import com.maxsolch.shop.delivery.domain.DeliveryError;
import com.maxsolch.shop.delivery.domain.OrderShipment;
import com.maxsolch.shop.delivery.domain.WaybillRequest;
import com.maxsolch.shop.order.app.ShipmentOrders;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.settings.app.SettingsService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * «Створити ТТН»: the dialog's preview and the waybill itself. Made under the database lock {@code np-ttn:<order>}
 * with the active waybill re-read inside it, NP called outside any transaction, saved once
 * ({@link NpWaybillWriter#saveOnce}). The order stays as it is: tracking ships it when NP accepts the parcel.
 */
@Slf4j
@Service
public class ShipmentCreation {

    private final ShipmentPreparation preparation;
    private final NpWaybillWriter writer;
    private final ShipmentStore store;
    private final ShipmentLocks locks;
    private final NovaPoshtaPriceService prices;
    private final ParcelSizeService parcels;
    private final ShipmentOrders orders;
    private final SettingsService settings;
    private final NpAlerts alerts;

    ShipmentCreation(ShipmentPreparation preparation, NpWaybillWriter writer, ShipmentStore store,
                     ShipmentLocks locks, NovaPoshtaPriceService prices, ParcelSizeService parcels,
                     ShipmentOrders orders, SettingsService settings, NpAlerts alerts) {
        this.preparation = preparation;
        this.writer = writer;
        this.store = store;
        this.locks = locks;
        this.prices = prices;
        this.parcels = parcels;
        this.orders = orders;
        this.settings = settings;
        this.alerts = alerts;
    }

    public Preview preview(byte[] orderId, Options opt) {
        Prepared p = preparation.prepare(orderId, opt == null ? Options.defaults() : opt);
        Optional<NovaPoshtaPriceService.Estimate> e = estimate(p);
        NovaPoshtaSenderService.SenderConfig cfg = p.sender();
        return new Preview(p.orderId(), p.shortId(), p.status(), p.service().name(),
                p.lastName(), p.firstName(), p.middleName(), p.phone(), p.cityName(), p.destination(),
                p.from() == null ? null : p.from().ref(),
                cfg == null || cfg.warehouses() == null ? List.of() : cfg.warehouses(),
                p.parcel(), parcels.presets(), p.declaredMinor(), p.codMinor(), p.collectCod(), p.description(),
                p.date(), e.map(NovaPoshtaPriceService.Estimate::deliveryMinor).orElse(null),
                e.map(NovaPoshtaPriceService.Estimate::codFeeMinor).orElse(null), "Получатель, наличными",
                p.problems(), p.warnings(), p.unpaid(), p.amountDueMinor(), writer.dryRun(),
                p.active() == null ? null : ShipmentFacts.brief(p.active(), orders.find(orderId).orElse(null)));
    }

    /** «Створити ТТН». */
    public OrderShipment create(byte[] orderId, Options opt) {
        Options o = opt == null ? Options.defaults() : opt;
        return locks.withOrder(orderId, () -> createLocked(orderId, o));
    }

    private OrderShipment createLocked(byte[] orderId, Options o) {
        Prepared p = preparation.prepare(orderId, o);
        if (p.active() != null) {
            throw new DomainException.BadRequest(DeliveryError.NP_TTN_EXISTS, p.active().getTtn());
        }
        ShipmentPreparation.requireReady(p, o);
        NpResult r = writer.dryRun() ? NpWaybillWriter.fake(p) : writer.saveOnce(p);
        log.info("NP waybill {} created for order {}{}", r.number(), p.shortId(), writer.dryRun() ? " (dry run)" : "");
        Long estimate = estimateMinor(p);
        OrderShipment s = store.persistSafely(orderId, p, r, estimate);
        checkTariff(p, r, estimate);
        return s;
    }

    /** Our delivery estimate for this waybill (with the box price), or null. */
    Long estimateMinor(Prepared p) {
        return estimate(p).map(NovaPoshtaPriceService.Estimate::deliveryMinor).orElse(null);
    }

    private Optional<NovaPoshtaPriceService.Estimate> estimate(Prepared p) {
        if (p.cityRef() == null) {
            return Optional.empty();
        }
        return prices.estimate(p.cityRef(), p.service(), p.parcel(), p.declaredMinor(),
                p.collectCod() ? p.codMinor() : 0);
    }

    /** NP charged noticeably other than our estimate (without the box price): weights or boxes are off. */
    void checkTariff(Prepared p, NpResult r, Long estimate) {
        if (estimate == null || r.costMinor() == null) {
            return;
        }
        long ours = Math.max(0, estimate - p.parcel().packMinor());
        long diff = Math.abs(r.costMinor() - ours);
        int pct = Math.max(1, settings.getInt(DeliverySettings.NP_TARIFF_TOLERANCE_PCT));
        if (diff > 1000 && diff * 100 > (long) pct * Math.max(ours, 1)) {
            alerts.raise(NpAlerts.Kind.TARIFF, "Заказ #" + p.shortId() + ": Новая почта посчитала доставку "
                    + uah(r.costMinor()) + ", наша оценка " + uah(ours) + " (" + p.parcel().source()
                    + ") — проверьте вес и коробки товаров или «Коробки» в настройках");
        }
    }

    private static String uah(long minor) {
        return WaybillRequest.uah(minor) + " ₴";
    }
}
