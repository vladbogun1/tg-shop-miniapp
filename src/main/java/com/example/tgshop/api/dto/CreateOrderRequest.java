package com.example.tgshop.api.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record CreateOrderRequest(
    @NotBlank String initData,
    @NotBlank String customerName,
    @NotBlank String phone,
    @NotBlank String address,
    String comment,
    String promoCode,
    @NotEmpty List<Item> items
) {
  public record Item(@NotNull UUID productId, UUID variantId, @Min(1) int quantity) {}
}
