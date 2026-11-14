package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.delivery.app.NovaPoshtaService;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.app.CreateOrderCommand;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderMoneyMovement;
import com.maxsolch.shop.order.domain.OrderSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The admin's «Новый заказ»: an order typed in for a known Telegram id is that customer's order (it shows in
 * «Мої замовлення»), and a Nova Poshta delivery — a branch or a courier — is taken from the directory refs.
 */
class AdminManualOrderIT extends AbstractMysqlIT {

    @Autowired
    Checkout checkout;
    @Autowired
    NovaPoshtaService novaPoshta;

    @Test
    void anOrderForAKnownTelegramIdBelongsToThatAccount() {
        long tg = 9_300_000_000L + System.nanoTime() % 1_000_000_000L;
        jdbc.update("INSERT INTO users (telegram_user_id, username, first_name) VALUES (?, ?, ?)", tg, "known_buyer", "Олег");
        Product p = product(10_000, 3);

        Order o = checkout.createAdminOrder(admin(tg, p, "PICKUP", null, null, null), 0,
                OrderMoneyMovement.Channel.CASH, "it", null);

        Map<String, Object> row = jdbc.queryForMap("SELECT user_id, tg_user_id, tg_username FROM orders WHERE id = ?", o.getId());
        assertThat(((Number) row.get("user_id")).longValue()).isEqualTo(tg);
        assertThat(((Number) row.get("tg_user_id")).longValue()).isEqualTo(tg);
        assertThat(row.get("tg_username")).isEqualTo("known_buyer");
    }

    @Test
    void anUnknownTelegramIdStaysAContactOnly() {
        long stranger = 9_400_000_000L + System.nanoTime() % 1_000_000_000L;
        Product p = product(10_000, 3);

        Order o = checkout.createAdminOrder(admin(stranger, p, "PICKUP", null, null, null), 0,
                OrderMoneyMovement.Channel.CASH, "it", null);
        Order none = checkout.createAdminOrder(admin(null, p, "PICKUP", null, null, null), 0,
                OrderMoneyMovement.Channel.CASH, "it", null);

        assertThat(jdbc.queryForObject("SELECT user_id FROM orders WHERE id = ?", Long.class, o.getId())).isNull();
        assertThat(jdbc.queryForObject("SELECT tg_user_id FROM orders WHERE id = ?", Long.class, o.getId()))
                .isEqualTo(stranger);
        assertThat(jdbc.queryForObject("SELECT user_id FROM orders WHERE id = ?", Long.class, none.getId())).isNull();
    }

    @Test
    void novaPoshtaBranchAndCourierAreStoredFromTheDirectoryRefs() {
        Product p = product(10_000, 3);

        Order branch = checkout.createAdminOrder(admin(null, p, "NOVA_POSHTA", "city-ref-1", "wh-ref-1",
                null), 0, OrderMoneyMovement.Channel.CASH, "it", null);
        Order courier = checkout.createAdminOrder(admin(null, p, "NOVA_POSHTA", "city-ref-1", null,
                new CreateOrderCommand.NpDetails("DOORS", "street-ref-1", "вул. Шевченка", "12", "5",
                        null, null, null)), 0, OrderMoneyMovement.Channel.CASH, "it", null);

        Map<String, Object> b = jdbc.queryForMap("SELECT delivery_method, np_city_ref, np_warehouse_ref, "
                + "np_warehouse_name, np_service_type FROM orders WHERE id = ?", branch.getId());
        assertThat(b.get("delivery_method")).isEqualTo("NOVA_POSHTA");
        assertThat(b.get("np_city_ref")).isEqualTo("city-ref-1");
        assertThat(b.get("np_warehouse_ref")).isEqualTo("wh-ref-1");
        assertThat(b.get("np_warehouse_name")).isEqualTo("Відділення №1");
        Map<String, Object> c = jdbc.queryForMap("SELECT np_service_type, np_street_ref, np_street_name, np_building, "
                + "np_flat, np_warehouse_ref FROM orders WHERE id = ?", courier.getId());
        assertThat(c.get("np_service_type")).isEqualTo("DOORS");
        assertThat(c.get("np_street_ref")).isEqualTo("street-ref-1");
        assertThat(c.get("np_street_name")).isEqualTo("вул. Шевченка");
        assertThat(c.get("np_building")).isEqualTo("12");
        assertThat(c.get("np_flat")).isEqualTo("5");
        assertThat(c.get("np_warehouse_ref")).isNull();
    }

    @Test
    void aVillageIsFoundWithAnyApostropheOrWithoutOne() {
        String ref = "it-" + UUID.randomUUID();
        jdbc.update("INSERT INTO nova_poshta_cities (ref, name, area) VALUES (?, ?, ?)", ref,
                "Великі Ком'яти (Виноградівський р-н, Закарпатська обл.)", "Закарпатська");

        for (String q : List.of("Комяти", "ком'яти", "Ком’яти", "Комʼяти", "великі комяти")) {
            assertThat(novaPoshta.searchCities(q)).as(q).anyMatch(c -> c.ref().equals(ref));
        }
    }

    private CreateOrderCommand admin(Long tg, Product p, String delivery, String cityRef, String whRef,
                                     CreateOrderCommand.NpDetails np) {
        return new CreateOrderCommand(null, tg, null, List.of(new CreateOrderCommand.Line(id(p), null, 1)),
                "Іваненко Олег", "+380671112233", null, null, delivery,
                cityRef, cityRef == null ? null : "Київ", whRef, whRef == null ? null : "Відділення №1",
                paymentOptionId, OrderSource.ADMIN, null, np);
    }
}
