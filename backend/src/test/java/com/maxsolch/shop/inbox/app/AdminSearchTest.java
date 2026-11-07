package com.maxsolch.shop.inbox.app;

import com.maxsolch.shop.catalog.app.AdminProductLookup;
import com.maxsolch.shop.catalog.app.AdminProductLookup.ProductHit;
import com.maxsolch.shop.customer.app.AdminCustomerLookup;
import com.maxsolch.shop.customer.app.AdminCustomerLookup.CustomerHit;
import com.maxsolch.shop.inbox.app.AdminSearch.SearchResults;
import com.maxsolch.shop.order.app.AdminOrderLookup;
import com.maxsolch.shop.order.app.AdminOrderLookup.BuyerHit;
import com.maxsolch.shop.order.app.AdminOrderLookup.OrderHit;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** The «go to» box puts the answers of the three modules side by side and never asks them for a one-letter term. */
class AdminSearchTest {

    AdminOrderLookup orders = mock(AdminOrderLookup.class);
    AdminProductLookup products = mock(AdminProductLookup.class);
    AdminCustomerLookup customers = mock(AdminCustomerLookup.class);
    AdminSearch search = new AdminSearch(orders, products, customers);

    private static CustomerHit person(long id, String name, String username, String phone) {
        return new CustomerHit(id, name, username, phone);
    }

    @Test
    void aShortOrEmptyTermAsksNobody() {
        assertThat(search.search(null).orders()).isEmpty();
        assertThat(search.search(" a ").products()).isEmpty();
        verifyNoInteractions(orders, products, customers);
    }

    @Test
    void eachKindIsAskedForFiveAndKeepsItsOwnGroup() {
        OrderHit order = new OrderHit("o1", "5bf865c4", "Анна", "+380501112233", 10_000, "NEW", null);
        ProductHit product = new ProductHit("p1", "Мышь Lamzu", "LZ-1", 150_000, "UAH", 3, true);
        when(orders.find("мышь", 5)).thenReturn(List.of(order));
        when(products.find("мышь", 5)).thenReturn(List.of(product));
        when(customers.find("мышь", 5)).thenReturn(List.of(person(1, "Анна", "anna", null)));
        when(orders.buyersByPhone("мышь", 5)).thenReturn(List.of());

        SearchResults r = search.search("  мышь ");

        assertThat(r.orders()).containsExactly(order);
        assertThat(r.products()).containsExactly(product);
        assertThat(r.customers()).extracting(CustomerHit::username).containsExactly("anna");
    }

    @Test
    void aBuyerFoundByPhoneJoinsTheCustomersOnceAndWithTheirPhone() {
        when(orders.find(anyString(), anyInt())).thenReturn(List.of());
        when(products.find(anyString(), anyInt())).thenReturn(List.of());
        when(customers.find("0501112233", 5)).thenReturn(List.of(person(1, "Анна", "anna", null)));
        when(orders.buyersByPhone("0501112233", 5)).thenReturn(List.of(
                new BuyerHit(1, "Анна", "+380501112233"), // already found by name: not repeated
                new BuyerHit(2, "Борис", "+38 (050) 111-22-33")));
        when(customers.byIds(anyList(), anyMap())).thenReturn(List.of(person(2, "Борис К", "boris", "+38 (050) 111-22-33")));

        SearchResults r = search.search("0501112233");

        assertThat(r.customers()).extracting(CustomerHit::telegramUserId).containsExactly(1L, 2L);
        verify(customers).byIds(List.of(2L), Map.of(2L, "+38 (050) 111-22-33"));
    }

    @Test
    void neverMoreThanFivePeople() {
        List<CustomerHit> five = List.of(person(1, "a", "a", null), person(2, "b", "b", null), person(3, "c", "c", null),
                person(4, "d", "d", null), person(5, "e", "e", null));
        when(orders.find(any(), anyInt())).thenReturn(List.of());
        when(products.find(any(), anyInt())).thenReturn(List.of());
        when(customers.find("anna", 5)).thenReturn(five);
        when(orders.buyersByPhone("anna", 5)).thenReturn(List.of());

        assertThat(search.search("anna").customers()).hasSize(5);
    }
}
