package com.maxsolch.shop.security;

import com.maxsolch.shop.web.controller.AdminReviewController;
import com.maxsolch.shop.web.controller.AdminTranslationController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.lang.reflect.Method;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * A {@link RequiredSuperAdmin} on a method must win over the {@link RequiredAdmin} on its class: a
 * plain admin gets through the class-level rule only for the methods that do not carry the stricter one.
 */
class SuperAdminMethodSecurityTest {

    static final AtomicBoolean SUPER = new AtomicBoolean();

    @RequiredAdmin
    public static class Sample {
        public String open() {
            return "ok";
        }

        @RequiredSuperAdmin
        public String strict() {
            return "ok";
        }
    }

    @Configuration
    @EnableMethodSecurity
    static class Config {
        @Bean
        Sample sample() {
            return new Sample();
        }

        @Bean("adminAccess")
        AdminAccess adminAccess() {
            return new AdminAccess(null) {
                @Override
                public boolean isSuperAdmin(Authentication authentication) {
                    return SUPER.get();
                }
            };
        }
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        SUPER.set(false);
    }

    private static void signIn() {
        AuthPrincipal p = new AuthPrincipal(1L, Role.ADMIN, 0, "web", "s", "t", Instant.now().plusSeconds(60));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                p, null, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));
    }

    @Test
    void methodLevelSuperAdminOverridesTheClassLevelAdmin() {
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext(Config.class)) {
            Sample sample = ctx.getBean(Sample.class);
            signIn();

            assertThat(sample.open()).isEqualTo("ok");
            assertThatThrownBy(sample::strict).isInstanceOf(AccessDeniedException.class);

            SUPER.set(true);
            assertThat(sample.strict()).isEqualTo("ok");
        }
    }

    @Test
    void theDeletesOfReviewsAndTranslationsCarryTheSuperAdminRule() throws Exception {
        Method review = AdminReviewController.class.getMethod("delete", long.class);
        assertThat(review.isAnnotationPresent(RequiredSuperAdmin.class)).isTrue();
        Method language = AdminTranslationController.class.getMethod("deleteLanguage", String.class, String.class,
                String.class);
        assertThat(language.isAnnotationPresent(RequiredSuperAdmin.class)).isTrue();
        Method oneEntity = AdminTranslationController.class.getMethod("delete", String.class, String.class,
                String.class, String.class);
        assertThat(oneEntity.isAnnotationPresent(RequiredSuperAdmin.class)).isFalse();
    }
}
