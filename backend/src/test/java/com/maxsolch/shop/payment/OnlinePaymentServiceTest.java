package com.maxsolch.shop.payment;

import com.maxsolch.shop.order.domain.OrderStates;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.config.AppProperties;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.order.domain.OrderItem;
import com.maxsolch.shop.order.domain.OrderStatus;
import com.maxsolch.shop.platform.i18n.Messages;
import com.maxsolch.shop.order.infra.OrderRepository;
import com.maxsolch.shop.platform.error.ConflictException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OnlinePaymentServiceTest {

    @Mock
    MonobankClient mono;
    @Mock
    PaymentInvoiceRepository invoices;
    @Mock
    OrderRepository orders;
    @Mock
    Messages messages;
    @Mock
    TransactionTemplate tx;
    @Mock
    PaymentStatusApplier applier;

    AppProperties props;
    OnlinePaymentService service;

    @BeforeEach
    void setUp() {
        props = new AppProperties();
        props.getSite().setBaseUrl("https://chisetup.com.ua");
        props.setWebappBaseUrl("https://app.chisetup.com.ua");
        service = new OnlinePaymentService(mono, invoices, orders, props, messages, tx, applier);
        lenient().when(mono.isEnabled()).thenReturn(true);
        lenient().when(messages.current(anyString())).thenAnswer(inv -> inv.getArgument(0));
    }

    // ------------------------------------------------------------------ fixtures

    private static OrderItem line(String title, String variant, long price, int qty) {
        OrderItem it = new OrderItem();
        it.setProductId(UuidUtil.randomBytes());
        it.setTitleSnapshot(title);
        it.setVariantNameSnapshot(variant);
        it.setPriceMinorSnapshot(price);
        it.setQuantity(qty);
        return it;
    }

    /** NEW order, 2 × 300 + 1 × 400 = 1000 UAH, due in 20 hours. */
    private static Order order() {
        Order o = new Order();
        o.setId(UuidUtil.randomBytes());
        OrderStates.withStatus(o, OrderStatus.NEW);
        o.setItems(new ArrayList<>(List.of(line("Свеча", "Лаванда", 300_00, 2), line("Плед", null, 400_00, 1))));
        o.setSubtotalMinor(1000_00);
        o.setTotalMinor(1000_00);
        o.setPaymentDueAt(Instant.now().plus(Duration.ofHours(20)));
        return o;
    }

    private PaymentInvoice invoice(Order o, String status, long amount, Instant expiresAt) {
        PaymentInvoice inv = new PaymentInvoice();
        inv.setOrderId(o.getId());
        inv.setExternalId("inv-" + status);
        inv.setAmountMinor(amount);
        inv.setStatus(status);
        inv.setPageUrl("https://pay.mbnk.biz/inv-" + status);
        inv.setExpiresAt(expiresAt);
        return inv;
    }

    private void given(Order o, PaymentInvoice... existing) {
        when(orders.findWithItemsById(o.getId())).thenReturn(Optional.of(o));
        lenient().when(invoices.findByOrderIdOrderByCreatedAtDesc(o.getId())).thenReturn(List.of(existing));
    }

    private static String code(Throwable t) {
        return ((ConflictException) t).getCode();
    }

    // ------------------------------------------------------------------ basket

    @Test
    void basket_isItemisedWhenTheLinesAddUpToTheAmount() {
        Order o = order();
        o.getItems().add(line("Подарок", null, 0, 1)); // gifts are not on the receipt

        List<MonobankClient.BasketItem> basket = OnlinePaymentService.basket(o, 1000_00, "abcd1234");

        assertThat(basket).extracting(MonobankClient.BasketItem::name).containsExactly("Свеча (Лаванда)", "Плед");
        assertThat(basket).extracting(MonobankClient.BasketItem::qty).containsExactly(2L, 1L);
        assertThat(basket.stream().mapToLong(b -> b.sum() * b.qty()).sum()).isEqualTo(1000_00);
    }

    @Test
    void basket_prepaymentIsOneLine() {
        Order o = order();
        o.setPrepaymentMinor(100_00);

        List<MonobankClient.BasketItem> basket = OnlinePaymentService.basket(o, 100_00, "abcd1234");

        assertThat(basket).singleElement().satisfies(b -> {
            assertThat(b.name()).isEqualTo("Передоплата за замовлення #abcd1234");
            assertThat(b.qty()).isEqualTo(1);
            assertThat(b.sum()).isEqualTo(100_00);
        });
    }

    @Test
    void basket_discountedOrderIsOneLine() {
        Order o = order();
        o.setDiscountMinor(50_00);
        o.setTotalMinor(950_00);

        List<MonobankClient.BasketItem> basket = OnlinePaymentService.basket(o, 950_00, "abcd1234");

        assertThat(basket).singleElement().satisfies(b -> {
            assertThat(b.name()).isEqualTo("Оплата замовлення #abcd1234");
            assertThat(b.sum()).isEqualTo(950_00);
        });
    }

    // ------------------------------------------------------------------ start

    @Test
    void start_createsAnInvoiceForWhatIsDue() {
        Order o = order();
        given(o);
        when(mono.createInvoice(any())).thenReturn(new MonobankClient.CreatedInvoice("inv-new", "https://pay/inv-new"));

        OnlinePaymentService.StartedPayment started = service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "en");

        assertThat(started.invoiceId()).isEqualTo("inv-new");
        assertThat(started.pageUrl()).isEqualTo("https://pay/inv-new");
        assertThat(started.amountMinor()).isEqualTo(1000_00);
        ArgumentCaptor<MonobankClient.CreateInvoice> req = ArgumentCaptor.forClass(MonobankClient.CreateInvoice.class);
        verify(mono).createInvoice(req.capture());
        assertThat(req.getValue().amount()).isEqualTo(1000_00);
        assertThat(req.getValue().reference()).isEqualTo(UuidUtil.toString(o.getId()));
        assertThat(req.getValue().webHookUrl()).isEqualTo("https://chisetup.com.ua/api/payments/mono/webhook");
        assertThat(req.getValue().redirectUrl())
                .isEqualTo("https://chisetup.com.ua/en/account/orders/" + UuidUtil.toString(o.getId()) + "?payment=return");
        ArgumentCaptor<PaymentInvoice> saved = ArgumentCaptor.forClass(PaymentInvoice.class);
        verify(invoices).save(saved.capture());
        assertThat(saved.getValue().getAmountMinor()).isEqualTo(1000_00);
        assertThat(saved.getValue().getStatus()).isEqualTo(PaymentInvoice.CREATED);
    }

    @Test
    void start_prepaymentAsksOnlyForThePrepayment() {
        Order o = order();
        o.setPrepaymentMinor(100_00);
        given(o);
        when(mono.createInvoice(any())).thenReturn(new MonobankClient.CreatedInvoice("inv-new", "https://pay/inv-new"));

        assertThat(service.start(o.getId(), OnlinePaymentService.ReturnTo.MINIAPP, "uk").amountMinor()).isEqualTo(100_00);
    }

    @Test
    void start_reusesALiveInvoiceForTheSameAmount() {
        Order o = order();
        PaymentInvoice live = invoice(o, PaymentInvoice.CREATED, 1000_00, Instant.now().plus(Duration.ofMinutes(30)));
        given(o, live);

        OnlinePaymentService.StartedPayment started = service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk");

        assertThat(started.invoiceId()).isEqualTo(live.getExternalId());
        assertThat(started.pageUrl()).isEqualTo(live.getPageUrl());
        verify(mono, never()).createInvoice(any());
        verify(invoices, never()).save(any());
    }

    @Test
    void start_refusesWhileTheBankIsProcessingAPayment() {
        Order o = order();
        given(o, invoice(o, PaymentInvoice.PROCESSING, 1000_00, Instant.now().plus(Duration.ofMinutes(30))));

        assertThatThrownBy(() -> service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk"))
                .isInstanceOf(ConflictException.class)
                .satisfies(t -> assertThat(code(t)).isEqualTo("PAYMENT_IN_PROGRESS"));
        verify(mono, never()).createInvoice(any());
    }

    @Test
    void start_refusesWhenNothingIsDue() {
        Order o = order();
        o.setReceivedMinor(1000_00);
        o.setPaid(true);
        given(o);

        assertThatThrownBy(() -> service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk"))
                .isInstanceOf(ConflictException.class)
                .satisfies(t -> assertThat(code(t)).isEqualTo("NOT_PAYABLE"));
        verify(mono, never()).createInvoice(any());
    }

    @Test
    void start_refusesARejectedOrder() {
        Order o = order();
        OrderStates.withStatus(o, OrderStatus.REJECTED);
        given(o);

        assertThatThrownBy(() -> service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk"))
                .isInstanceOf(ConflictException.class)
                .satisfies(t -> assertThat(code(t)).isEqualTo("NOT_PAYABLE"));
        verify(mono, never()).createInvoice(any());
    }

    @Test
    void start_refusesAnOrderCancelledForNonPayment() {
        Order o = order();
        OrderStates.withStatus(o, OrderStatus.REJECTED);
        o.setRejectReasonCode("PAYMENT_TIMEOUT");
        given(o);

        assertThatThrownBy(() -> service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk"))
                .isInstanceOf(ConflictException.class)
                .satisfies(t -> assertThat(code(t)).isEqualTo("PAYMENT_EXPIRED"));
    }

    @Test
    void start_refusesAfterTheDeadline() {
        Order o = order();
        o.setPaymentDueAt(Instant.now().minusSeconds(1));
        given(o);

        assertThatThrownBy(() -> service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk"))
                .isInstanceOf(ConflictException.class)
                .satisfies(t -> assertThat(code(t)).isEqualTo("PAYMENT_EXPIRED"));
        verify(mono, never()).createInvoice(any());
    }

    @Test
    void start_approvedOrderIsPayablePastTheDeadline() {
        // The shop approved it (maybe agreed in the chat): the customer may pay late until it is rejected.
        Order o = order();
        OrderStates.withStatus(o, OrderStatus.APPROVED);
        o.setPrepaymentMinor(100_00);
        o.setPaymentDueAt(Instant.now().minus(Duration.ofHours(5)));
        given(o);
        when(mono.createInvoice(any())).thenReturn(new MonobankClient.CreatedInvoice("inv-late", "https://pay/inv-late"));

        OnlinePaymentService.StartedPayment started = service.start(o.getId(), OnlinePaymentService.ReturnTo.MINIAPP, "uk");

        assertThat(started.amountMinor()).isEqualTo(100_00);
        ArgumentCaptor<MonobankClient.CreateInvoice> req = ArgumentCaptor.forClass(MonobankClient.CreateInvoice.class);
        verify(mono).createInvoice(req.capture());
        // The page lives its normal TTL, not cut to the past deadline.
        assertThat(req.getValue().validitySeconds()).isGreaterThan(60);
    }

    @Test
    void start_topUpOfAPaidOrderAfterAnItemWasAdded() {
        // Paid 1000 in full, then the shop added a 250 item: only the difference is invoiced,
        // and the long-gone checkout deadline does not apply to a paid order.
        Order o = order();
        o.setPaid(true);
        o.setReceivedMinor(1000_00);
        o.setTotalMinor(1250_00);
        o.setPaymentDueAt(Instant.now().minus(Duration.ofDays(2)));
        given(o);
        when(mono.createInvoice(any())).thenReturn(new MonobankClient.CreatedInvoice("inv-top", "https://pay/inv-top"));

        OnlinePaymentService.StartedPayment started = service.start(o.getId(), OnlinePaymentService.ReturnTo.SITE, "uk");

        assertThat(started.amountMinor()).isEqualTo(250_00);
        ArgumentCaptor<MonobankClient.CreateInvoice> req = ArgumentCaptor.forClass(MonobankClient.CreateInvoice.class);
        verify(mono).createInvoice(req.capture());
        assertThat(req.getValue().amount()).isEqualTo(250_00);
        assertThat(req.getValue().validitySeconds()).isGreaterThan(60);
    }

    @Test
    void start_refusesWhenOnlinePaymentIsOff() {
        when(mono.isEnabled()).thenReturn(false);

        assertThatThrownBy(() -> service.start(UuidUtil.randomBytes(), OnlinePaymentService.ReturnTo.SITE, "uk"))
                .isInstanceOf(ConflictException.class)
                .satisfies(t -> assertThat(code(t)).isEqualTo("PAYMENT_UNAVAILABLE"));
        verify(orders, never()).findWithItemsById(any());
    }
}
