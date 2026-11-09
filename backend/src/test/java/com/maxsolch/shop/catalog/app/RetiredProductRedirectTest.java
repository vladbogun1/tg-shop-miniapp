package com.maxsolch.shop.catalog.app;

import com.maxsolch.shop.catalog.domain.Category;
import com.maxsolch.shop.catalog.domain.Product;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/** A hidden/archived product's URL goes to its category; live, unknown and uncategorised ones do not. */
class RetiredProductRedirectTest {

    InMemoryCatalog db;
    RetiredProductRedirect redirect;
    Category mice;

    @BeforeEach
    void setUp() {
        db = new InMemoryCatalog();
        when(db.productRepository.findFirstBySlug(anyString())).thenAnswer(i -> db.products.stream()
                .filter(p -> p.getSlug().equals(i.getArgument(0))).findFirst());
        redirect = new RetiredProductRedirect(db.productRepository, db.directory);
        mice = db.category("myshki", "Мыши", null);
    }

    @Test
    void hiddenProductGoesToItsCategory() {
        db.product("pink mouse", mice).showInShop(false);

        assertThat(redirect.categorySlug("Pink-Mouse ")).contains("myshki");
    }

    @Test
    void archivedProductGoesToItsCategory() {
        Product p = db.product("old mouse", mice);
        p.archive(true);

        assertThat(redirect.categorySlug("old-mouse")).contains("myshki");
    }

    @Test
    void liveProductIsNotRedirected() {
        db.product("live mouse", mice);

        assertThat(redirect.categorySlug("live-mouse")).isEmpty();
    }

    @Test
    void unknownOrUncategorisedStays404() {
        db.product("loose mouse", null).showInShop(false);

        assertThat(redirect.categorySlug("loose-mouse")).isEmpty();
        assertThat(redirect.categorySlug("nothing")).isEmpty();
        assertThat(redirect.categorySlug(" ")).isEmpty();
    }
}
