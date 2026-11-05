package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.media.app.ImageStorageService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.app.CostingDtos.ExpenseRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyLineRequest;
import com.maxsolch.shop.procurement.app.CostingDtos.MoneyRequest;
import com.maxsolch.shop.procurement.domain.PreorderBatch;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.infra.BatchExpenseFileRepository;
import com.maxsolch.shop.procurement.infra.BatchExpenseRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchItemRepository;
import com.maxsolch.shop.procurement.infra.PreorderBatchRepository;
import com.maxsolch.shop.procurement.domain.PreorderBatchItem;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/** The money the admin types is bounded: one typo must not turn the cost of goods into trillions. */
class CostingServiceTest {

    PreorderBatchRepository batches = Mockito.mock(PreorderBatchRepository.class);
    PreorderBatchItemRepository items = Mockito.mock(PreorderBatchItemRepository.class);
    BatchExpenseRepository expenses = Mockito.mock(BatchExpenseRepository.class);
    CostingService service;

    @BeforeEach
    void setUp() {
        PreorderBatch b = new PreorderBatch();
        b.setId(5L);
        b.setTitle("t");
        when(batches.findById(5L)).thenReturn(Optional.of(b));
        when(items.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of(line(11)));
        when(expenses.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(expenses.findByBatchIdOrderByIdAsc(5L)).thenReturn(List.of());
        service = new CostingService(batches, items, expenses, Mockito.mock(LineProducts.class),
                Mockito.mock(BatchExpenseFileRepository.class), Mockito.mock(ImageStorageService.class));
    }

    private static PreorderBatchItem line(long id) {
        PreorderBatchItem i = new PreorderBatchItem();
        i.setId(id);
        i.setBatchId(5L);
        i.setQtyOrdered(3);
        return i;
    }

    private static ExpenseRequest expense(long amount, String currency, String rate) {
        return new ExpenseRequest(null, "FREIGHT", amount, currency, rate == null ? null : new BigDecimal(rate), null, null);
    }

    private void rejects(Runnable call, ProcurementError code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(DomainException.BadRequest.class,
                e -> assertThat(e.errorCode()).isEqualTo(code));
    }

    @Test
    void anExpenseAboveTheLimitIsRefusedBothWays() {
        rejects(() -> service.addExpense(5L, expense(99_999_999_999_999L, "USD", "41"), "a"), ProcurementError.AMOUNT_TOO_BIG);
        rejects(() -> service.addExpense(5L, expense(-10_000_000_001L, "UAH", null), "a"), ProcurementError.AMOUNT_TOO_BIG);
        rejects(() -> service.addExpense(5L, expense(0, "UAH", null), "a"), ProcurementError.BAD_AMOUNT);
    }

    @Test
    void anExpenseAtTheLimitIsAccepted() {
        service.addExpense(5L, expense(10_000_000_000L, "USD", "10000"), "a");
        service.addExpense(5L, expense(-10_000_000_000L, "UAH", null), "a");
    }

    @Test
    void theRateIsAboveZeroAndNotAbove10000() {
        rejects(() -> service.addExpense(5L, expense(100, "USD", "10000.01"), "a"), ProcurementError.BAD_RATE);
        rejects(() -> service.addExpense(5L, expense(100, "USD", "0"), "a"), ProcurementError.BAD_RATE);
        rejects(() -> service.saveMoney(5L, new MoneyRequest(null, new BigDecimal("10001"), null, null, null)),
                ProcurementError.BAD_RATE);
    }

    @Test
    void linePricesAndManualSharesAreBounded() {
        rejects(() -> service.saveMoney(5L, lineRequest(10_000_000_001L, null)), ProcurementError.PRICE_TOO_BIG);
        rejects(() -> service.saveMoney(5L, lineRequest(-1L, null)), ProcurementError.BAD_PRICE);
        rejects(() -> service.saveMoney(5L, lineRequest(100L, -5L)), ProcurementError.BAD_MANUAL_EXTRA);
        rejects(() -> service.saveMoney(5L, lineRequest(100L, 10_000_000_001L)), ProcurementError.BAD_MANUAL_EXTRA);
        service.saveMoney(5L, lineRequest(10_000_000_000L, 10_000_000_000L));
    }

    private static MoneyRequest lineRequest(Long price, Long manual) {
        return new MoneyRequest(null, null, null, null, List.of(new MoneyLineRequest(11, price, null, manual)));
    }
}
