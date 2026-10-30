package com.maxsolch.shop.platform.security;

import jakarta.servlet.Filter;

/**
 * A servlet filter that must run right after {@link JwtAuthFilter}, when the principal is known (for example the
 * customer's last visited place). {@link SecurityConfig} puts every such bean into the chain; a module that
 * contributes one also disables its automatic registration in the servlet container.
 */
public interface PostAuthenticationFilter extends Filter {
}
