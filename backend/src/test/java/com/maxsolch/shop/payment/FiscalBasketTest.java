package com.maxsolch.shop.payment;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Fiscal receipt lines: tax codes travel with every line, and the stored basket reads back for refunds. */
class FiscalBasketTest {

    @Test
    void basketJsonRoundTripsWithTaxCodes() throws Exception {
        List<MonobankClient.BasketItem> sold = List.of(
                new MonobankClient.BasketItem("Мышь", 2, 150000, "p-1", List.of(1)),
                new MonobankClient.BasketItem("Коврик", 1, 50000, "p-2", List.of(1)));
        ObjectMapper json = new ObjectMapper();
        String stored = json.writeValueAsString(sold);

        PaymentInvoice inv = new PaymentInvoice();
        inv.setOrderId(new byte[16]);
        inv.setExternalId("inv-1");
        inv.setBasketJson(stored);

        OnlinePaymentService svc = new OnlinePaymentService(null, null, null, null, null, null, null, null);
        assertThat(svc.refundItems(inv, 350000, true)).containsExactlyElementsOf(sold);

        List<MonobankClient.BasketItem> partial = svc.refundItems(inv, 10000, false);
        assertThat(partial).hasSize(1);
        assertThat(partial.get(0).sum()).isEqualTo(10000);
        assertThat(partial.get(0).qty()).isEqualTo(1);
    }

    @Test
    void shortConstructorHasNoTax() {
        assertThat(new MonobankClient.BasketItem("x", 1, 100, "c").tax()).isEmpty();
    }
}
