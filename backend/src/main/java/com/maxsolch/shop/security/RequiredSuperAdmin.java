package com.maxsolch.shop.security;

import org.springframework.security.access.prepost.PreAuthorize;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * An ADMIN token whose admin is {@code SUPER_ADMIN} right now (checked against the database through
 * {@link AdminAccess}, so a demotion takes effect within its cache window, not at token expiry).
 * For managing admins (stage 2: invitations, roles, 2FA resets of others); everything else in the
 * panel stays open to every admin.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@PreAuthorize("hasRole('ADMIN') and @adminAccess.isSuperAdmin(authentication)")
public @interface RequiredSuperAdmin {
}
