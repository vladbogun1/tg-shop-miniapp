package com.maxsolch.shop.order.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** OrderArchive: archiving and restoring orders. */
class OrderArchiveTest extends OrderScenarioTestBase {

    @Test
    void archive_inProgressOrder_isRejected() {
        for (OrderStatus status : List.of(OrderStatus.NEW, OrderStatus.APPROVED, OrderStatus.SHIPPED)) {
            Order o = persistedOrder(status);
            when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

            assertThatThrownBy(() -> archive.archive(o.getId(), "дубль заказа", "Влад"))
                    .isInstanceOf(DomainException.BadRequest.class)
                    .hasMessageContaining("только доставленный или отклонённый");
        }
        verify(orderRepository, never()).delete(any());
    }

    @Test
    void archive_keepsEverything_noStockNoPromoNoDelete() {
        Order o = persistedOrder(OrderStatus.DELIVERED);
        o.setPromoCode("SALE");
        OrderItem it = new OrderItem();
        it.setProductId(productId);
        it.setQuantity(2);
        o.getItems().add(it);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        Order archived = archive.archive(o.getId(), "тестовый заказ", "Влад");

        assertThat(archived.getArchivedAt()).isNotNull();
        assertThat(archived.getArchivedBy()).isEqualTo("Влад");
        assertThat(archived.getArchiveReason()).isEqualTo("тестовый заказ");
        assertThat(archived.getItems()).hasSize(1);
        verify(productRepository, never()).findByIdForUpdate(any());
        verify(promoCodeRepository, never()).findByCodeForUpdate(any());
        verify(orderRepository, never()).delete(any());
    }

    @Test
    void archive_needsReason_andUnarchiveRestores() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));

        assertThatThrownBy(() -> archive.archive(o.getId(), " ", "Влад"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("почему");

        archive.archive(o.getId(), "дубль", "Влад");
        assertThatThrownBy(() -> archive.archive(o.getId(), "дубль", "Влад"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("уже в архиве");

        Order back = archive.unarchive(o.getId());
        assertThat(back.getArchivedAt()).isNull();
        assertThat(back.getArchiveReason()).isNull();
    }

    @Test
    void archive_paymentStillProcessing_isRejected() {
        Order o = persistedOrder(OrderStatus.REJECTED);
        when(orderRepository.findByIdForUpdate(o.getId())).thenReturn(Optional.of(o));
        com.maxsolch.shop.payment.domain.PaymentInvoice processing = new com.maxsolch.shop.payment.domain.PaymentInvoice();
        processing.setStatus(com.maxsolch.shop.payment.domain.PaymentInvoice.PROCESSING);
        processing.setAmountMinor(150_000);
        when(paymentInvoices.findByOrderIdOrderByCreatedAtDesc(o.getId())).thenReturn(List.of(processing));

        assertThatThrownBy(() -> archive.archive(o.getId(), "дубль", "Влад"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("банк ещё обрабатывает");
    }
}
