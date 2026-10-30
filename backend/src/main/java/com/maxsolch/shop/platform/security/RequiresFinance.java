package com.maxsolch.shop.platform.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * «Финансы»: purchase prices, batch expenses and margin — the main admin, or an admin he gave the right. Put on an
 * endpoint (or a controller) next to {@link RequiredAdmin}; {@link FinanceGuard} checks it before the method runs, reading
 * the right from the database on every request. An admin without it gets 403 with the finance text
 * ({@code PlatformError.FINANCE_ACCESS_DENIED}); any other token the generic refusal, as for {@link RequiredAdmin}.
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresFinance {
}
