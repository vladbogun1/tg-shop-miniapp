package com.maxsolch.shop.security;

import org.springframework.security.access.prepost.PreAuthorize;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks an endpoint (or controller) as requiring an ADMIN-role JWT.
 * Meta-annotated with {@link PreAuthorize} — requires {@code @EnableMethodSecurity}.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasRole('ADMIN')")
public @interface RequiredAdmin {
}
