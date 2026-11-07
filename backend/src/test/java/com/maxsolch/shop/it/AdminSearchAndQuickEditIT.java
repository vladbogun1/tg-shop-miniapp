package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.app.AdminProductDto;
import com.maxsolch.shop.catalog.app.ProductQuickEdit;
import com.maxsolch.shop.catalog.app.ProductQuickEditRequest;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.inbox.app.AdminSearch;
import com.maxsolch.shop.inbox.app.AdminSearch.SearchResults;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The «go to» box and the list's quick edit on the real schema: the JPQL runs and the stock ledger stays in step. */
class AdminSearchAndQuickEditIT extends AbstractMysqlIT {

    @Autowired
    AdminSearch search;
    @Autowired
    ProductQuickEdit quick;
    @Autowired
    Checkout orders;

    private static String token() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 10);
    }

    @Test
    void findsAnOrderByNumberNameAndPhoneWrittenAnyWay() {
        String digits = String.valueOf(1_000_000_000L + (long) (Math.random() * 8_000_000_000L));
        String phone = "+38 (" + digits.substring(0, 3) + ") " + digits.substring(3, 6) + "-" + digits.substring(6);
        Product p = product(10_000, 5);
        long buyer = 9_100_000L + (long) (Math.random() * 800_000);
        jdbc.update("INSERT INTO users (telegram_user_id, first_name) VALUES (?, ?)", buyer, "Покупатель");
        Order order = orders.createOrder(checkout(buyer, phone, p, 1));
        String shortId = UuidUtil.toString(order.getId()).substring(0, 8);

        assertThat(search.search("#" + shortId).orders()).extracting(o -> o.id()).contains(UuidUtil.toString(order.getId()));
        assertThat(search.search(digits).orders()).extracting(o -> o.id()).contains(UuidUtil.toString(order.getId()));
        assertThat(search.search("IT Покупатель").orders()).isNotEmpty().hasSizeLessThanOrEqualTo(5);
        // the buyer of that order is also found as a person by the phone
        assertThat(search.search(digits).customers()).extracting(c -> c.phone()).contains(phone);
    }

    @Test
    void findsAProductByTitleOrArticleAndACustomerByUsername() {
        String t = token();
        Product p = product(10_000, 2);
        jdbc.update("UPDATE products SET title = ?, sku = ? WHERE id = ?", "Мышь " + t, "SKU-" + t, p.getId());
        long tg = 9_900_000L + (long) (Math.random() * 90_000);
        jdbc.update("INSERT INTO users (telegram_user_id, username, first_name) VALUES (?, ?, ?)", tg, "usr_" + t, "Имя" + t);

        assertThat(search.search("мышь " + t).products()).extracting(h -> h.id()).containsExactly(id(p));
        assertThat(search.search("sku-" + t).products()).extracting(h -> h.id()).containsExactly(id(p));
        SearchResults byUsername = search.search("@usr_" + t);
        assertThat(byUsername.customers()).extracting(c -> c.telegramUserId()).containsExactly(tg);
        // «_» is a letter of the username, not a wildcard
        assertThat(search.search("usr_" + t.substring(0, 3) + "%").customers()).isEmpty();
    }

    @Test
    void quickStockEditKeepsTheLotsAndWritesOffTheDrop() {
        Product p = product(10_000, 2, 3);

        AdminProductDto saved = quick.apply(id(p), new ProductQuickEditRequest(null, null, 1, 5, "DEFECT", null));

        assertThat(saved.stock()).isEqualTo(1);
        assertThat(stockOf(p)).isEqualTo(1);
        assertThat(lotsLeftOf(p)).isEqualTo(1);
        Integer written = jdbc.queryForObject("SELECT COALESCE(SUM(quantity), 0) FROM stock_writeoffs WHERE product_id = ?",
                Integer.class, p.getId());
        assertThat(written).isEqualTo(4);
    }

    @Test
    void quickEditOverAStaleStockOrPriceChangesNothing() {
        Product p = product(10_000, 5);

        assertThatThrownBy(() -> quick.apply(id(p), new ProductQuickEditRequest(null, null, 9, 4, null, null)))
                .isInstanceOf(DomainException.Conflict.class);
        assertThatThrownBy(() -> quick.apply(id(p), new ProductQuickEditRequest(7_000L, 9_999L, null, null, null, null)))
                .isInstanceOf(DomainException.Conflict.class);

        assertThat(stockOf(p)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT price_minor FROM products WHERE id = ?", Long.class, p.getId())).isEqualTo(10_000L);
        assertThat(quick.apply(id(p), new ProductQuickEditRequest(7_000L, 10_000L, 8, 5, null, null)).priceMinor())
                .isEqualTo(7_000L);
        assertThat(lotsLeftOf(p)).isEqualTo(8);
    }
}
