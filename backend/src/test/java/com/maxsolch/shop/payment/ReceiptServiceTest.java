package com.maxsolch.shop.payment;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.config.AppProperties;
import com.maxsolch.shop.web.dto.ReceiptDto;
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
    MonobankClient mono;
    @Mock
    PaymentInvoiceRepository invoices;

    ReceiptService service;
    final byte[] orderId = UuidUtil.randomBytes();

    @BeforeEach
    void setUp() {
        AppProperties props = new AppProperties();
        props.getSecurity().setJwtSecret("c29tZS1yZWFsbHktbG9uZy1zZWNyZXQtdmFsdWUtaGVyZQ==");
        service = new ReceiptService(mono, invoices, new ReceiptSigner(props));
        lenient().when(mono.isEnabled()).thenReturn(true);
    }

    private PaymentInvoice invoice(String ext, boolean paid) {
        PaymentInvoice i = new PaymentInvoice();
        i.setId(UuidUtil.randomBytes());
        i.setOrderId(orderId);
        i.setExternalId(ext);
        i.setAmountMinor(150_000);
        i.setStatus(paid ? PaymentInvoice.SUCCESS : PaymentInvoice.FAILURE);
        i.setAppliedAt(paid ? Instant.parse("2026-10-07T10:00:00Z") : null);
        i.setCreatedAt(Instant.parse("2026-10-07T09:59:00Z"));
        return i;
    }

    private static MonobankClient.FiscalCheck check(String id, String type, String status) {
        return new MonobankClient.FiscalCheck(id, type, status, "", "https://cabinet.tax.gov.ua/cashregs/check?id=" + id,
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
        when(mono.fiscalChecks("inv-1")).thenThrow(new MonobankClient.MonobankException(500, "X", "boom"));

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
