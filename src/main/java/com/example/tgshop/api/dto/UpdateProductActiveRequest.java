package com.example.tgshop.api.dto;

import jakarta.validation.constraints.NotNull;

public record UpdateProductActiveRequest(@NotNull Boolean active) {}
