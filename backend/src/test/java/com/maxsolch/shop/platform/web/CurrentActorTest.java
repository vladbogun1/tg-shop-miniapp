package com.maxsolch.shop.platform.web;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.platform.security.AuthPrincipal;
import com.maxsolch.shop.platform.security.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class CurrentActorTest {

    private final CurrentActor actor = new CurrentActor();

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void noPrincipalIsUnauthorizedWithoutCode() {
        assertThat(actor.isPresent()).isFalse();
        assertThatThrownBy(actor::principal).isInstanceOf(DomainException.Unauthorized.class)
                .satisfies(e -> assertThat(((DomainException) e).getCode()).isNull());
    }

    @Test
    void returnsPrincipalAndUserId() {
        AuthPrincipal p = new AuthPrincipal(42L, Role.ADMIN);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(p, null, List.of()));

        assertThat(actor.isPresent()).isTrue();
        assertThat(actor.userId()).isEqualTo(42L);
        assertThat(actor.principal()).isSameAs(p);
    }
}
