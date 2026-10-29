package com.maxsolch.shop.inventory.domain;

import com.maxsolch.shop.platform.error.DomainException;

/**
 * Errors of the inventory module with a ready text (a customer text already taken from {@code Messages}, or an
 * admin-facing Russian one). One place instead of the deprecated {@code BadRequestException}; same HTTP status
 * and body as before.
 */
public final class InventoryErrors {

    private InventoryErrors() {
    }

    public static DomainException.BadRequest badRequest(String message) {
        return new DomainException.BadRequest(message);
    }

    public static DomainException.NotFound notFound(String message) {
        return new DomainException.NotFound(message);
    }
}
