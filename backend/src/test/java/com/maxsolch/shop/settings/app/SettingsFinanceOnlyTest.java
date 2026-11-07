package com.maxsolch.shop.settings.app;

import com.maxsolch.shop.ai.app.AiSettings;
import com.maxsolch.shop.audit.app.AdminAuditService;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.error.PlatformError;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.platform.tx.DomainEvents;
import com.maxsolch.shop.platform.web.CurrentActor;
import com.maxsolch.shop.settings.infra.ShopSettingRepository;
import com.maxsolch.shop.settings.app.SettingsDtos.SettingItemDto;
import org.junit.jupiter.api.Test;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The owner's rule for the AI settings (07.11.2026): the group "ИИ" is for admins with the finance right only. An
 * ordinary admin neither sees its limits and prompts in the list nor can save them (the server decides, not the screen);
 * background code without an actor sees everything.
 */
class SettingsFinanceOnlyTest {

    private final ShopSettingRepository repository = mock(ShopSettingRepository.class);
    private final CurrentActor actor = mock(CurrentActor.class);
    private final AdminAccess access = mock(AdminAccess.class);
    private final SettingsService service = new SettingsService(AllSettings.catalog(), repository,
            mock(AdminAuditService.class), actor, access, mock(DomainEvents.class), Clock.systemUTC(),
            new ConcurrentMapCacheManager());

    private void asAdmin(boolean finance) {
        AuthPrincipal admin = new AuthPrincipal(5L, Role.ADMIN);
        when(actor.principalIfPresent()).thenReturn(Optional.of(admin));
        when(access.canSeeFinance(any(AuthPrincipal.class))).thenReturn(finance);
        when(repository.findAll()).thenReturn(List.of());
    }

    private static boolean hasAiItems(List<SettingItemDto> items) {
        return items.stream().anyMatch(i -> i.key().startsWith("ai."));
    }

    @Test
    void anOrdinaryAdminDoesNotSeeTheAiGroupNorItsKeys() {
        asAdmin(false);

        SettingsDtos.SettingsResponse out = service.list();

        assertThat(out.groups()).noneMatch(g -> g.id().equals(AiSettings.GROUP));
        assertThat(hasAiItems(out.items())).isFalse();
        assertThat(out.items()).isNotEmpty();
    }

    @Test
    void anAdminWithFinanceSeesTheAiGroup() {
        asAdmin(true);

        SettingsDtos.SettingsResponse out = service.list();

        assertThat(out.groups()).anyMatch(g -> g.id().equals(AiSettings.GROUP));
        assertThat(hasAiItems(out.items())).isTrue();
    }

    @Test
    void anOrdinaryAdminCannotSaveAnAiSetting() {
        asAdmin(false);

        assertThatThrownBy(() -> service.update(Map.of(AiSettings.MONTH_LIMIT_CENTS, 99999)))
                .isInstanceOfSatisfying(DomainException.Forbidden.class,
                        e -> assertThat(e.errorCode()).isEqualTo(PlatformError.FINANCE_ACCESS_DENIED));
        verify(repository, never()).save(any());
    }

    @Test
    void backgroundCodeWithoutAnActorSeesEverything() {
        when(actor.principalIfPresent()).thenReturn(Optional.empty());
        when(repository.findAll()).thenReturn(List.of());

        assertThat(hasAiItems(service.list().items())).isTrue();
    }
}
