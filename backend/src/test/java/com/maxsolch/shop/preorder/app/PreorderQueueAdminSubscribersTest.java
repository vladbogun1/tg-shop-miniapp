package com.maxsolch.shop.preorder.app;

import com.maxsolch.shop.catalog.infra.ProductImageRepository;
import com.maxsolch.shop.catalog.infra.ProductRepository;
import com.maxsolch.shop.customer.app.Customers;
import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.preorder.app.PreorderDtos.SubscriberDto;
import com.maxsolch.shop.preorder.domain.PreorderSubscription;
import com.maxsolch.shop.preorder.infra.PreorderSubscriptionRepository;
import com.maxsolch.shop.procurement.app.BatchCatalog;
import com.maxsolch.shop.procurement.app.LineProducts;
import com.maxsolch.shop.settings.app.SettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** «Хотят купить»: the order a subscriber already bought or booked with is handed to the admin for a link. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PreorderQueueAdminSubscribersTest {

    @Mock PreorderSubscriptionRepository subs;
    @Mock BatchCatalog batches;
    @Mock LineProducts lineProducts;
    @Mock Customers users;
    @Mock ProductRepository products;
    @Mock PreorderQueueService queue;
    @Mock SettingsService settings;
    @Mock DomainEvents events;

    PreorderQueueAdmin admin;

    @BeforeEach
    void setUp() {
        admin = new PreorderQueueAdmin(subs, batches, lineProducts, users,
                new com.maxsolch.shop.catalog.app.Products(products, mock(ProductImageRepository.class)), queue, settings, events,
                Clock.fixed(Instant.parse("2026-10-27T10:00:00Z"), ZoneOffset.UTC), new ShopZone("Europe/Kyiv"));
        when(lineProducts.productsOf(any())).thenReturn(Map.of());
        when(users.findAllById(any())).thenReturn(List.of());
    }

    private static PreorderSubscription sub(long id, UUID product, UUID order) {
        PreorderSubscription s = new PreorderSubscription();
        s.setId(id);
        s.setUserId(7L);
        s.setProductId(UuidUtil.toBytes(product));
        s.setOrderId(order == null ? null : UuidUtil.toBytes(order));
        s.moveTo(order == null ? PreorderSubscription.Status.WAITING : PreorderSubscription.Status.BOUGHT);
        s.setCreatedAt(Instant.parse("2026-10-20T10:00:00Z"));
        return s;
    }

    @Test
    void aBoughtSeatCarriesItsOrderAndAShortNumber() {
        UUID product = UUID.randomUUID();
        UUID order = UUID.fromString("a1b2c3d4-0000-4000-8000-000000000001");
        when(subs.findLiveByProduct(any())).thenReturn(List.of(sub(1, product, order), sub(2, product, null)));

        List<SubscriberDto> out = admin.subscribersOfProduct(product.toString());

        assertThat(out).hasSize(2);
        assertThat(out.get(0).orderId()).isEqualTo(order.toString());
        assertThat(out.get(0).orderNo()).isEqualTo("a1b2c3d4");
        assertThat(out.get(1).orderId()).isNull();
        assertThat(out.get(1).orderNo()).isNull();
    }
}
