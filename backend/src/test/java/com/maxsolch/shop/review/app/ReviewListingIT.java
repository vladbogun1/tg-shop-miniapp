package com.maxsolch.shop.review.app;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.it.AbstractMysqlIT;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.review.app.ReviewDtos.AdminPage;
import com.maxsolch.shop.review.app.ReviewDtos.AdminReview;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** The filters of the admin list of reviews (search, ratings, «Без ответа»), on a real MySQL. */
class ReviewListingIT extends AbstractMysqlIT {

    private static long nextTg = 9_400_000_000_000L + (System.nanoTime() % 1_000_000) * 1000;

    @Autowired
    ReviewListing listing;
    @Autowired
    com.maxsolch.shop.order.app.Checkout checkout;

    private long user(String first, String username) {
        long tg = nextTg++;
        jdbc.update("INSERT INTO users (telegram_user_id, username, first_name, created_at, last_seen_at, is_premium, "
                + "bot_blocked) VALUES (?, ?, ?, now(), now(), false, false)", tg, username, first);
        return tg;
    }

    private long review(Product p, long tg, byte[] order, int rating, String status, String text, String reply) {
        jdbc.update("INSERT INTO product_reviews (product_id, order_id, user_id, tg_user_id, author_name, rating, text, "
                        + "status, admin_reply) VALUES (?, ?, ?, ?, 'Автор Х', ?, ?, ?, ?)",
                p.getId(), order, tg, tg, rating, text, status, reply);
        return jdbc.queryForObject("SELECT max(id) FROM product_reviews WHERE user_id = ?", Long.class, tg);
    }

    private AdminPage list(String status, Product p, String q, List<Integer> ratings, boolean unanswered, int page, int size) {
        return listing.list(new ReviewListing.Query(status, UuidUtil.toString(p.getId()), q, ratings, unanswered, page, size));
    }

    private static List<Long> ids(AdminPage page) {
        return page.items().stream().map(AdminReview::id).toList();
    }

    @Test
    void searchFindsByTextCustomerProductAndOrderId() {
        String tag = UUID.randomUUID().toString().substring(0, 8);
        Product p = product(10_000, 5);
        jdbc.update("UPDATE products SET title = ? WHERE id = ?", "Мышка Zq" + tag, p.getId());
        long ann = user("Аннушка" + tag, "ann_" + tag);
        long bob = user("Боб", "bob_" + tag);
        long vera = user("Вера", "vera_" + tag);
        byte[] order = checkout.createOrder(checkout(vera, "+380990" + (vera % 1_000_000), p, 1)).getId();
        long byText = review(p, bob, null, 5, "PENDING", "Супер клик " + tag, null);
        long byCustomer = review(p, ann, null, 4, "PENDING", "обычный текст", null);
        long byOrder = review(p, vera, order, 3, "PENDING", "ещё один", null);

        assertThat(ids(list("ALL", p, "клик " + tag, null, false, 0, 30))).containsExactly(byText);
        assertThat(ids(list("ALL", p, "аннушка" + tag, null, false, 0, 30))).containsExactly(byCustomer);
        assertThat(ids(list("ALL", p, "ann_" + tag, null, false, 0, 30))).containsExactly(byCustomer);
        // product title: all three reviews are about that product
        assertThat(ids(list("ALL", p, "zq" + tag, null, false, 0, 30))).containsExactlyInAnyOrder(byText, byCustomer, byOrder);
        String shortId = UuidUtil.toString(order).substring(0, 8);
        assertThat(ids(list("ALL", p, "#" + shortId, null, false, 0, 30))).containsExactly(byOrder);
        assertThat(ids(list("ALL", p, shortId, null, false, 0, 30))).containsExactly(byOrder);
        // wildcards typed by the admin are plain characters
        assertThat(ids(list("ALL", p, "%", null, false, 0, 30))).isEmpty();
    }

    @Test
    void ratingsAndUnansweredNarrowTheListAndTheCountersFollow() {
        Product p = product(10_000, 5);
        long a = user("А", "a_" + UUID.randomUUID());
        long b = user("Б", "b_" + UUID.randomUUID());
        long c = user("В", "c_" + UUID.randomUUID());
        long d = user("Г", "d_" + UUID.randomUUID());
        long five = review(p, a, null, 5, "PENDING", "пять", null);
        long two = review(p, b, null, 2, "PENDING", "два", null);
        long oneAnswered = review(p, c, null, 1, "PUBLISHED", "один", "Спасибо");
        long oneHidden = review(p, d, null, 1, "HIDDEN", "один скрытый", null);

        AdminPage all = list("ALL", p, null, null, false, 0, 30);
        assertThat(ids(all)).containsExactlyInAnyOrder(five, two, oneAnswered, oneHidden);
        assertThat(all.pendingCount()).isEqualTo(2);
        assertThat(all.publishedCount()).isEqualTo(1);
        assertThat(all.hiddenCount()).isEqualTo(1);

        AdminPage low = list("PENDING", p, null, List.of(1, 2), false, 0, 30);
        assertThat(ids(low)).containsExactly(two);
        // counters ignore the status tab but keep the stars filter
        assertThat(low.pendingCount()).isEqualTo(1);
        assertThat(low.publishedCount()).isEqualTo(1);
        assertThat(low.hiddenCount()).isEqualTo(1);

        AdminPage unanswered = list("ALL", p, null, List.of(1), true, 0, 30);
        assertThat(ids(unanswered)).containsExactly(oneHidden);
        assertThat(unanswered.total()).isEqualTo(1);
        // out-of-range ratings are ignored, not an error
        assertThat(ids(list("ALL", p, null, List.of(9), false, 0, 30))).hasSize(4);
    }

    @Test
    void paginationKeepsTheFilterAndCountsTheTotal() {
        Product p = product(10_000, 5);
        String tag = UUID.randomUUID().toString().substring(0, 8);
        for (int i = 0; i < 3; i++) {
            review(p, user("П" + i, "p" + i + "_" + tag), null, 4, "PENDING", "страница " + tag, null);
        }
        AdminPage first = list("PENDING", p, tag, null, false, 0, 2);
        AdminPage second = list("PENDING", p, tag, null, false, 1, 2);
        assertThat(first.items()).hasSize(2);
        assertThat(second.items()).hasSize(1);
        assertThat(first.total()).isEqualTo(3);
        assertThat(first.totalPages()).isEqualTo(2);
        assertThat(ids(first)).doesNotContainAnyElementsOf(ids(second));
    }
}
