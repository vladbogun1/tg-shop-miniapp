package com.example.tgshop.api.dto;

import java.util.UUID;

public record ProductVariantDto(
    UUID id,
    String name,
    int stock
) {}
