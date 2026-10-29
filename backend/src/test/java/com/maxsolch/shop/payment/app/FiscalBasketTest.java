package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.platform.settings.SettingsService;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Fiscal receipt lines: tax codes travel with every line, and the stored basket reads back for refunds. */
class FiscalBasketTest {

    @Test
    void basketJsonRoundTripsWithTaxCodes() throws Exception {
        List<MonobankGateway.BasketItem> sold = List.of(
                new MonobankGateway.BasketItem("Мышь", 2, 150000, "p-1", List.of(1)),
                new MonobankGateway.BasketItem("Коврик", 1, 50000, "p-2", List.of(1)));
        ObjectMapper json = new ObjectMapper();
        String stored = json.writeValueAsString(sold);

        PaymentInvoice inv = new PaymentInvoice();
        inv.setOrderId(new byte[16]);
        inv.setExternalId("inv-1");
        inv.setBasketJson(stored);

        OnlinePaymentService svc = new OnlinePaymentService(null, null, null, null, null, null, null,
                org.mockito.Mockito.mock(SettingsService.class), null, java.time.Clock.systemUTC());
        assertThat(svc.refundItems(inv, 350000, true)).containsExactlyElementsOf(sold);

        List<MonobankGateway.BasketItem> partial = svc.refundItems(inv, 10000, false);
        assertThat(partial).hasSize(1);
        assertThat(partial.get(0).sum()).isEqualTo(10000);
        assertThat(partial.get(0).qty()).isEqualTo(1);
    }

    @Test
    void shortConstructorHasNoTax() {
        assertThat(new MonobankGateway.BasketItem("x", 1, 100, "c").tax()).isEmpty();
    }
}
