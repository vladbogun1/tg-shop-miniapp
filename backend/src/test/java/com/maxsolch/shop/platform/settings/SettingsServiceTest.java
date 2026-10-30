package com.maxsolch.shop.platform.settings;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.audit.AdminAuditService;
import com.maxsolch.shop.platform.settings.SettingsDtos.SettingItemDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The settings contract: an empty table (or an unreadable one) means "behave like before", stored
 * values win, and a batch update is validated as a whole before anything is written.
 */
@ExtendWith(MockitoExtension.class)
class SettingsServiceTest {

    @Mock
    ShopSettingRepository repository;
    @Mock
    AdminAuditService audit;

    SettingsService service;

    @BeforeEach
    void setUp() {
        service = new SettingsService(repository, audit, new com.maxsolch.shop.platform.web.CurrentActor(),
                org.mockito.Mockito.mock(com.maxsolch.shop.platform.tx.DomainEvents.class), java.time.Clock.systemUTC());
        lenient().when(audit.currentAdminName()).thenReturn("Max");
    }

    private static ShopSetting row(String key, String value) {
        ShopSetting s = new ShopSetting();
        s.setKey(key);
        s.setValue(value);
        s.setType("INT");
        s.setUpdatedAt(Instant.parse("2026-10-01T10:00:00Z"));
        return s;
    }

    private static SettingDefinition def(String key) {
        return SettingsRegistry.find(key).orElseThrow();
    }

    @Test
    void emptyTableAnswersWithTheDefaults() {
        when(repository.findAll()).thenReturn(List.of());

        assertThat(service.getInt(SettingsRegistry.PROMO_HOLD_MINUTES)).isEqualTo(30);
        assertThat(service.getInt(SettingsRegistry.METRICS_LOW_STOCK_DAYS)).isEqualTo(14);
        assertThat(service.getInt(SettingsRegistry.METRICS_DEAD_STOCK_DAYS)).isEqualTo(60);
        assertThat(service.getInt(SettingsRegistry.CATALOG_LOW_STOCK_QTY)).isEqualTo(3);
        assertThat(service.getBool(SettingsRegistry.NOTIFY_CUSTOMER_STATUS)).isTrue();
        assertThat(service.get("anything.else", 7)).isEqualTo(7);
        assertThat(service.get("anything.else", "x")).isEqualTo("x");
    }

    @Test
    void storedValueWinsAndIsCached() {
        when(repository.findAll()).thenReturn(List.of(row(SettingsRegistry.PROMO_HOLD_MINUTES, "45")));

        assertThat(service.getInt(SettingsRegistry.PROMO_HOLD_MINUTES)).isEqualTo(45);
        assertThat(service.get(SettingsRegistry.PROMO_HOLD_MINUTES, 30)).isEqualTo(45);
        verify(repository, times(1)).findAll();
    }

    @Test
    void garbageInTheTableFallsBackToTheDefault() {
        when(repository.findAll()).thenReturn(List.of(
                row(SettingsRegistry.PROMO_HOLD_MINUTES, "half an hour"),
                row(SettingsRegistry.NOTIFY_CUSTOMER_STATUS, "maybe")));

        assertThat(service.getInt(SettingsRegistry.PROMO_HOLD_MINUTES)).isEqualTo(30);
        assertThat(service.getBool(SettingsRegistry.NOTIFY_CUSTOMER_STATUS)).isTrue();
    }

    @Test
    void unreadableTableMeansDefaultsNotAnError() {
        when(repository.findAll()).thenThrow(new RuntimeException("Table 'shop_settings' doesn't exist"));

        assertThat(service.getInt(SettingsRegistry.PROMO_HOLD_MINUTES)).isEqualTo(30);
    }

