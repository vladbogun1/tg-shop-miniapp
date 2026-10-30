package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.order.domain.OrderFixtures;
import com.maxsolch.shop.platform.cache.CacheConfig;
import com.maxsolch.shop.payment.domain.PaymentInvoice;
import com.maxsolch.shop.payment.domain.MonobankGateway;
import com.maxsolch.shop.payment.infra.PaymentInvoiceRepository;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.platform.config.AppProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReceiptServiceTest {

    @Mock
    MonobankGateway mono;
    @Mock
    PaymentInvoiceRepository invoices;

    ReceiptService service;
    final byte[] orderId = UuidUtil.randomBytes();

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret("c29tZS1yZWFsbHktbG9uZy1zZWNyZXQtdmFsdWUtaGVyZQ==");
        service = new ReceiptService(mono, invoices, new ReceiptSigner(props, java.time.Clock.systemUTC()),
                new org.springframework.cache.concurrent.ConcurrentMapCacheManager(
                        CacheConfig.RECEIPT_CHECKS_OPEN, CacheConfig.RECEIPT_CHECKS_FINAL, CacheConfig.RECEIPT_CHECKS_ERROR));
        lenient().when(mono.isEnabled()).thenReturn(true);
    }

    private PaymentInvoice invoice(String ext, boolean paid) {
        PaymentInvoice i = new PaymentInvoice();
        OrderFixtures.set(i, "id", UuidUtil.randomBytes());
        OrderFixtures.set(i, "orderId", orderId);
        OrderFixtures.set(i, "externalId", ext);
        OrderFixtures.set(i, "amountMinor", 150_000);
        OrderFixtures.set(i, "status", paid ? PaymentInvoice.SUCCESS : PaymentInvoice.FAILURE);
        OrderFixtures.set(i, "appliedAt", paid ? Instant.parse("2026-10-07T10:00:00Z") : null);
        OrderFixtures.set(i, "createdAt", Instant.parse("2026-10-07T09:59:00Z"));
        return i;
    }

    private static MonobankGateway.FiscalCheck check(String id, String type, String status) {
        return new MonobankGateway.FiscalCheck(id, type, status, "", "https://cabinet.tax.gov.ua/cashregs/check?id=" + id,
                "done".equals(status) ? Base64.getEncoder().encodeToString("%PDF-1.4".getBytes()) : null, "checkbox");
    }

    @Test
    void statusMapping() {
        assertThat(ReceiptService.statusOf(check("a", "sale", "new"))).isEqualTo(ReceiptService.PENDING);
        assertThat(ReceiptService.statusOf(check("a", "sale", "process"))).isEqualTo(ReceiptService.PENDING);
        assertThat(ReceiptService.statusOf(check("a", "sale", "done"))).isEqualTo(ReceiptService.READY);
        assertThat(ReceiptService.statusOf(check("a", "sale", "DONE"))).isEqualTo(ReceiptService.READY);
        assertThat(ReceiptService.statusOf(check("a", "sale", "failed"))).isEqualTo(ReceiptService.FAILED);
        assertThat(ReceiptService.statusOf(check("a", "sale", null))).isEqualTo(ReceiptService.FAILED);
    }

    @Test
    void listsFiscalChecksAndBankReceipt_onlyForPaidInvoices() {
        PaymentInvoice paid = invoice("inv-paid", true);
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of(invoice("inv-failed", false), paid));
        when(mono.fiscalChecks("inv-paid")).thenReturn(List.of(
                check("c-sale", "sale", "done"), check("c-ret", "return", "process")));

        List<ReceiptDto> list = service.forOrder(orderId);

        assertThat(list).extracting(ReceiptDto::kind).containsExactly("FISCAL_SALE", "FISCAL_RETURN", "BANK");
        ReceiptDto sale = list.get(0);
        assertThat(sale.key()).isEqualTo("fiscal:c-sale");
        assertThat(sale.status()).isEqualTo("READY");
        assertThat(sale.amountMinor()).isEqualTo(150_000L);
        assertThat(sale.taxUrl()).contains("c-sale");
        assertThat(sale.downloadUrl()).startsWith("/api/receipts/file?inv=").contains("kind=FISCAL_SALE")
                .contains("check=c-sale").doesNotContain("inv-paid");
        ReceiptDto ret = list.get(1);
        assertThat(ret.status()).isEqualTo("PENDING");
        assertThat(ret.downloadUrl()).isNull();
        assertThat(ret.amountMinor()).isNull();
        ReceiptDto bank = list.get(2);
        assertThat(bank.status()).isEqualTo("READY");
        assertThat(bank.createdAt()).isEqualTo(paid.getAppliedAt());
        assertThat(bank.downloadUrl()).contains("kind=BANK");
        verify(mono, never()).fiscalChecks("inv-failed");
    }

    @Test
    void fiscalChecksAreCached() {
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of(invoice("inv-1", true)));
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(check("c", "sale", "process")));

        service.forOrder(orderId);
        service.forOrder(orderId);

        verify(mono, times(1)).fiscalChecks("inv-1");
    }

    @Test
    void monobankFailure_noFiscalEntries_andNoException() {
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenReturn(List.of(invoice("inv-1", true)));
        when(mono.fiscalChecks("inv-1")).thenThrow(new MonobankGateway.MonobankException(500, "X", "boom"));

        List<ReceiptDto> list = service.forOrder(orderId);

        assertThat(list).extracting(ReceiptDto::kind).containsExactly("BANK");
        // the failure is cached briefly too: no second call on the next page load
        service.forOrder(orderId);
        verify(mono, times(1)).fiscalChecks("inv-1");
    }

    @Test
    void unexpectedFailure_emptyList() {
        when(invoices.findByOrderIdOrderByCreatedAtDesc(orderId)).thenThrow(new IllegalStateException("db down"));

        assertThat(service.forOrder(orderId)).isEmpty();
    }

    @Test
    void monobankOff_emptyList() {
        when(mono.isEnabled()).thenReturn(false);

        assertThat(service.forOrder(orderId)).isEmpty();
        verify(invoices, never()).findByOrderIdOrderByCreatedAtDesc(any());
    }

    @Test
    void file_fiscalPdfOfDoneCheck() {
        PaymentInvoice inv = invoice("inv-1", true);
        when(invoices.findById(any())).thenReturn(Optional.of(inv));
        when(mono.fiscalChecks("inv-1")).thenReturn(List.of(check("c-sale", "sale", "done")));

        Optional<ReceiptService.Pdf> pdf = service.file(UuidUtil.toString(inv.getId()), "FISCAL_SALE", "c-sale");

        assertThat(pdf).isPresent();
        assertThat(new String(pdf.get().bytes())).isEqualTo("%PDF-1.4");
        assertThat(pdf.get().fileName()).isEqualTo("chisetup-" + ReceiptService.orderShort(orderId) + "-check.pdf");
    }

    @Test
    void file_unpaidInvoiceOrUnknownCheck_isEmpty() {
        PaymentInvoice unpaid = invoice("inv-1", false);
        when(invoices.findById(any())).thenReturn(Optional.of(unpaid));
        assertThat(service.file(UuidUtil.toString(unpaid.getId()), "BANK", null)).isEmpty();
        verify(mono, never()).bankReceipt(any());

        PaymentInvoice paid = invoice("inv-2", true);
        when(invoices.findById(any())).thenReturn(Optional.of(paid));
        when(mono.fiscalChecks("inv-2")).thenReturn(List.of(check("c-sale", "sale", "process")));
        assertThat(service.file(UuidUtil.toString(paid.getId()), "FISCAL_SALE", "c-sale")).isEmpty();
        assertThat(service.file(UuidUtil.toString(paid.getId()), "FISCAL_SALE", "nope")).isEmpty();
        assertThat(service.file(UuidUtil.toString(paid.getId()), "WHATEVER", null)).isEmpty();
    }
}
