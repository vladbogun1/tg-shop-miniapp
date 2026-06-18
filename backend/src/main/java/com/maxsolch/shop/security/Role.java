package com.maxsolch.shop.security;

/**
 * Application-level auth roles. Spring authorities are prefixed with {@code ROLE_}.
 */
public enum Role {
    CUSTOMER,
    ADMIN;

    public String authority() {
        return "ROLE_" + name();
    }
}
