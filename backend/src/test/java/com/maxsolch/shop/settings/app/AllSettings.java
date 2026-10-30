package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.analytics.app.StockSettings;
import com.maxsolch.shop.delivery.app.DeliverySettings;
import com.maxsolch.shop.gift.app.GiftSettings;
import com.maxsolch.shop.inbox.app.InboxSettings;
import com.maxsolch.shop.notification.app.BotSettings;
import com.maxsolch.shop.order.app.AntibotSettings;
import com.maxsolch.shop.order.app.OrderSettings;
import com.maxsolch.shop.payment.app.PaymentSettings;
import com.maxsolch.shop.preorder.app.PreorderSettings;
import com.maxsolch.shop.procurement.app.ProcurementSettings;
import com.maxsolch.shop.promo.app.PromoSettings;
import com.maxsolch.shop.review.app.ReviewSettings;
import com.maxsolch.shop.support.app.SupportSettings;
import com.maxsolch.shop.settings.domain.SettingDefinition;

import java.util.List;

/** The catalog the way the application assembles it: every module's contribution, for tests. */
public final class AllSettings {

    private AllSettings() {
    }

    public static SettingsCatalog catalog() {
        return new SettingsCatalog(List.of(new PromoSettings(), new PaymentSettings(), new StockSettings(),
                new OrderSettings(), new ReviewSettings(), new InboxSettings(), new AntibotSettings(),
                new SupportSettings(), new BotSettings(), new DeliverySettings(), new GiftSettings(),
                new PreorderSettings(), new ProcurementSettings()));
    }

    public static SettingDefinition def(String key) {
        return catalog().find(key).orElseThrow();
    }
}