    @Test
    void updateSavesAuditsTheDiffAndDropsTheCache() {
        when(repository.findAll()).thenReturn(List.of());
        assertThat(service.getInt(SettingsRegistry.PROMO_HOLD_MINUTES)).isEqualTo(30);
        when(repository.findAllById(any())).thenReturn(List.of());

        Map<String, Object> changes = new HashMap<>();
        changes.put(SettingsRegistry.PROMO_HOLD_MINUTES, 45);
        service.update(changes);

        ArgumentCaptor<ShopSetting> saved = ArgumentCaptor.forClass(ShopSetting.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getKey()).isEqualTo(SettingsRegistry.PROMO_HOLD_MINUTES);
        assertThat(saved.getValue().getValue()).isEqualTo("45");
        assertThat(saved.getValue().getType()).isEqualTo("INT");
        assertThat(saved.getValue().getUpdatedByName()).isEqualTo("Max");
        verify(audit).record(eq("SETTINGS_UPDATE"), eq("SETTINGS"), isNull(),
                eq("«Резерв промокода»: 30 → 45"));
        // The cache was dropped: the response of update() was re-read from the DB.
        verify(repository, times(2)).findAll();
    }

    @Test
    void auditShowsTheLabelAndOnOffForSwitches() {
        when(repository.findAllById(any())).thenReturn(List.of(row(SettingsRegistry.REVIEWS_PREMODERATION, "true")));
        lenient().when(repository.findAll()).thenReturn(List.of());

        Map<String, Object> changes = new HashMap<>();
        changes.put(SettingsRegistry.REVIEWS_PREMODERATION, false);
        service.update(changes);

        ArgumentCaptor<String> details = ArgumentCaptor.forClass(String.class);
        verify(audit).record(eq("SETTINGS_UPDATE"), eq("SETTINGS"), isNull(), details.capture());
        assertThat(details.getValue())
                .doesNotContain(SettingsRegistry.REVIEWS_PREMODERATION)
                .endsWith(": вкл → выкл");
    }

    @Test
    void nullResetsToTheDefault() {
        ShopSetting stored = row(SettingsRegistry.PROMO_HOLD_MINUTES, "45");
        when(repository.findAllById(any())).thenReturn(List.of(stored));
        lenient().when(repository.findAll()).thenReturn(List.of());

        Map<String, Object> changes = new HashMap<>();
        changes.put(SettingsRegistry.PROMO_HOLD_MINUTES, null);
        service.update(changes);

        verify(repository).delete(stored);
        verify(repository, never()).save(any());
        verify(audit).record(eq("SETTINGS_UPDATE"), eq("SETTINGS"), isNull(), anyString());
    }

    @Test
    void unchangedValueWritesNothing() {
        when(repository.findAllById(any())).thenReturn(List.of(row(SettingsRegistry.PROMO_HOLD_MINUTES, "45")));
        lenient().when(repository.findAll()).thenReturn(List.of());

        service.update(Map.of(SettingsRegistry.PROMO_HOLD_MINUTES, 45));

        verify(repository, never()).save(any());
        verify(audit, never()).record(anyString(), anyString(), any(), anyString());
    }

    @Test
    void oneBadValueRejectsTheWholeBatch() {
        Map<String, Object> changes = new HashMap<>();
        changes.put(SettingsRegistry.CATALOG_LOW_STOCK_QTY, 5);
        changes.put(SettingsRegistry.PROMO_HOLD_MINUTES, 100_000);

        assertThatThrownBy(() -> service.update(changes))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("Резерв промокода")
                .hasMessageContaining("от 5 до 1440");
        verify(repository, never()).save(any());
        verify(repository, never()).delete(any());
    }

    @Test
    void unknownKeyIsRejected() {
        assertThatThrownBy(() -> service.update(Map.of("security.jwtSecret", "x")))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("security.jwtSecret");
        verify(repository, never()).save(any());
    }

