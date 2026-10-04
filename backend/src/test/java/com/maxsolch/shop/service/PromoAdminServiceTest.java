package com.maxsolch.shop.service;

import com.maxsolch.shop.common.UuidUtil;
import com.maxsolch.shop.domain.PromoCode;
import com.maxsolch.shop.repository.PromoCodeRepository;
import com.maxsolch.shop.web.BadRequestException;
import com.maxsolch.shop.web.dto.PromoCodeUpsertRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PromoAdminServiceTest {

    @Mock
    PromoCodeRepository repository;

    PromoAdminService service;
    PromoCode existing;
    String id;

    @BeforeEach
    void setUp() {
        service = new PromoAdminService(repository);
        existing = new PromoCode();
        existing.setId(UuidUtil.randomBytes());
        existing.setCode("SALE");
        existing.setDiscountPercent(10);
        id = UuidUtil.toString(existing.getId());
        lenient().when(repository.save(any(PromoCode.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void update_takesTheRowLock_soACheckoutsUseIsNotOverwritten() {
        existing.setUsesCount(4); // value under the lock: a checkout just counted a use
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        PromoAdminService.Updated r = service.update(id, req("SALE", 15, 0, 10));

        verify(repository).findByIdForUpdate(existing.getId());
        verify(repository, never()).findById(any());
        assertThat(r.promo().getUsesCount()).isEqualTo(4);
        assertThat(r.promo().getDiscountPercent()).isEqualTo(15);
    }

    @Test
    void usedCode_cannotBeRenamed() {
        existing.setUsesCount(1);
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.update(id, req("SALE2", 10, 0, null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("переименовать нельзя");
    }

    @Test
    void unusedCode_canBeRenamed() {
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));
        when(repository.findByCode("SALE2")).thenReturn(Optional.empty());

        PromoAdminService.Updated r = service.update(id, req("SALE2", 10, 0, null));

        assertThat(r.promo().getCode()).isEqualTo("SALE2");
        assertThat(r.previousCode()).isEqualTo("SALE");
    }

    @Test
    void zeroDiscount_isRejected() {
        assertThatThrownBy(() -> service.create(req("FREE", 0, 0, null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void requestValidation_catchesNonsense() {
        Validator v = Validation.buildDefaultValidatorFactory().getValidator();
        assertThat(v.validate(req("OK_1", 10, 0, null))).isEmpty();
        assertThat(v.validate(req("КОД-2", 10, 0, 5))).isEmpty();
        assertThat(v.validate(req("bad code", 10, 0, null))).isNotEmpty();
        assertThat(v.validate(req("X", 150, 0, null))).isNotEmpty();
        assertThat(v.validate(req("X", 0, -1, null))).isNotEmpty();
        assertThat(v.validate(req("X", 10, 0, 0))).isNotEmpty();
    }

    private static PromoCodeUpsertRequest req(String code, int percent, long amount, Integer maxUses) {
        return new PromoCodeUpsertRequest(code, percent, amount, maxUses, true);
    }
}
