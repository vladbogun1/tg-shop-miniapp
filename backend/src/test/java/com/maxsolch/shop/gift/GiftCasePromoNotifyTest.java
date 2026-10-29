package com.maxsolch.shop.gift;

import com.maxsolch.shop.domain.Order;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.service.CatalogService;
import com.maxsolch.shop.service.OrderEvents;
import com.maxsolch.shop.service.OrderService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Opening a case with a discount prize tells the bot the new code — once, when it is issued. */
@ExtendWith(MockitoExtension.class)
class GiftCasePromoNotifyTest {

    @Mock OrderService orderService;
    @Mock GiftService giftService;
    @Mock CatalogService catalogService;
    @Mock JdbcTemplate jdbc;
    @Mock ApplicationEventPublisher events;

    private static final byte[] ORDER_ID = new byte[16];

    private GiftCaseService service() {
        return new GiftCaseService(orderService, giftService, catalogService, jdbc, events);
    }

    private OrderGiftCase discountPrize(String code) {
        OrderGiftCase rec = new OrderGiftCase();
        rec.setOrderId(ORDER_ID);
        rec.setTier("SILVER");
        rec.setCaseItemId(7L);
        rec.setKind(GiftCaseItem.Kind.DISCOUNT.name());
        rec.setRarity("RARE");
        rec.setDiscountPercent(10);
        rec.setPromoCode(code);
        Order order = new Order();
        order.setUserId(42L);
        when(orderService.openGiftCase(ORDER_ID)).thenReturn(order);
        when(giftService.orderCase(ORDER_ID)).thenReturn(Optional.of(rec));
        lenient().when(giftService.casePrizes(anyString(), anyString())).thenReturn(List.of());
        lenient().when(giftService.promo(any())).thenReturn(Optional.empty());
        return rec;
    }

    @Test
    void aFreshDiscountCodeIsAnnounced() {
        discountPrize(null);
        PromoCode promo = new PromoCode();
        promo.setCode("CASE-ABC123");
        promo.setDiscountPercent(10);
        promo.setExpiresAt(Instant.parse("2026-11-18T10:00:00Z"));
        when(giftService.issuePromo(eq(42L), eq(ORDER_ID), any(), eq(10), eq(0L))).thenReturn(promo);
        when(giftService.saveOrderCase(any())).thenAnswer(inv -> inv.getArgument(0));

        service().open(ORDER_ID, "uk");

        ArgumentCaptor<Object> event = ArgumentCaptor.forClass(Object.class);
        verify(events).publishEvent(event.capture());
        assertThat(event.getValue()).isInstanceOfSatisfying(OrderEvents.GiftCasePromo.class, e -> {
            assertThat(e.code()).isEqualTo("CASE-ABC123");
            assertThat(e.percent()).isEqualTo(10);
            assertThat(e.expiresAt()).isEqualTo(Instant.parse("2026-11-18T10:00:00Z"));
        });
    }

    @Test
    void anAlreadyIssuedCodeIsNotAnnouncedAgain() {
        discountPrize("CASE-OLD");

        service().open(ORDER_ID, "uk");

        verify(giftService, never()).issuePromo(any(), any(), any(), anyInt(), anyLong());
        verify(events, never()).publishEvent(any(Object.class));
    }
}
