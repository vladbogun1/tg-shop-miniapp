package com.maxsolch.shop.payment.app;

import com.maxsolch.shop.payment.domain.PaymentOption;
import com.maxsolch.shop.payment.infra.PaymentOptionRepository;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.site.app.SiteRevalidator;
import jakarta.validation.Validation;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Saving the checkout's payment options: never all off, never deleted, order = list order, audited. */
class PaymentOptionsTest {

    private PaymentOptionRepository repository;
    private AdminAuditService audit;
    private SiteRevalidator site;
    private PaymentOptions options;
    private final List<PaymentOption> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        repository = mock(PaymentOptionRepository.class);
        audit = mock(AdminAuditService.class);
        site = mock(SiteRevalidator.class);
        when(repository.save(any())).thenAnswer(inv -> {
            PaymentOption po = inv.getArgument(0);
            if (po.getId() == null) {
                po.setId(UuidUtil.randomBytes());
            }
            saved.add(po);
            return po;
        });
        options = new PaymentOptions(repository, audit, site, Validation.buildDefaultValidatorFactory().getValidator());
    }

    private static AdminPaymentOptionDto dto(String id, String title, boolean active) {
        return new AdminPaymentOptionDto(id, title, null, false, 0, 0, active);
    }

    private static PaymentOption existing(String title, boolean active) {
        PaymentOption po = new PaymentOption();
        po.setId(UuidUtil.randomBytes());
        po.setTitle(title);
        po.setActive(active);
        return po;
    }

    @Test
    void aListWithNoActiveOptionIsRefused() {
        assertThatThrownBy(() -> options.replace(List.of(dto(null, "Карта", false))))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("Нельзя выключить все способы оплаты");
        assertThatThrownBy(() -> options.replace(List.of())).isInstanceOf(DomainException.BadRequest.class);

        verify(repository, never()).save(any());
        verify(site, never()).paymentChanged();
    }

    @Test
    void aBlankTitleIsRefused() {
        assertThatThrownBy(() -> options.replace(List.of(dto(null, "  ", true))))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void anOptionMissingFromTheListIsSwitchedOffNotDeleted() {
        PaymentOption keep = existing("Карта", true);
        PaymentOption drop = existing("Наложка", true);
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(keep, drop));

        options.replace(List.of(dto(UuidUtil.toString(keep.getId()), "Карта", true)));

        assertThat(drop.isActive()).isFalse();
        assertThat(keep.isActive()).isTrue();
        verify(repository, never()).delete(any());
        verify(audit).record(eq("PAYMENT_OPTIONS"), eq("PAYMENT"), eq(null), anyString());
        verify(site).paymentChanged();
    }

    @Test
    void theListOrderIsTheCheckoutOrder() {
        PaymentOption a = existing("A", true);
        PaymentOption b = existing("B", true);
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of(a, b));

        options.replace(List.of(dto(UuidUtil.toString(b.getId()), "B", true), dto(UuidUtil.toString(a.getId()), "A", true)));

        assertThat(b.getSortOrder()).isZero();
        assertThat(a.getSortOrder()).isEqualTo(1);
    }

    @Test
    void anUnknownIdBecomesANewOption() {
        when(repository.findAllByOrderBySortOrderAsc()).thenReturn(List.of());

        options.replace(List.of(dto("not-ours", "Новая", true)));

        assertThat(saved).hasSize(1);
        assertThat(saved.get(0).getTitle()).isEqualTo("Новая");
    }
}
