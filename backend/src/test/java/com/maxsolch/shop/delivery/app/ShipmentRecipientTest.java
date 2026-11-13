package com.maxsolch.shop.delivery.app;

import com.maxsolch.shop.delivery.app.ShipmentCommands.Options;
import com.maxsolch.shop.order.app.ShippingOrder;
import com.maxsolch.shop.order.domain.DeliveryMethod;
import com.maxsolch.shop.order.domain.NpServiceType;
import com.maxsolch.shop.order.domain.OrderStatus;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The waybill's recipient: NP takes Cyrillic only, so a Latin name stops the waybill here with the name shown. */
class ShipmentRecipientTest {

    private static ShippingOrder order(String customerName, String last, String first) {
        return new ShippingOrder(NpFixtures.ORDER, "01020304", OrderStatus.APPROVED, DeliveryMethod.NOVA_POSHTA,
                NpServiceType.WAREHOUSE, "city", "Харків", "wh-1", "Відділення №1", null, null, null, null,
                customerName, last, first, null, "+380991090362", false, 1000_00, 0, true, 0, false, false, false,
                null, null, null, List.of(), "");
    }

    @Test
    void lookAlikeLatinLettersAreMadeCyrillicWithoutAWord() {
        // #e6e83c17, 13.11.2026: «Курзiн» with a Latin «i» → NP «LastName has invalid characters».
        List<String> problems = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        String[] name = ShipmentPreparation.recipient(order("Курзiн Данил", "Курзiн", "Данил"), Options.defaults(),
                problems, warnings);

        assertThat(name).containsExactly("Курзін", "Данил", null);
        assertThat(problems).isEmpty();
        assertThat(warnings).isEmpty();
    }

    @Test
    void aLatinNameIsAProblemThatNamesIt() {
        List<String> problems = new ArrayList<>();
        ShipmentPreparation.recipient(order("Kurzin Danylo", null, null), Options.defaults(), problems,
                new ArrayList<>());

        assertThat(problems).singleElement().asString()
                .contains("Kurzin").contains("Danylo").contains("только кириллицу");
    }
}
