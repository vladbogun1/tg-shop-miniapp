package com.maxsolch.shop.security;

import org.springframework.security.access.prepost.PreAuthorize;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * An ADMIN token whose admin is {@code SUPER_ADMIN} right now (read from the database on every
 * request through {@link AdminAccess}, so a demotion takes effect on the next request). Guards the
 * «Админы» section ({@code /api/admin/admins/**}: invitations, roles, resets, blocks); everything
 * else in the panel stays open to every admin.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasRole('ADMIN') and @adminAccess.isSuperAdmin(authentication)")
public @interface RequiredSuperAdmin {
}
