package com.maxsolch.shop.order.app;

import org.springframework.test.util.ReflectionTestUtils;
import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.catalog.domain.ProductVariant;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.inventory.app.Stock;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Characterization of the shelf side of returns: a return that goes back «на склад», its cancellation, and
 * {@link Stock#restockProduct} (a write-off that turned out fine). Pins the counters and the product = sum of
 * variants rule — including the branch where the variant was deleted from the catalog.
 */
class OrderStockReturnsTest {

    ProductRepository products = mock(ProductRepository.class);
    OrderStock orderStock;
    Stock shelf;

    @BeforeEach
    void setUp() {
        Messages messages = mock(Messages.class);
        orderStock = StockFixtures.stock(products, messages);
        shelf = StockFixtures.shelf(products, messages);
    }

    private Product product(int stock) {
        Product p = new Product();
        ReflectionTestUtils.setField(p, "id", UuidUtil.randomBytes());
        p.retitle("Мишка");
        p.changeStock(stock);
        ReflectionTestUtils.setField(p, "variants", new ArrayList<>());
        when(products.findByIdForUpdate(p.getId())).thenReturn(Optional.of(p));
        return p;
    }

    private ProductVariant variant(Product p, int stock) {
        ProductVariant v = new ProductVariant();
        v.setId(UuidUtil.randomBytes());
        v.setProduct(p);
        v.setName("black");
        v.setStock(stock);
        p.getVariants().add(v);
        p.changeStock(p.getVariants().stream().mapToInt(ProductVariant::getStock).sum());
        return v;
    }

    private OrderItem line(Product p, byte[] variantId, int qty) {
        Order o = new Order();
        OrderItem it = new OrderItem();
        OrderFixtures.set(it, "id", 1L);
        OrderFixtures.set(it, "order", o);
        OrderFixtures.set(it, "productId", p.getId());
        OrderFixtures.set(it, "variantId", variantId);
        OrderFixtures.set(it, "titleSnapshot", p.getTitle());
        OrderFixtures.set(it, "quantity", qty);
        return it;
    }

    @Test
    void restockUnits_variant_goesToTheVariantAndTheRollup_andIsMarkedOnTheLine() {
        Product p = product(0);
        ProductVariant a = variant(p, 1);
        variant(p, 4);
        OrderItem it = line(p, a.getId(), 3);

        orderStock.restockUnits(it, 2);

        assertThat(a.getStock()).isEqualTo(3);
        assertThat(p.getStock()).isEqualTo(7);
        assertThat(it.getRestockedQty()).isEqualTo(2);
        verify(products).save(p);
    }

    @Test
    void restockUnits_plainProduct_goesOnTheProduct() {
        Product p = product(5);

        orderStock.restockUnits(line(p, null, 2), 2);

        assertThat(p.getStock()).isEqualTo(7);
    }

    @Test
    void restockUnits_zeroUnits_touchesNothing() {
        Product p = product(5);
        orderStock.restockUnits(line(p, null, 2), 0);
        assertThat(p.getStock()).isEqualTo(5);
        verify(products, never()).save(p);
    }

    @Test
    void takeBackUnits_variant_takesFromTheVariantAndTheRollup_andUnmarksTheLine() {
        Product p = product(0);
        ProductVariant a = variant(p, 3);
        variant(p, 4);
        OrderItem it = line(p, a.getId(), 3);
        it.markRestocked(3);

        orderStock.takeBackUnits(it, 2);

        assertThat(a.getStock()).isEqualTo(1);
        assertThat(p.getStock()).isEqualTo(5);
        assertThat(it.getRestockedQty()).isEqualTo(1);
        verify(products).save(p);
    }

    @Test
    void takeBackUnits_plainProduct_takesFromTheProduct() {
        Product p = product(5);
        OrderItem it = line(p, null, 2);
        it.markRestocked(2);

        orderStock.takeBackUnits(it, 2);

        assertThat(p.getStock()).isEqualTo(3);
        assertThat(it.getRestockedQty()).isZero();
    }

    @Test
    void takeBackUnits_soldMeanwhile_refusedAndNothingChanges() {
        Product p = product(0);
        ProductVariant a = variant(p, 1);
        OrderItem it = line(p, a.getId(), 3);
        it.markRestocked(3);

        assertThatThrownBy(() -> orderStock.takeBackUnits(it, 2))
                .isInstanceOf(DomainException.BadRequest.class);

        assertThat(a.getStock()).isEqualTo(1);
        assertThat(it.getRestockedQty()).isEqualTo(3);
        verify(products, never()).save(p);
    }

    @Test
    void takeBackUnits_variantDeletedFromCatalog_takesFromTheProduct() {
        Product p = product(5);
        OrderItem it = line(p, UuidUtil.randomBytes(), 3); // variant that no longer exists
        it.markRestocked(3);

        orderStock.takeBackUnits(it, 2);

        assertThat(p.getStock()).isEqualTo(3);
        assertThat(it.getRestockedQty()).isEqualTo(1);
    }

    @Test
    void takeBackUnits_productDeleted_refused() {
        Product p = product(5);
        when(products.findByIdForUpdate(p.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> orderStock.takeBackUnits(line(p, null, 2), 1))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void restockProduct_variant_goesToTheVariantAndTheRollup() {
        Product p = product(0);
        ProductVariant a = variant(p, 1);
        variant(p, 4);

        shelf.restockProduct(p.getId(), a.getId(), 2);

        assertThat(a.getStock()).isEqualTo(3);
        assertThat(p.getStock()).isEqualTo(7);
        verify(products).save(p);
    }

    @Test
    void restockProduct_variantDeletedFromCatalog_goesOnTheProduct() {
        Product p = product(5);

        shelf.restockProduct(p.getId(), UuidUtil.randomBytes(), 2);

        assertThat(p.getStock()).isEqualTo(7);
    }

    @Test
    void restockProduct_productDeleted_refused() {
        byte[] gone = UuidUtil.randomBytes();
        when(products.findByIdForUpdate(gone)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> shelf.restockProduct(gone, null, 1)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void restockProduct_noUnits_touchesNothing() {
        Product p = product(5);
        shelf.restockProduct(p.getId(), null, 0);
        verify(products, never()).findByIdForUpdate(p.getId());
    }
}
