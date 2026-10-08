package com.maxsolch.shop.web.dto;

/**
 * One level of a product's category path, as the legacy {@code tags} field of the product DTOs
 * (catalog v2 keeps it so old clients keep working): {@code [root, leaf]}.
 */
public record TagDto(String id, String name, String slug, int sortOrder, boolean showInMenu) {
}
