package com.maxsolch.shop.catalog.api;

import com.maxsolch.shop.domain.AdminRole;
import com.maxsolch.shop.domain.AdminUser;
import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AdminAccess;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.RequiredAdmin;
import com.maxsolch.shop.platform.security.Role;
import com.maxsolch.shop.repository.AdminUserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Rules of the catalog/translation admin that depend on a request parameter and therefore cannot be a method
 * annotation: {@code force=1} on deleting a characteristic and a blank {@code entityId} on deleting translations.
 * A plain admin gets 403 with the same text as before the check moved from the controller into the use case.
 */
class AdminForcedActionsRightsTest {

    static final long ADMIN_ID = 7L;

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    static void signIn() {
        AuthPrincipal p = new AuthPrincipal(ADMIN_ID, Role.ADMIN, 0, "web", "s", "t", Instant.now().plusSeconds(60));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                p, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
    }

    static AdminAccess access(AdminRole role) {
        AdminUserRepository repo = org.mockito.Mockito.mock(AdminUserRepository.class);
        AdminUser u = new AdminUser();
        u.setRole(role);
        org.mockito.Mockito.when(repo.findByTelegramUserIdAndActiveTrue(ADMIN_ID)).thenReturn(Optional.of(u));
        return new AdminAccess(repo);
    }


    static boolean forceDeleteAttribute(AdminAccess access) {
        var attributes = mock(com.maxsolch.shop.catalog.app.SpecAttributeAdminService.class);
        when(attributes.delete("id", true)).thenReturn("key");
        var scenario = new com.maxsolch.shop.catalog.app.AdminCatalog(null, null, attributes, null, null,
                mock(com.maxsolch.shop.platform.audit.AdminAuditService.class),
                mock(com.maxsolch.shop.site.app.SiteRevalidator.class), access,
                new com.maxsolch.shop.platform.web.CurrentActor());
        scenario.deleteAttribute("id", true);
        return true;
    }

    static boolean blankEntityDelete(AdminAccess access) {
        var upkeep = mock(com.maxsolch.shop.translation.app.TranslationAdminService.class);
        var scenario = new com.maxsolch.shop.translation.app.AdminTranslations(null, null, upkeep,
                mock(com.maxsolch.shop.platform.audit.AdminAuditService.class),
                mock(com.maxsolch.shop.site.app.SiteRevalidator.class), access,
                new com.maxsolch.shop.platform.web.CurrentActor());
        scenario.delete("uk", null, " ", null);
        return true;
    }

    @Test
    void forcedDeletionOfACharacteristicIsForSuperAdminOnly() {
        signIn();
        assertThatThrownBy(() -> forceDeleteAttribute(access(AdminRole.ADMIN)))
                .isInstanceOf(DomainException.Forbidden.class)
                .hasMessage("Принудительное удаление характеристики — только главный админ");
        assertThat(forceDeleteAttribute(access(AdminRole.SUPER_ADMIN))).isTrue();
    }

    @Test
    void deletingTheTranslationsOfAWholeLanguageViaBlankEntityIdIsForSuperAdminOnly() {
        signIn();
        assertThatThrownBy(() -> blankEntityDelete(access(AdminRole.ADMIN)))
                .isInstanceOf(DomainException.Forbidden.class)
                .hasMessage("Удаление переводов целого языка — только главный админ");
        assertThat(blankEntityDelete(access(AdminRole.SUPER_ADMIN))).isTrue();
    }

    @Test
    void theControllersStayAdminOnly() {
        assertThat(AdminCatalogController.class.isAnnotationPresent(RequiredAdmin.class)).isTrue();
        assertThat(AdminProductController.class.isAnnotationPresent(RequiredAdmin.class)).isTrue();
        assertThat(com.maxsolch.shop.translation.api.AdminTranslationController.class
                .isAnnotationPresent(RequiredAdmin.class)).isTrue();
        assertThat(com.maxsolch.shop.site.api.AdminSiteController.class
                .isAnnotationPresent(RequiredAdmin.class)).isTrue();
    }
}