    @Test
    void systemKeysAreNotEditable() {
        assertThatThrownBy(() -> service.update(Map.of("system.np.lastSyncAt", "x")))
                .isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void acquiringFeeIsNormalisedAndBounded() {
        var d = SettingsRegistry.find(SettingsRegistry.COSTING_ACQUIRING_FEE_PERCENT).orElseThrow();
        assertThat(SettingsService.normalize(d, "1,3")).isEqualTo("1.3");
        assertThat(SettingsService.normalize(d, " 2.50 ")).isEqualTo("2.5");
        assertThat(SettingsService.normalize(d, "0")).isEqualTo("0");
        assertThat(SettingsService.normalize(d, "10")).isEqualTo("10");
        assertThatThrownBy(() -> SettingsService.normalize(d, "10.1")).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, "-0.5")).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, "abc")).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, "1.3%")).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, 1.3)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void selectAcceptsOnlyTheListedValues() {
        var d = SettingsRegistry.find(SettingsRegistry.COSTING_DEFAULT_DISTRIBUTION).orElseThrow();
        assertThat(d.type()).isEqualTo(SettingType.SELECT);
        assertThat(d.options()).extracting(SettingDefinition.Option::label)
                .containsExactly("По стоимости", "По штукам", "По весу", "Вручную");
        assertThat(SettingsService.normalize(d, " by_qty ")).isEqualTo("BY_QTY");
        assertThatThrownBy(() -> SettingsService.normalize(d, "По штукам")).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, 5)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void normalizeInt() {
        SettingDefinition d = def(SettingsRegistry.METRICS_LOW_STOCK_DAYS);
        assertThat(SettingsService.normalize(d, 21)).isEqualTo("21");
        assertThat(SettingsService.normalize(d, 21L)).isEqualTo("21");
        assertThat(SettingsService.normalize(d, 21.0)).isEqualTo("21");
        assertThat(SettingsService.normalize(d, " 21 ")).isEqualTo("21");
        assertThatThrownBy(() -> SettingsService.normalize(d, 1.5)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, "abc")).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, 0)).isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, true)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void fiscalTaxCodesAcceptOnlyNumbers() {
        SettingDefinition d = def(SettingsRegistry.PAYMENT_FISCAL_TAX_CODES);
        assertThat(SettingsService.normalize(d, " 1, 2 ")).isEqualTo("1, 2");
        assertThat(SettingsService.normalize(d, "")).isEqualTo("");
        assertThatThrownBy(() -> SettingsService.normalize(d, "Без ПДВ"))
                .isInstanceOf(DomainException.BadRequest.class)
                .hasMessageContaining("числовые коды");
    }

    @Test
    void normalizeBool() {
        SettingDefinition d = def(SettingsRegistry.NOTIFY_CUSTOMER_STATUS);
        assertThat(SettingsService.normalize(d, false)).isEqualTo("false");
        assertThat(SettingsService.normalize(d, "TRUE")).isEqualTo("true");
        assertThatThrownBy(() -> SettingsService.normalize(d, 1)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void normalizeText() {
        SettingDefinition d = def(SettingsRegistry.BOT_START_TEXT_PREFIX + "uk");
        assertThat(SettingsService.normalize(d, "  Привіт!\r\nЛаскаво просимо  ")).isEqualTo("Привіт!\nЛаскаво просимо");
        assertThat(SettingsService.normalize(d, "")).isEmpty();
        assertThatThrownBy(() -> SettingsService.normalize(d, "x".repeat(2001)))
                .isInstanceOf(DomainException.BadRequest.class);
        assertThatThrownBy(() -> SettingsService.normalize(d, 5)).isInstanceOf(DomainException.BadRequest.class);
    }

    @Test
    void listShowsDefaultsAndOverrides() {
        when(repository.findAll()).thenReturn(List.of(row(SettingsRegistry.CATALOG_LOW_STOCK_QTY, "5")));

        List<SettingItemDto> items = service.list().items();

        SettingItemDto low = items.stream()
                .filter(i -> i.key().equals(SettingsRegistry.CATALOG_LOW_STOCK_QTY)).findFirst().orElseThrow();
        assertThat(low.value()).isEqualTo(5L);
        assertThat(low.defaultValue()).isEqualTo(3L);
        assertThat(low.overridden()).isTrue();
        SettingItemDto hold = items.stream()
                .filter(i -> i.key().equals(SettingsRegistry.PROMO_HOLD_MINUTES)).findFirst().orElseThrow();
        assertThat(hold.value()).isEqualTo(30L);
        assertThat(hold.overridden()).isFalse();
        // System bookkeeping never shows up in the editor.
        assertThat(items).noneMatch(i -> i.key().startsWith(SettingsRegistry.SYSTEM_PREFIX));
    }

    @Test
    void registryDefaultsAreValid() {
        for (SettingDefinition d : SettingsRegistry.all()) {
            Object typed = SettingsService.typed(d, d.defaultValue());
            assertThat(SettingsService.normalize(d, typed)).as(d.key()).isEqualTo(d.defaultValue());
        }
    }
}
