package com.maxsolch.shop.it;

import com.maxsolch.shop.catalog.domain.Product;
import com.maxsolch.shop.order.app.Checkout;
import com.maxsolch.shop.order.domain.Order;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;

/** created_at / updated_at of an invoice: set on insert, updated_at moves on every real change, stored in UTC. */
class PaymentInvoiceTimestampsIT extends AbstractMysqlIT {

    @Autowired
    Checkout checkout;
    @Autowired
    PaymentInvoiceRepository invoices;

    private LocalDateTime column(String name, byte[] id) {
        return jdbc.queryForObject("SELECT " + name + " FROM payment_invoices WHERE id = ?", LocalDateTime.class, id);
    }

    @Test
    void insertSetsBothUpdateMovesOnlyUpdatedAtAndTheColumnsAreUtc() throws Exception {
        Product p = product(5_000, 3);
        Order o = checkout.createOrder(checkout(9_101, "+380673330101", p, 1));
        PaymentInvoice inv = new PaymentInvoice();
        inv.setId(UuidUtil.randomBytes());
        inv.setOrderId(o.getId());
        inv.setExternalId("it-" + UuidUtil.toString(inv.getId()).substring(0, 8));
        inv.setAmountMinor(5_000);
        inv.setPageUrl("https://example.invalid/pay");
        inv.setExpiresAt(Instant.now().plus(1, ChronoUnit.HOURS));

        Instant before = Instant.now().minusSeconds(1);
        tx.executeWithoutResult(s -> invoices.save(inv));
        Instant after = Instant.now().plusSeconds(1);

        LocalDateTime created = column("created_at", inv.getId());
        LocalDateTime updated = column("updated_at", inv.getId());
        assertThat(created.toInstant(ZoneOffset.UTC)).isBetween(before, after);
        assertThat(updated.toInstant(ZoneOffset.UTC)).isBetween(before, after);

        Thread.sleep(1_200);
        tx.executeWithoutResult(s -> {
            PaymentInvoice again = invoices.findById(inv.getId()).orElseThrow();
            again.setStatus(PaymentInvoice.SUCCESS);
        });

        assertThat(column("created_at", inv.getId())).isEqualTo(created);
        assertThat(column("updated_at", inv.getId())).isAfter(updated);

        // a save that changes nothing leaves updated_at alone
        LocalDateTime moved = column("updated_at", inv.getId());
        Thread.sleep(1_200);
        tx.executeWithoutResult(s -> invoices.save(invoices.findById(inv.getId()).orElseThrow()));
        assertThat(column("updated_at", inv.getId())).isEqualTo(moved);
    }
}
