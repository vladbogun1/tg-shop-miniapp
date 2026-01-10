package com.example.tgshop.api.dto;

import java.util.List;
import java.util.UUID;

public record ProductDto(
    UUID id,
    String title,
    String description,
    long priceMinor,
    String currency,
    int stock,
    List<String> imageUrls,
    boolean active,
    boolean archived
) {}
