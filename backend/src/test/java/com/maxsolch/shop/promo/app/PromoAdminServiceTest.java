package com.maxsolch.shop.promo.app;

import com.maxsolch.shop.platform.time.ShopZone;
import com.maxsolch.shop.platform.util.UuidUtil;
import com.maxsolch.shop.promo.domain.PromoCode;
import com.maxsolch.shop.promo.domain.PromoCodes;
import com.maxsolch.shop.promo.infra.PromoCodeRepository;
import com.maxsolch.shop.platform.error.DomainException;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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

    /** 2026-11-07 12:00 Kyiv (UTC+2). */
    static final Clock CLOCK = Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC);

    @Mock
    PromoCodeRepository repository;
    @Mock
    PromoUsage usage;

    PromoAdminService service;
    PromoCode existing;
    String id;

    @BeforeEach
    void setUp() {
        service = new PromoAdminService(repository, usage, CLOCK, new ShopZone("Europe/Kyiv"));
        existing = PromoCodes.promo().id(UuidUtil.randomBytes()).code("SALE").discountPercent(10).build();
        id = UuidUtil.toString(existing.getId());
        lenient().when(repository.save(any(PromoCode.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void update_takesTheRowLock_soACheckoutsUseIsNotOverwritten() {
        PromoCodes.with(existing, b -> b.usesCount(4)); // value under the lock: a checkout just counted a use
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        PromoAdminService.Updated r = service.update(id, req("SALE", 15, 0, 10));

        verify(repository).findByIdForUpdate(existing.getId());
        verify(repository, never()).findById(any());
        assertThat(r.promo().getUsesCount()).isEqualTo(4);
        assertThat(r.promo().getDiscountPercent()).isEqualTo(15);
    }

    @Test
    void usedCode_cannotBeDeleted() {
        PromoCodes.with(existing, b -> b.usesCount(2));
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.delete(id))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("можно только выключить")
                .extracting("code").isEqualTo("PROMO_USED");
        verify(repository, never()).delete(any(PromoCode.class));
    }

    @Test
    void codeReferencedByAnOrder_cannotBeDeletedEvenWithZeroUses() {
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));
        when(usage.usedInOrders("SALE")).thenReturn(true);

        assertThatThrownBy(() -> service.delete(id))
                .isInstanceOf(DomainException.BadRequest.class)
                .extracting("code").isEqualTo("PROMO_USED");
        verify(repository, never()).delete(any(PromoCode.class));
    }

    @Test
    void neverUsedCode_isDeleted() {
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        assertThat(service.delete(id)).isSameAs(existing);
        verify(repository).delete(existing);
    }

    @Test
    void usedCode_cannotBeRenamed() {
        PromoCodes.with(existing, b -> b.usesCount(1));
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.update(id, req("SALE2", 10, 0, null)))
                .isInstanceOf(DomainException.BadRequest.class)
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
                .isInstanceOf(DomainException.BadRequest.class);
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

    // ---- expiry ("Срок до")

    @Test
    void create_withExpiresOn_expiresAtTheEndOfThatShopDay() {
        PromoCode created = service.create(expiring("NEW1", "2026-11-30", null));

        // 23:59:59 Kyiv on 30 Nov (UTC+2 in winter).
        assertThat(created.getExpiresAt()).isEqualTo(Instant.parse("2026-11-30T21:59:59Z"));
    }

    @Test
    void create_withoutExpiry_isUnlimitedInTime() {
        assertThat(service.create(req("NEW2", 10, 0, null)).getExpiresAt()).isNull();
    }

    @Test
    void create_withPastDay_isRejected() {
        assertThatThrownBy(() -> service.create(expiring("NEW3", "2026-11-06", null)))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("Срок действия уже прошёл");
        verify(repository, never()).save(any());
    }

    @Test
    void create_withTodayAsLastDay_isAccepted() {
        assertThat(service.create(expiring("NEW4", "2026-11-07", null)).getExpiresAt())
                .isEqualTo(Instant.parse("2026-11-07T21:59:59Z"));
    }

    @Test
    void update_changesTheExpiry() {
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        PromoCode p = service.update(id, expiring("SALE", "2026-12-31", null)).promo();

        assertThat(p.getExpiresAt()).isEqualTo(Instant.parse("2026-12-31T21:59:59Z"));
    }

    @Test
    void update_withoutExpiryFields_keepsTheExpiry_caseAndReviewCodesStayIntact() {
        Instant caseExpiry = Instant.parse("2026-11-20T08:15:00Z");
        PromoCodes.with(existing, b -> b.expiresAt(caseExpiry).source(PromoCode.SOURCE_GIFT_CASE));
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        PromoCode p = service.update(id, req("SALE", 10, 0, null)).promo(); // the on/off switch sends no expiry

        assertThat(p.getExpiresAt()).isEqualTo(caseExpiry);
    }

    @Test
    void update_noExpiry_removesTheExpiry() {
        PromoCodes.with(existing, b -> b.expiresAt(Instant.parse("2026-11-20T08:15:00Z")));
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        PromoCode p = service.update(id, expiring("SALE", null, true)).promo();

        assertThat(p.getExpiresAt()).isNull();
    }

    @Test
    void update_sameDayOfAnExpiredCode_isNotAnError_butAnotherPastDayIs() {
        Instant lapsed = Instant.parse("2026-11-01T21:59:59Z"); // end of 1 Nov Kyiv
        PromoCodes.with(existing, b -> b.expiresAt(lapsed));
        when(repository.findByIdForUpdate(existing.getId())).thenReturn(Optional.of(existing));

        assertThat(service.update(id, expiring("SALE", "2026-11-01", null)).promo().getExpiresAt()).isEqualTo(lapsed);
        assertThatThrownBy(() -> service.update(id, expiring("SALE", "2026-10-30", null)))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void expiresOn_mustBeADate() {
        Validator v = Validation.buildDefaultValidatorFactory().getValidator();
        assertThat(v.validate(expiring("OK", "2026-11-30", null))).isEmpty();
        assertThat(v.validate(expiring("OK", "30.11.2026", null))).isNotEmpty();
    }

    private static PromoCodeUpsertRequest expiring(String code, String expiresOn, Boolean noExpiry) {
        return new PromoCodeUpsertRequest(code, 10, 0, null, true, null, expiresOn, noExpiry);
    }

    private static PromoCodeUpsertRequest req(String code, int percent, long amount, Integer maxUses) {
        return new PromoCodeUpsertRequest(code, percent, amount, maxUses, true);
    }
}
